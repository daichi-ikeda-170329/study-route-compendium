/**
 * 書籍ページだけで動く小さな処理（2026-11-04〜）。生成は build/generate-books.mjs。
 *
 * 1. スマホの追従購入バー（.buybar）
 *    上部の購入ボタン（.buy--hero）が画面の上へ抜け、下部の購入ボタンがまだ見えていない
 *    あいだだけ、画面下に細いバーを出す。PC（760px 以上）では CSS で出さない。
 *    クリックの計測は assets/js/analytics.js の既存の仕組み（data-rt-buy と
 *    data-rt-placement="book_sticky"）にそのまま乗る。
 *
 * 2. 最近見た参考書
 *    <article data-rt-recent> の { id, sub, sj, n } と URL を、この端末の localStorage
 *    （キー rt:recent:v1）に新しい順で 12 件まで控える。サーバーにも解析にも送らない。
 *    ポータルの「最近見た参考書」（assets/js/recent.js）が読む。
 */
(function () {
  'use strict';

  /* ---------- 1. 追従購入バー ---------- */
  var bar = document.querySelector('.buybar');
  var hero = document.querySelector('.buy--hero');
  var foot = document.querySelector('.buy[data-rt-placement="book_footer"]');
  if (bar && hero && 'IntersectionObserver' in window) {
    var heroAbove = false, footVisible = false;
    var sync = function () {
      var on = heroAbove && !footVisible;
      bar.hidden = !on;
      document.body.classList.toggle('has-buybar', on);
    };
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { heroAbove = !e.isIntersecting && e.boundingClientRect.top < 0; });
      sync();
    }).observe(hero);
    if (foot) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { footVisible = e.isIntersecting; });
        sync();
      }).observe(foot);
    }
  }

  /* ---------- 2. 最近見た参考書 ---------- */
  var KEY = 'rt:recent:v1';
  var MAX = 12;
  var art = document.querySelector('[data-rt-recent]');
  if (!art) return;
  try {
    var me = JSON.parse(art.getAttribute('data-rt-recent'));
    if (!me || !me.id || !me.sub) return;
    me.u = location.pathname;
    me.t = Date.now();
    var list = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(list)) list = [];
    list = list.filter(function (x) { return x && !(x.id === me.id && x.sub === me.sub); });
    list.unshift(me);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch (e) { /* 保存できない環境（プライベートモードなど）では何もしない */ }
})();
