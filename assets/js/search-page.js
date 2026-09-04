/**
 * `/search/` の画面。絞り込みの規則そのものは `assets/js/search-core.js` にある。
 *
 * **文字列は `textContent` で入れる。** `innerHTML` を使わない。
 * **検索語を解析へ送らない。** このファイルから `RTAnalytics` を呼ばない。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var C = global.RTSearchCore;
  if (!doc || !C) return;

  var INDEX_URL = '/assets/generated/search-facets.json';
  var PAGE = 40;               // 一度に出す件数
  var SCHEMA = 2;

  var index = null;
  var query = C.emptyQuery();
  var shown = PAGE;
  var sortMode = 'diff';

  var el = function (id) { return doc.getElementById(id); };

  function empty(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function make(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function say(text) {
    var s = el('sfStatus');
    if (!s) return;
    empty(s);
    if (text) s.appendChild(make('p', null, text));
  }

  /* ============================================================
     絞り込みの選択肢
     ============================================================ */

  /**
   * 1 つの絞り込みを描く。
   * @param {string} key query のキー
   * @param {string} legend 見出し
   * @param {Array} options [{value, label}]
   * @param {string|null} unknownLabel 欠損を選ぶ項目の表示。null なら出さない
   */
  function facet(key, legend, options, unknownLabel) {
    var fs = make('fieldset', 'sf-group');
    fs.appendChild(make('legend', null, legend));
    var box = make('div', 'sf-opts');

    var add = function (value, label, isUnknown) {
      var id = 'sf-' + key + '-' + String(value).replace(/[^A-Za-z0-9_-]/g, '_');
      var lab = make('label', 'sf-opt' + (isUnknown ? ' sf-opt--unknown' : ''));
      lab.setAttribute('for', id);
      var cb = doc.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = value;
      cb.checked = query[key].indexOf(value) >= 0;
      cb.addEventListener('change', function () {
        var at = query[key].indexOf(value);
        if (cb.checked && at < 0) query[key].push(value);
        if (!cb.checked && at >= 0) query[key].splice(at, 1);
        shown = PAGE;
        renderResults();
      });
      lab.appendChild(cb);
      lab.appendChild(make('span', null, label));
      box.appendChild(lab);
    };

    options.forEach(function (o) { add(o.value, o.label, false); });
    if (unknownLabel) add(C.UNKNOWN, unknownLabel, true);

    fs.appendChild(box);
    return fs;
  }

  function renderFacets() {
    var box = el('sfFacets');
    empty(box);

    box.appendChild(facet('subjects', '科目',
      index.subjects.map(function (s) { return { value: s.id, label: s.label }; }), null));

    box.appendChild(facet('stages', '役割・段階',
      stageOptions(), '役割が未設定'));

    box.appendChild(facet('diffBands', '難易度帯',
      index.diffBands.map(function (b) { return { value: b.id, label: b.label }; }),
      '難易度が不明・確認中'));

    box.appendChild(facet('statuses', '情報の確認状態',
      Object.keys(index.statusLabel).map(function (k) {
        return { value: k, label: index.statusLabel[k] };
      }), null));

    box.appendChild(facet('yearBands', '刊行年',
      index.yearBands.map(function (b) { return { value: b.id, label: b.label }; }),
      '刊行年が不明'));

    box.appendChild(facet('publishers', '出版社',
      index.publishers.map(function (p) { return { value: p, label: p }; }), '出版社が不明'));

    box.appendChild(facet('authors', '著者',
      index.authors.map(function (a) { return { value: a, label: a }; }),
      '著者が分かっていない'));
  }

  /** 索引に実際に出てくる役割コードだけを選択肢にする */
  function stageOptions() {
    var seen = {};
    var out = [];
    index.books.forEach(function (b) {
      if (!b.stage || seen[b.stage]) return;
      seen[b.stage] = true;
      out.push({ value: b.stage, label: b.stage });
    });
    return out.sort(function (a, b) { return a.label.localeCompare(b.label, 'ja'); });
  }

  /* ============================================================
     結果
     ============================================================ */

  function card(b) {
    var subject = index.subjects[b.s] || { id: '', label: '' };
    var box = make('article', 'sf-card');

    var h = make('h3', 'sf-card__name');
    var a = make('a', null, b.n);
    a.href = '/' + subject.id + '/books/' + b.id + '/';
    h.appendChild(a);
    box.appendChild(h);

    var meta = make('div', 'sf-meta');
    var add = function (label, value, unknownText) {
      var d = make('span');
      d.appendChild(make('b', null, label + ' '));
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
        d.appendChild(make('span', 'sf-unknown', unknownText || '不明・確認中'));
      } else {
        d.appendChild(doc.createTextNode(Array.isArray(value) ? value.join('・') : String(value)));
      }
      meta.appendChild(d);
    };

    add('科目', subject.label);
    add('出版社', b.pub);
    add('著者', b.au, '分かっていない');
    if (b.sub) add('分野', b.sub);
    add('難易度', b.diff === null ? null : b.diff + ' / 10');
    add('目安偏差値', b.hen ? (b.hen[0] === 0 ? '〜' + b.hen[1] : b.hen[0] + '〜' + b.hen[1]) : null, '数値で書いていない');
    add('刊行年', b.year);
    if (b.ser) add('シリーズ', b.ser);
    box.appendChild(meta);

    var badge = make('span', 'sf-badge', index.statusLabel[b.vs] || b.vs);
    badge.setAttribute('data-v', b.vs);
    var row = make('div', 'sf-meta');
    row.appendChild(badge);
    if (b.rt === 'routePlaceholder') {
      row.appendChild(make('span', 'sf-unknown', 'ルート上の枠（特定の商品ではありません）'));
    }
    box.appendChild(row);

    return box;
  }

  function renderResults() {
    var r = C.filterBooks(index, query);
    var sorted = C.sortBooks(r.books, sortMode);

    var headEl = el('sfResultsHead');
    empty(headEl);
    headEl.appendChild(doc.createTextNode(sorted.length + ' 冊'));
    if (sorted.length !== r.total) {
      headEl.appendChild(doc.createTextNode('（全 ' + r.total + ' 冊のうち）'));
    }

    var box = el('sfResults');
    empty(box);
    if (!sorted.length) {
      box.appendChild(make('p', 'sf-empty',
        '条件に合う参考書がありませんでした。絞り込みを減らすか、書名の一部だけで探してみてください。'));
    } else {
      sorted.slice(0, shown).forEach(function (b) { box.appendChild(card(b)); });
    }

    var more = el('sfMore');
    empty(more);
    if (sorted.length > shown) {
      var btn = make('button', 'sf-btn', 'つづきを見る（残り ' + (sorted.length - shown) + ' 冊）');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        shown += PAGE;
        renderResults();
        say('つづきを表示しました。');
      });
      more.appendChild(btn);
    }

    /* 欠損がどれだけ含まれているかを出す。「結果に無い」と「分かっていない」は別物 */
    var u = r.unknownCounts;
    if (sorted.length && (u.authors || u.diffBands || u.yearBands)) {
      var note = make('p', 'sf-unknown',
        'このうち、著者が分かっていないもの ' + u.authors + ' 冊、'
        + '難易度が不明・確認中のもの ' + u.diffBands + ' 冊、'
        + '刊行年が不明のもの ' + u.yearBands + ' 冊を含みます。');
      more.appendChild(note);
    }

    say(sorted.length + ' 冊が該当しました。');
  }

  /* ============================================================
     読み込み
     ============================================================ */

  function load() {
    say('索引を読み込んでいます…');
    fetch(INDEX_URL, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json.schemaVersion !== SCHEMA) throw new Error('索引の版が違う（' + json.schemaVersion + '）');
        index = json;
        /* 検査から索引の中身を確かめられるようにする（画面では使わない）。
           「たまたま条件に当たった」ではなく、索引から選んだ条件で確かめるため */
        global.__rtSearchIndex = json;
        renderFacets();
        renderResults();
      })
      .catch(function (e) {
        var head = el('sfResultsHead');
        empty(head);
        head.appendChild(doc.createTextNode('索引を読み込めませんでした'));
        var box = el('sfResults');
        empty(box);
        var p = make('p', 'sf-empty', '通信の状態を確かめて、もう一度お試しください。');
        box.appendChild(p);
        var retry = make('button', 'sf-btn', 'もう一度読み込む');
        retry.type = 'button';
        retry.addEventListener('click', load);
        box.appendChild(retry);
        say('索引を読み込めませんでした。');
        if (global.console && console.warn) console.warn('search-page:', e && e.message);
      });
  }

  function wire() {
    var q = el('sfQuery');
    if (q) {
      var t = null;
      q.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          query.q = q.value;
          shown = PAGE;
          if (index) renderResults();
        }, 150);
      });
    }
    var sort = el('sfSort');
    if (sort) {
      sort.addEventListener('change', function () {
        sortMode = sort.value;
        if (index) renderResults();
      });
    }
    var reset = el('sfReset');
    if (reset) {
      reset.addEventListener('click', function () {
        query = C.emptyQuery();
        shown = PAGE;
        if (el('sfQuery')) el('sfQuery').value = '';
        if (index) { renderFacets(); renderResults(); }
        say('絞り込みを解除しました。');
      });
    }
    var form = el('sfPanel');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  function init() { wire(); load(); }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
