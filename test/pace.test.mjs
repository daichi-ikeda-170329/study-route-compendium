/**
 * ルートのペース計算のテスト。
 *
 *   node --test test/pace.test.mjs
 *
 * 画面から読み取る部分（DOM）はブラウザで確かめる。ここでは日程の計算だけを見る。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RTPace = createRequire(import.meta.url)(path.join(ROOT, 'assets/js/pace.js'));
const { schedule, examDate, defaultYear, label } = RTPace.__test;

const D = (y, m, d) => new Date(y, m - 1, d);
/** 日付の差（日） */
const days = (a, b) => Math.round((b - a) / 86400000);

/* ============================================================
   入試日と既定の受験年
   ============================================================ */

test('入試日は 1 月中旬に置く', () => {
  const e = examDate(2027);
  assert.equal(e.getFullYear(), 2027);
  assert.equal(e.getMonth(), 0);
  assert.equal(e.getDate(), 15);
});

test('既定の受験年は「次に来る入試」', () => {
  assert.equal(defaultYear(D(2026, 8, 27)), 2027, '夏なら翌年 1 月');
  assert.equal(defaultYear(D(2027, 1, 10)), 2027, '入試前なら その年');
  assert.equal(defaultYear(D(2027, 1, 20)), 2028, '入試を過ぎたら 翌年');
});

/* ============================================================
   表示
   ============================================================ */

test('日付は旬で丸める', () => {
  assert.equal(label(D(2026, 10, 1)), '2026年10月上旬');
  assert.equal(label(D(2026, 10, 10)), '2026年10月上旬');
  assert.equal(label(D(2026, 10, 11)), '2026年10月中旬');
  assert.equal(label(D(2026, 10, 20)), '2026年10月中旬');
  assert.equal(label(D(2026, 10, 21)), '2026年10月下旬');
  assert.equal(label(D(2026, 12, 31)), '2026年12月下旬');
});

/* ============================================================
   日程
   ============================================================ */

test('分野が 1 つなら、累積時間を 1 日の時間で割った日数で進む', () => {
  const today = D(2026, 9, 1);
  const plan = schedule([{ final: false, steps: [20, 30, 50] }], 2, today);
  const [a, b, c] = plan.byTrack[0];
  assert.equal(days(today, a), 10, '20h ÷ 2h = 10 日');
  assert.equal(days(today, b), 25, '(20+30)h ÷ 2h = 25 日');
  assert.equal(days(today, c), 50, '(20+30+50)h ÷ 2h = 50 日');
  assert.equal(days(today, plan.done), 50);
  assert.equal(plan.totalHours, 100);
});

test('分野が複数なら 1 日の時間を等分して並行に進める', () => {
  const today = D(2026, 9, 1);
  const plan = schedule([
    { final: false, steps: [20] },
    { final: false, steps: [40] },
  ], 2, today);
  assert.equal(days(today, plan.byTrack[0][0]), 20, '1 日 1h 配分で 20h → 20 日');
  assert.equal(days(today, plan.byTrack[1][0]), 40, '1 日 1h 配分で 40h → 40 日');
  assert.equal(days(today, plan.done), 40, '完走は遅いほうに合わせる');
  assert.equal(plan.totalHours, 60);
});

test('仕上げは他の分野がすべて終わってから、1 日の時間をまるごと使う', () => {
  const today = D(2026, 9, 1);
  const plan = schedule([
    { final: false, steps: [20] },
    { final: false, steps: [40] },
    { final: true, steps: [10] },
  ], 2, today);
  assert.equal(days(today, plan.byTrack[2][0]), 45, '40 日 + 10h ÷ 2h = 45 日');
  assert.equal(days(today, plan.done), 45);
  assert.equal(plan.totalHours, 70);
});

test('1 日の時間を増やすと完走が早くなる', () => {
  const today = D(2026, 9, 1);
  const slow = schedule([{ final: false, steps: [100] }], 1, today);
  const fast = schedule([{ final: false, steps: [100] }], 4, today);
  assert.ok(fast.done < slow.done);
  assert.equal(days(today, slow.done), 100);
  assert.equal(days(today, fast.done), 25);
});

test('残りが無ければ完走日は今日のまま', () => {
  const today = D(2026, 9, 1);
  const plan = schedule([], 2, today);
  assert.equal(plan.totalHours, 0);
  assert.equal(days(today, plan.done), 0);
});

test('日付は必ず前に進む（端数は切り上げる）', () => {
  const today = D(2026, 9, 1);
  const plan = schedule([{ final: false, steps: [1, 1, 1] }], 4, today);
  const [a, b, c] = plan.byTrack[0];
  assert.ok(a <= b && b <= c, '順番が入れ替わらない');
  assert.equal(days(today, a), 1, '0.25 日でも 1 日に切り上げる');
});

test('月をまたいでも日付が壊れない', () => {
  const today = D(2026, 12, 20);
  const plan = schedule([{ final: false, steps: [60] }], 2, today);
  assert.equal(label(plan.done), '2027年1月中旬');
});
