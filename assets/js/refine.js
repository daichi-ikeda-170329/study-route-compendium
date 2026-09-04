/**
 * 診断のあとに出す、任意の追加質問。
 *
 * **既存の診断（QUIZ）と共有 URL の仕組みには触らない。**
 * これは結果の**後ろ**に置く独立した層で、閉じても飛ばしても、
 * 出てくる結果と共有 URL は 1 文字も変わらない。
 *
 * ## 何を聞き、何を変えるか
 *
 * | 質問 | 反映先 | 条件 |
 * |---|---|---|
 * | 平日・休日に使える時間、締切 | 学習ペース（RTPace） | 明示的に反映する |
 * | いま学習中の参考書と進み具合 | 学習の記録（RTProgress）と残り時間 | 入力されたときだけ |
 *
 * **集めるだけで結果が変わらない質問は作らない。** どの回答が何を変えたかは
 * 下の「反映したこと」に必ず出す。
 *
 * ## 聞かないことと、その理由
 *
 * 実装指示書は「苦手分野 → 優先補強候補」と「学校教材との重複」も挙げているが、
 * **どちらも人手で確かめた対応表がこのリポジトリに無い。**
 * 対応表なしに出すと、分野名から教材を機械的に結び付けた推測になる。
 * 難易度や適性を推測しないという方針に反するので、質問そのものを出さない。
 * 対応表（分野 → 教材、学校教材 → 同等の市販教材）を人が作って
 * `build/data/` へ置いたら、そのときに足す。
 *
 * ## 出さないもの
 *
 * 追加回答は **URL にも解析にも入れない。** 保存先は学習ペースと学習の記録で、
 * どちらもこの端末の中だけ。共有 URL に載るのは基礎診断の回答だけである。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var MOUNT_CLASS = 'rt-refine';
  var LIVE_ID = 'rtRefineLive';

  /** 書籍 ID として受け付ける形。ページが作った markup 由来でも必ず検査する */
  var ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function live() {
    var n = doc.getElementById(LIVE_ID);
    if (n) return n;
    n = el('div');
    n.id = LIVE_ID;
    n.setAttribute('role', 'status');
    n.setAttribute('aria-live', 'polite');
    n.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    doc.body.appendChild(n);
    return n;
  }

  function say(text) {
    var n = live();
    n.textContent = '';
    n.textContent = text;
  }

  /**
   * いま画面に出ているルート上の参考書を集める。
   *
   * 1. ルートが描かれていれば、その節（data-book-id を持つ）から取る
   * 2. まだなら、結果画面に並んでいる候補の onclick から id を拾う
   *    （このサイト自身が作った markup だが、**形は必ず検査する**）
   */
  function routeBooks() {
    var out = [];
    var seen = {};
    var push = function (subjectId, bookId, name) {
      if (!subjectId || !bookId || !ID_RE.test(bookId)) return;
      var k = subjectId + ':' + bookId;
      if (seen[k]) return;
      seen[k] = true;
      out.push({ subjectId: subjectId, bookId: bookId, name: name || bookId });
    };

    var nodes = doc.querySelectorAll('#routeOutput .climb-node[data-book-id]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var h = n.querySelector('.cn-info h3, .cn-info h4');
      push(n.getAttribute('data-subject-id'), n.getAttribute('data-book-id'), h ? h.textContent : null);
    }
    if (out.length) return out;

    var subjectId = (global.RT_SUBJECT_ASSETS && global.RT_SUBJECT_ASSETS.subject) || null;
    var opts = doc.querySelectorAll('#quizShell .opt-list .opt[onclick]');
    for (var j = 0; j < opts.length; j++) {
      var m = /openModal\('([^']+)'\)/.exec(opts[j].getAttribute('onclick') || '');
      if (!m) continue;
      var b = opts[j].querySelector('.opt__txt b');
      push(subjectId, m[1], b ? b.textContent : null);
    }
    return out;
  }

  /* ============================================================
     反映したことの説明

     **集めるだけで結果が変わらない質問は作らない。**
     何を変えたかを、変えるたびにここへ書く。
     ============================================================ */

  function renderApplied(box, lines) {
    var old = box.querySelector('.rt-refine__applied');
    if (old) old.remove();
    if (!lines.length) return;
    var d = el('div', 'rt-refine__applied');
    d.appendChild(el('b', null, '反映したこと'));
    var ul = el('ul');
    lines.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    d.appendChild(ul);
    box.appendChild(d);
  }

  /* ============================================================
     質問 1 — 使える時間と締切（学習ペースへ反映）
     ============================================================ */

  function sectionPace(box, applied, refresh) {
    var P = global.RTPace;
    if (!P || !P.__test || !P.__test.HOURS) return null;

    var sec = el('section', 'rt-refine__sec');
    sec.appendChild(el('h4', null, '1日に使える時間'));
    sec.appendChild(el('p', 'rt-refine__note',
      '答えると、ルートの「残り時間」と完了の目安がこの時間で計算し直されます。答えなくても結果は変わりません。'));

    var row = el('div', 'rt-refine__row');
    var mk = function (labelText, id, cur, onChange) {
      var lab = el('label', null, labelText);
      lab.setAttribute('for', id);
      var sel = el('select');
      sel.id = id;
      P.__test.HOURS.forEach(function (h) {
        var o = el('option', null, h + ' 時間');
        o.value = String(h);
        if (h === cur) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { onChange(sel.value); });
      row.appendChild(lab);
      row.appendChild(sel);
    };

    var st = P.__test.state;
    mk('平日', 'rtRefineWeekday', st.weekday, function (v) {
      P.setWeekday(v);
      applied.pace = '平日に使える時間を ' + v + ' 時間として、残り時間と完了の目安を計算し直しました。';
      say(applied.pace);
      refresh();
    });
    mk('休日', 'rtRefineWeekend', st.weekend, function (v) {
      P.setWeekend(v);
      applied.pace2 = '休日に使える時間を ' + v + ' 時間として計算し直しました。';
      say(applied.pace2);
      refresh();
    });

    var dlLab = el('label', null, '目標時期');
    dlLab.setAttribute('for', 'rtRefineDeadline');
    var dl = el('select');
    dl.id = 'rtRefineDeadline';
    Object.keys(P.__test.DEADLINES).forEach(function (k) {
      var o = el('option', null, P.__test.DEADLINES[k].label);
      o.value = k;
      if (k === st.deadline) o.selected = true;
      dl.appendChild(o);
    });
    dl.addEventListener('change', function () {
      P.setDeadline(dl.value);
      applied.deadline = '目標時期を「' + P.__test.DEADLINES[dl.value].label + '」として計算し直しました。';
      say(applied.deadline);
      refresh();
    });
    row.appendChild(dlLab);
    row.appendChild(dl);

    sec.appendChild(row);
    return sec;
  }

  /* ============================================================
     質問 2 — いま学習中の参考書（学習の記録へ反映）
     ============================================================ */

  function sectionProgress(box, applied, refresh) {
    var P = global.RTProgress;
    if (!P) return null;
    var books = routeBooks();
    if (!books.length) return null;

    var sec = el('section', 'rt-refine__sec');
    sec.appendChild(el('h4', null, 'いま学習中の参考書'));
    sec.appendChild(el('p', 'rt-refine__note',
      'ルートに出ている参考書のうち、もう進めているものがあれば選んでください。'
      + '進み具合を入れると、その分だけ残り時間から差し引きます。'
      + '入れないときは、まるごと残っているものとして数えます。'));

    var lab = el('label', null, '参考書');
    lab.setAttribute('for', 'rtRefineBook');
    var sel = el('select');
    sel.id = 'rtRefineBook';
    var none = el('option', null, '選ばない');
    none.value = '';
    sel.appendChild(none);
    books.forEach(function (b) {
      var o = el('option', null, b.name);
      o.value = b.subjectId + ':' + b.bookId;
      sel.appendChild(o);
    });

    var pctLab = el('label', null, '進み');
    pctLab.setAttribute('for', 'rtRefinePct');
    var pct = el('input');
    pct.type = 'number';
    pct.id = 'rtRefinePct';
    pct.min = '0';
    pct.max = '100';
    pct.step = '1';
    pct.inputMode = 'numeric';
    pct.placeholder = '任意';

    var btn = el('button', 'rt-refine__btn', 'この内容で反映する');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      if (!sel.value) { say('参考書が選ばれていません。'); return; }
      var parts = sel.value.split(':');
      var v = parseInt(pct.value, 10);
      var patch = { status: 'in_progress' };
      if (v >= 0 && v <= 100) patch.progressPercent = v;
      var r = P.set(parts[0], parts.slice(1).join(':'), patch);
      var name = sel.options[sel.selectedIndex].textContent;
      applied.progress = r.ok
        ? '「' + name + '」を学習中として記録しました。'
          + (patch.progressPercent !== undefined
            ? '進み ' + patch.progressPercent + '% の分を残り時間から差し引いています。'
            : '進み具合を入れていないので、残り時間は減らしていません。')
        : '「' + name + '」の記録を保存できませんでした。';
      say(applied.progress);
      refresh();
    });

    var row = el('div', 'rt-refine__row');
    row.appendChild(lab);
    row.appendChild(sel);
    row.appendChild(pctLab);
    row.appendChild(pct);
    row.appendChild(btn);
    sec.appendChild(row);
    return sec;
  }

  /* ============================================================
     組み立て
     ============================================================ */

  function build() {
    var applied = {};
    var wrap = el('div', MOUNT_CLASS);

    var details = el('details');
    var summary = el('summary', 'rt-refine__summary', '結果をもう少し自分向けに調整する（任意）');
    details.appendChild(summary);

    var body = el('div', 'rt-refine__body');
    body.appendChild(el('p', 'rt-refine__lead',
      'ここから先は答えても答えなくてもかまいません。閉じても、上に出ている結果と共有リンクは変わりません。'));

    var refresh = function () {
      renderApplied(body, Object.keys(applied).sort().map(function (k) { return applied[k]; }));
      if (global.RTPace && typeof global.RTPace.apply === 'function') {
        try { global.RTPace.apply(); } catch (e) { /* ルートが出ていない画面では何もしない */ }
      }
    };

    var pace = sectionPace(body, applied, refresh);
    if (pace) body.appendChild(pace);
    var prog = sectionProgress(body, applied, refresh);
    if (prog) body.appendChild(prog);

    if (!pace && !prog) return null;   // 聞けることが何も無いなら出さない

    body.appendChild(el('p', 'rt-refine__note',
      'ここで答えた内容と学習の記録は、この端末の中だけに残ります。'
      + '共有リンクにも解析にも入りません。'));

    details.appendChild(body);
    wrap.appendChild(details);
    return wrap;
  }

  /**
   * 結果画面の共有ブロックの**後ろ**へ差し込む。
   * すでに入っていれば何もしない（描き直しのたびに増やさない）。
   */
  function mount() {
    var shell = doc.getElementById('quizShell');
    if (!shell) return;
    if (shell.querySelector('.' + MOUNT_CLASS)) return;
    var hero = shell.querySelector('.result-hero');
    if (!hero) return;   // まだ結果が出ていない

    var box = build();
    if (!box) return;
    var share = shell.querySelector('.rt-share');
    if (share && share.parentNode) share.parentNode.insertBefore(box, share.nextSibling);
    else hero.appendChild(box);
  }

  function init() {
    mount();
    /* 結果は描き直される。増えたときにも差し込む */
    if (global.MutationObserver) {
      var target = doc.getElementById('quizShell') || doc.body;
      new global.MutationObserver(function () { mount(); }).observe(target, { childList: true, subtree: true });
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  global.RTRefine = { mount: mount, routeBooks: routeBooks };
})(typeof window !== 'undefined' ? window : globalThis);
