/**
 * 参考書 1 冊の状態を変える小さな操作部品。
 *
 * 置き場所は 2 つある。
 *
 *   1. 書籍ページ … テンプレートが `<div data-rt-progress data-subject-id data-book-id>` を置く
 *   2. 科目トップのルート … `.climb-node[data-book-id]` へ後から差し込む
 *
 * 2 を後から差し込むのは、ルートが描き直されるたびに HTML が作り直されるから。
 * 科目ごとの描画コード（`assets/js/subject-<科目>.js`）へ手を入れると 5 か所に
 * 同じものを書くことになり、必ずずれる。**差し込む側を 1 本にする。**
 *
 * ## 守ること
 *
 * - 文字列は `textContent` で入れる。`innerHTML` を使わない。
 * - `div` にクリックを付けない。`button` と `select` を使う。
 * - 状態が変わったら `aria-live` で伝える。
 * - **解析へ送らない。** ここから `RTAnalytics` を呼ばない。
 * - 状態を変えたら `RTPace.apply()` を呼び直して残り時間を合わせる。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var P = global.RTProgress;
  if (!doc || !P) return;

  var LIVE_ID = 'rtProgressLive';

  function live() {
    var n = doc.getElementById(LIVE_ID);
    if (n) return n;
    n = doc.createElement('div');
    n.id = LIVE_ID;
    n.setAttribute('role', 'status');
    n.setAttribute('aria-live', 'polite');
    /* 画面には出さないが、読み上げには届く。display:none にすると読まれない */
    n.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    doc.body.appendChild(n);
    return n;
  }

  function say(text) {
    var n = live();
    n.textContent = '';
    n.textContent = text;
  }

  /** 状態を変えたあとに、残り時間の表示を合わせ直す */
  function refreshPace() {
    if (global.RTPace && typeof global.RTPace.apply === 'function') {
      try { global.RTPace.apply(); } catch (e) { /* ルートが出ていない画面では何もしない */ }
    }
  }

  /**
   * 1 冊分の操作部品を作る。
   * @param {string} subjectId
   * @param {string} bookId
   * @param {string} bookName 読み上げ用。無ければ ID を使う
   * @param {boolean} compact ルートの中に置く小さい版か
   */
  function build(subjectId, bookId, bookName, compact) {
    var wrap = doc.createElement('div');
    wrap.className = 'rt-prog' + (compact ? ' rt-prog--compact' : '');

    var label = doc.createElement('label');
    label.className = 'rt-prog__label';
    var selId = 'rtProg-' + subjectId + '-' + bookId;
    label.setAttribute('for', selId);
    label.textContent = compact ? '状態' : 'この参考書の状態';

    var sel = doc.createElement('select');
    sel.className = 'rt-prog__sel';
    sel.id = selId;

    var none = doc.createElement('option');
    none.value = '';
    none.textContent = '記録しない';
    sel.appendChild(none);

    P.STATUS.forEach(function (s) {
      var o = doc.createElement('option');
      o.value = s;
      o.textContent = P.STATUS_LABEL[s];
      sel.appendChild(o);
    });

    var cur = P.get(subjectId, bookId);
    sel.value = cur ? cur.status : '';

    /* 進捗率。学習中のときだけ出す（それ以外では意味が無い） */
    var pctWrap = doc.createElement('span');
    pctWrap.className = 'rt-prog__pct';
    var pctLabel = doc.createElement('label');
    var pctId = selId + '-pct';
    pctLabel.setAttribute('for', pctId);
    pctLabel.textContent = '進み';
    var pct = doc.createElement('input');
    pct.type = 'number';
    pct.id = pctId;
    pct.min = '0';
    pct.max = '100';
    pct.step = '1';
    pct.inputMode = 'numeric';
    pct.className = 'rt-prog__num';
    pct.value = cur && typeof cur.progressPercent === 'number' ? String(cur.progressPercent) : '';
    var pctUnit = doc.createElement('span');
    pctUnit.textContent = '%';
    pctWrap.appendChild(pctLabel);
    pctWrap.appendChild(pct);
    pctWrap.appendChild(pctUnit);

    function syncPctVisible() {
      pctWrap.hidden = sel.value !== 'in_progress';
    }
    syncPctVisible();

    function save(msg) {
      var status = sel.value;
      var name = bookName || bookId;
      if (!status) {
        P.set(subjectId, bookId, { status: null });
        say(name + ' の記録を消しました。');
        syncPctVisible();
        refreshPace();
        return;
      }
      var patch = { status: status };
      if (status === 'in_progress') {
        var v = parseInt(pct.value, 10);
        patch.progressPercent = (v >= 0 && v <= 100) ? v : null;
      } else {
        patch.progressPercent = null;
      }
      var r = P.set(subjectId, bookId, patch);
      say(r.ok
        ? name + ' を「' + P.STATUS_LABEL[status] + '」にしました。' + (msg || '')
        : name + ' の記録を保存できませんでした。');
      syncPctVisible();
      refreshPace();
    }

    sel.addEventListener('change', function () { save(); });
    pct.addEventListener('change', function () { if (sel.value === 'in_progress') save(); });

    wrap.appendChild(label);
    wrap.appendChild(sel);
    wrap.appendChild(pctWrap);
    return wrap;
  }

  /** 書籍ページ側の置き場所 */
  function mountPlaceholders(root) {
    var list = (root || doc).querySelectorAll('[data-rt-progress]:not([data-rt-progress-ready])');
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var sub = n.getAttribute('data-subject-id');
      var id = n.getAttribute('data-book-id');
      if (!sub || !id) continue;
      n.setAttribute('data-rt-progress-ready', '1');
      n.appendChild(build(sub, id, n.getAttribute('data-book-name'), false));
    }
  }

  /** 科目トップのルート側。描き直されるたびに差し込む */
  function mountRouteNodes(root) {
    var list = (root || doc).querySelectorAll('.climb-node[data-book-id]:not([data-rt-progress-ready])');
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var info = n.querySelector('.cn-info');
      if (!info) continue;
      var sub = n.getAttribute('data-subject-id');
      var id = n.getAttribute('data-book-id');
      if (!sub || !id) continue;
      n.setAttribute('data-rt-progress-ready', '1');
      var nameEl = info.querySelector('h3, h4');
      var box = build(sub, id, nameEl ? nameEl.textContent : id, true);
      /* カード全体に openModal のクリックが付いているので、
         操作部品の中のクリックは外へ伝えない（押すたびにモーダルが開かないように） */
      box.addEventListener('click', function (e) { e.stopPropagation(); });
      box.addEventListener('keydown', function (e) { e.stopPropagation(); });
      info.appendChild(box);
    }
  }

  function mountAll() {
    mountPlaceholders(doc);
    mountRouteNodes(doc);
  }

  function init() {
    mountAll();
    /* ルートは描き直されるので、増えたノードにも差し込む。
       MutationObserver が使えない環境では最初の 1 回だけになる（壊れはしない） */
    if (global.MutationObserver) {
      var out = doc.getElementById('routeOutput') || doc.body;
      new global.MutationObserver(function () { mountRouteNodes(doc); }).observe(out, { childList: true, subtree: true });
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  global.RTProgressControl = { mountAll: mountAll, build: build };
})(typeof window !== 'undefined' ? window : globalThis);
