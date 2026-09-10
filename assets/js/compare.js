/**
 * 2 冊比較のページ（/compare/?a=<科目>:<id>&b=<科目>:<id>）の描画（仕様書 4.2）。
 *
 * データは科目トップと同じ配信アセット（core・books）を読む。取得先はページに埋めた
 * window.RT_COMPARE_ASSETS（build/generate-compare.mjs）。
 *
 * - a / b は `^[a-z]+:[a-z0-9-]+$` で、科目は RT_COMPARE_ASSETS にあるものだけを受ける。
 *   **URL の値をそのまま HTML に入れない。** 表示するのは取得したデータの文字列だけで、
 *   それも esc() を通す
 * - どちらかが無効（形が違う・本が無い）なら、2 冊を選ぶ空の状態を出す。
 *   候補はヘッダー検索と同じ索引（/assets/js/book-index.js）から引く
 * - 失敗しても console に例外を出さない（無効な URL は読者の入力ミスであって障害ではない）
 */
(function () {
  'use strict';

  var M = window.RT_COMPARE_ASSETS;
  var root = document.getElementById('cmpRoot');
  if (!M || !M.subjects || !root) return;

  var KEY_RE = /^[a-z]+:[a-z0-9-]+$/;
  var INDEX_SRC = '/assets/js/book-index.js';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** "english:rules4" → {dir, id}。受け付けない値なら null */
  function parseKey(v) {
    if (!v || !KEY_RE.test(v)) return null;
    var p = v.split(':');
    if (!Object.prototype.hasOwnProperty.call(M.subjects, p[0])) return null;
    return { dir: p[0], id: p[1] };
  }

  /* ---------- データ ---------- */

  var cache = {};
  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  /** 科目の {config, stages, books} */
  function subjectData(dir) {
    if (cache[dir]) return cache[dir];
    var s = M.subjects[dir];
    cache[dir] = Promise.all([fetchJson(s.core), fetchJson(s.books)]).then(function (r) {
      return { config: r[0].config || {}, stages: r[0].stages || {}, books: r[1].books || [] };
    });
    return cache[dir];
  }
  /** {dir, id} → {sub, d, book}。本が無ければ book は null */
  function resolve(key) {
    if (!key) return Promise.resolve(null);
    return subjectData(key.dir).then(function (d) {
      var book = null;
      for (var i = 0; i < d.books.length; i++) if (d.books[i].id === key.id) { book = d.books[i]; break; }
      return { key: key, sub: M.subjects[key.dir], d: d, book: book };
    });
  }

  /* ---------- 表 ---------- */

  function bookName(b) { return b.dn || b.name; }
  function isProv(b) { return b.provisional === true; }

  function amazonURL(b, cfg) {
    var tag = cfg.amazonTag ? cfg.amazonTag : '';
    if (b.recordType === 'routePlaceholder') {
      return 'https://www.amazon.co.jp/s?k=' + encodeURIComponent(b.official || b.name) + (tag ? '&tag=' + tag : '');
    }
    var k = b.isbn10 || b.asin;
    if (k) return 'https://www.amazon.co.jp/dp/' + k + '/ref=nosim' + (tag ? '?tag=' + tag : '');
    return 'https://www.amazon.co.jp/s?k=' + encodeURIComponent(b.official || b.name) + (tag ? '&tag=' + tag : '');
  }
  function rakutenURL(b, cfg) {
    if (!cfg.rakutenId) return '';
    var dest = 'https://search.rakuten.co.jp/search/mall/' + encodeURIComponent(b.isbn13 || b.name) + '/';
    return 'https://hb.afl.rakuten.co.jp/hgc/' + cfg.rakutenId + '/?pc=' + encodeURIComponent(dest) + '&m=' + encodeURIComponent(dest);
  }

  function cover(b) {
    var srcs = (window.RTCoverResolver && window.RTCoverResolver.coverSrcs)
      ? window.RTCoverResolver.coverSrcs(b, window.RT_COVER_POLICIES) : [];
    if (!srcs.length) return '<span class="cmpx__cov" aria-hidden="true"></span>';
    return '<span class="cmpx__cov"><img src="' + esc(srcs[0]) + '" alt="" loading="lazy" referrerpolicy="no-referrer" width="84" height="118"'
      + ' onerror="this.remove()" onload="if(this.naturalWidth<=1)this.remove()"></span>';
  }
  function bar(diff) {
    var out = '<span class="cmpx__bar" aria-hidden="true">';
    for (var i = 1; i <= 10; i++) out += '<i' + (i <= diff ? ' class="on"' : '') + '></i>';
    return out + '</span>';
  }
  function list(arr) {
    if (!arr || !arr.length) return '—';
    return '<ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  /** 1 冊ぶんの各行の中身 */
  function cells(x) {
    var b = x.book, d = x.d, cfg = d.config;
    var st = d.stages[b.stage] || {};
    var href = '/' + x.key.dir + '/books/' + b.id + '/';
    var rel = cfg.amazonTag ? 'nofollow sponsored noopener noreferrer' : 'nofollow noopener noreferrer';
    var rk = rakutenURL(b, cfg);
    return {
      cover: cover(b),
      name: '<span class="cmpx__name"><a href="' + esc(href) + '">' + esc(bookName(b)) + '</a></span><span class="cmpx__sub">' + esc(x.sub.full) + '</span>',
      pub: esc(b.pub || '—') + (b.year ? '／' + esc(b.year) + ' 年' : ''),
      role: esc(st.label || '—'),
      diff: isProv(b) ? '評価準備中' : bar(b.diff) + esc(b.diff) + ' / 10',
      hen: isProv(b) ? '評価準備中' : esc(b.hensachi || '—'),
      problems: esc(b.problems || '—'),
      hours: esc(b.hours || '—'),
      style: esc(b.style || '—'),
      bestFor: esc(b.bestFor || '—'),
      pros: list(b.pros),
      cons: list(b.cons),
      buy: '<span class="cmpx__buy"><a href="' + esc(amazonURL(b, cfg)) + '" target="_blank" rel="' + rel + '">Amazon で見る</a>'
        + (rk ? '<a href="' + esc(rk) + '" target="_blank" rel="nofollow sponsored noopener noreferrer">楽天ブックスで検索</a>' : '') + '</span>',
    };
  }

  var ROWS = [
    ['cover', '書影'], ['pub', '出版社・刊行年'], ['role', '役割'], ['diff', '難易度'],
    ['hen', '到達目安'], ['problems', '問題数・構成'], ['hours', '想定学習時間'], ['style', '形式'],
    ['bestFor', '向いている人'], ['pros', '強み'], ['cons', '注意点'], ['buy', '購入'],
  ];

  function renderTable(xa, xb) {
    var ca = cells(xa), cb = cells(xb);
    document.title = bookName(xa.book) + ' と ' + bookName(xb.book) + ' を比べる - ルート大全';
    root.innerHTML = '<div class="cmp-wrap" tabindex="0" role="region" aria-label="2 冊の比較（横にスクロールできます）">'
      + '<table class="cmpx"><thead><tr><th scope="col">項目</th><th scope="col">' + ca.name + '</th><th scope="col">' + cb.name + '</th></tr></thead><tbody>'
      + ROWS.map(function (r) { return '<tr><th scope="row">' + r[1] + '</th><td>' + ca[r[0]] + '</td><td>' + cb[r[0]] + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<p class="cmp-lead">リンクは広告リンクを含みます。紹介料の有無で掲載順や評価を変えることはありません。価格と在庫は販売サイトでご確認ください。</p>'
      + '<p class="cmp-lead"><a href="/compare/">別の 2 冊を選ぶ</a></p>';
  }

  /* ---------- 空の状態（2 冊を選ぶ） ---------- */

  var indexPromise = null;
  function loadIndex() {
    if (window.RT_BOOK_INDEX) return Promise.resolve(window.RT_BOOK_INDEX);
    if (indexPromise) return indexPromise;
    indexPromise = new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = INDEX_SRC;
      s.onload = function () { window.RT_BOOK_INDEX ? ok(window.RT_BOOK_INDEX) : ng(new Error('索引が空')); };
      s.onerror = function () { ng(new Error('索引を読めない')); };
      document.head.appendChild(s);
    });
    return indexPromise;
  }

  function renderPicker(initial, message) {
    var chosen = [initial[0], initial[1]];
    root.innerHTML = (message ? '<p class="cmp-msg">' + esc(message) + '</p>' : '')
      + '<div class="cmp-pick">'
      + [0, 1].map(function (i) {
        return '<div class="cmp-slot" data-slot="' + i + '"><h2>' + (i ? '2 冊目' : '1 冊目') + '</h2>'
          + '<label class="cmp-slot__lab" for="cmpQ' + i + '" style="display:block;font-size:12px;color:var(--muted);margin-top:6px">書名で探す</label>'
          + '<input type="search" id="cmpQ' + i + '" autocomplete="off" placeholder="例: ポレポレ">'
          + '<p class="cmp-slot__cur" id="cmpCur' + i + '"></p><div class="cmp-slot__hits" id="cmpHits' + i + '"></div></div>';
      }).join('')
      + '</div><button type="button" class="cmp-go" id="cmpGo" disabled>この 2 冊を比べる</button>';

    function showCur(i) {
      var el = document.getElementById('cmpCur' + i);
      el.textContent = chosen[i] ? '選んだ本: ' + chosen[i].label : '';
      document.getElementById('cmpGo').disabled = !(chosen[0] && chosen[1]);
    }
    showCur(0); showCur(1);

    loadIndex().then(function (idx) {
      var subs = idx.subjects || [];
      var books = idx.books || [];
      [0, 1].forEach(function (i) {
        var input = document.getElementById('cmpQ' + i);
        var hits = document.getElementById('cmpHits' + i);
        input.addEventListener('input', function () {
          var q = input.value.trim().toLowerCase();
          hits.innerHTML = '';
          if (!q) return;
          var found = books.filter(function (r) {
            return String(r[2]).toLowerCase().indexOf(q) >= 0 || String(r[5] || '').toLowerCase().indexOf(q) >= 0;
          }).slice(0, 8);
          found.forEach(function (r) {
            var sub = subs[r[0]] || [];
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = r[2] + '（' + (sub[1] || '') + '・' + r[3] + '）';
            btn.addEventListener('click', function () {
              chosen[i] = { key: sub[0] + ':' + r[1], label: r[2] };
              hits.innerHTML = '';
              input.value = '';
              showCur(i);
            });
            hits.appendChild(btn);
          });
        });
      });
    }, function () {
      var m = document.createElement('p');
      m.className = 'cmp-msg';
      m.textContent = '書名の索引を読み込めませんでした。時間をおいてもう一度お試しください。';
      root.appendChild(m);
    });

    document.getElementById('cmpGo').addEventListener('click', function () {
      if (!(chosen[0] && chosen[1])) return;
      location.search = '?a=' + encodeURIComponent(chosen[0].key) + '&b=' + encodeURIComponent(chosen[1].key);
    });
  }

  /* ---------- 起動 ---------- */

  var params = new URLSearchParams(location.search);
  var rawA = params.get('a'), rawB = params.get('b');
  var ka = parseKey(rawA), kb = parseKey(rawB);

  Promise.all([resolve(ka), resolve(kb)]).then(function (r) {
    var xa = r[0], xb = r[1];
    if (xa && xa.book && xb && xb.book) { renderTable(xa, xb); return; }
    var init = [xa && xa.book ? { key: ka.dir + ':' + ka.id, label: bookName(xa.book) } : null,
      xb && xb.book ? { key: kb.dir + ':' + kb.id, label: bookName(xb.book) } : null];
    var msg = (rawA || rawB) ? '指定された本が見つかりませんでした。比べる 2 冊を選んでください。' : '';
    renderPicker(init, msg);
  }, function () {
    renderPicker([null, null], 'データを読み込めませんでした。通信の状態を確かめて、もう一度お試しください。');
  });
})();
