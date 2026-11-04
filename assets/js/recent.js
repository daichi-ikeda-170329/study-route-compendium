/**
 * ポータルの「最近見た参考書」（2026-11-04〜）。
 * 書籍ページの assets/js/book-page.js が localStorage（rt:recent:v1）に控えたものを、
 * 新しい順に 6 件まで出す。保存も表示もこの端末の中だけで、サーバーにも解析にも送らない。
 * 1 件も無いとき・読めないときは節ごと隠れたまま（既定で hidden）。
 */
(function () {
  'use strict';
  var KEY = 'rt:recent:v1';
  var box = document.getElementById('recent');
  var list = document.getElementById('recentList');
  var clear = document.getElementById('recentClear');
  if (!box || !list) return;
  var SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];
  // 書籍ページの URL の形（/<科目>/books/<id>/）に合うものだけを出す。壊れた値でリンクを作らない
  items = items.filter(function (x) {
    return x && SAFE_ID.test(x.sub || '') && SAFE_ID.test(x.id || '') && typeof x.n === 'string';
  }).slice(0, 6);
  if (!items.length) return;
  list.innerHTML = items.map(function (x) {
    return '<li><a href="/' + x.sub + '/books/' + x.id + '/"><span>' + esc(x.sj || '') + '</span><b>' + esc(x.n) + '</b></a></li>';
  }).join('');
  box.hidden = false;
  if (clear) clear.addEventListener('click', function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* 消せなくても表示だけは閉じる */ }
    box.hidden = true;
  });
})();
