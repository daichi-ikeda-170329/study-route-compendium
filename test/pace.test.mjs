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

/* ============================================================
   想定学習時間の幅

   データ側は「60〜100h」「各巻30〜45h」「継続購読」のように書かれている。
   代表値だけを使って 1 つの日付を出すと、データが持っていない精度になる。
   ============================================================ */

const { parseBand, plan3, capacityOn, weeklyHours, deadlineDate, migrate, DEADLINES } = RTPace.__test;

test('想定学習時間の幅を、代表値と食い違わないように割り振る', () => {
  const b = parseBand('60〜100h', 80);
  assert.equal(b.unverified, false);
  assert.equal(b.mid, 80, '代表値はそのまま');
  assert.ok(b.min < b.mid && b.mid < b.max, '下限 < 標準 < 上限');
  // 60:80:100 の比を代表値 80 に合わせる（中心 80 なのでそのまま）
  assert.equal(Math.round(b.min), 60);
  assert.equal(Math.round(b.max), 100);
});

test('分冊の「各巻」表記でも、代表値を基準に比率で割り振る', () => {
  // 各巻 30〜45h（中心 37.5）で代表値 90 → 2.4 巻ぶん相当
  const b = parseBand('各巻30〜45h', 90);
  assert.equal(b.mid, 90);
  assert.equal(Math.round(b.min), 72);
  assert.equal(Math.round(b.max), 108);
});

test('単一の時間表記は幅を持たない', () => {
  const b = parseBand('40h', 40);
  assert.deepEqual([b.min, b.mid, b.max], [40, 40, 40]);
  assert.equal(b.unverified, false);
});

test('数値で書かれていない想定時間は unverified にし、時間を 0 にする', () => {
  for (const t of ['継続購読', '要確認', '', null, undefined]) {
    const b = parseBand(t, 50);
    assert.equal(b.unverified, true, `${JSON.stringify(t)} を未確認として扱っていない`);
    assert.equal(b.min, 0);
    assert.equal(b.max, 0);
  }
});

test('未確認の教材は合計に入らず、件数として返る', () => {
  const today = D(2026, 9, 1);
  const p = plan3([{
    final: false,
    bands: [parseBand('20〜40h', 30), parseBand('継続購読', 50)],
  }], 2, today);
  assert.equal(p.unverified, 1);
  assert.equal(p.mid.totalHours, 30, '未確認ぶんの 50h を足していない');
});

test('最短・標準・余裕の順に完走日が遅くなる', () => {
  const today = D(2026, 9, 1);
  const p = plan3([{ final: false, bands: [parseBand('60〜100h', 80)] }], 2, today);
  assert.ok(p.min.done <= p.mid.done, '最短が標準より遅い');
  assert.ok(p.mid.done <= p.max.done, '標準が余裕より遅い');
  assert.ok(p.min.done < p.max.done, '幅が潰れている');
});

/* ============================================================
   平日・休日・予備日
   ============================================================ */

test('平日と休日で 1 日の時間を分けられる', () => {
  const cap = { weekday: 2, weekend: 5, rest: false };
  assert.equal(capacityOn(D(2026, 9, 2), cap), 2, '水曜は平日');
  assert.equal(capacityOn(D(2026, 9, 5), cap), 5, '土曜は休日');
  assert.equal(capacityOn(D(2026, 9, 6), cap), 5, '日曜は休日');
  assert.equal(weeklyHours(cap), 2 * 5 + 5 * 2);
});

test('週 1 日の予備日はその日の時間を 0 にする', () => {
  const cap = { weekday: 2, weekend: 5, rest: true };
  assert.equal(capacityOn(D(2026, 9, 6), cap), 0, '日曜が予備日');
  assert.equal(weeklyHours(cap), 2 * 5 + 5, '休日 1 日ぶんが減る');
});

test('1 日の時間が 0 なら完走日を出さない（無限ループにしない）', () => {
  const today = D(2026, 9, 1);
  const p = plan3([{ final: false, bands: [parseBand('40h', 40)] }],
    { weekday: 0, weekend: 0, rest: false }, today);
  assert.equal(p.mid.done, null);
});

/* ============================================================
   締切
   ============================================================ */

test('締切は共通テスト・私大一般・国公立二次・任意日から選べる', () => {
  assert.deepEqual(Object.keys(DEADLINES).sort(), ['custom', 'kokkoritsu', 'kyotsu', 'shidai']);
  assert.equal(deadlineDate(2027, 'kyotsu').getMonth(), 0);
  assert.equal(deadlineDate(2027, 'shidai').getMonth(), 1);
  assert.equal(deadlineDate(2027, 'kokkoritsu').getDate(), 25);
});

test('任意日を指定すればその日が締切になる', () => {
  const d = deadlineDate(2027, 'custom', '2027-03-08');
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 8);
});

test('壊れた任意日は既定の締切へ落ちる', () => {
  for (const bad of ['', 'abc', '2027-13-99x', null]) {
    const d = deadlineDate(2027, 'custom', bad);
    assert.equal(d.getMonth(), 0, `${JSON.stringify(bad)} で日付が壊れている`);
  }
});

/* ============================================================
   保存データの移行
   ============================================================ */

test('旧形式の保存データ（v1）を読み込める', () => {
  const v = migrate({ year: 2027, hours: 3 });
  assert.equal(v.v, 2);
  assert.equal(v.year, 2027);
  assert.equal(v.weekday, 3);
  assert.equal(v.weekend, 3, '旧形式は平日・休日を分けていないので同じ値を入れる');
  assert.equal(v.rest, false, '既存の利用者の見え方を勝手に変えない');
  assert.equal(v.deadline, 'kyotsu');
});

test('現行形式はそのまま通す', () => {
  const cur = { v: 2, year: 2027, weekday: 1, weekend: 4, rest: true, deadline: 'shidai', customDate: null };
  assert.equal(migrate(cur), cur);
});

test('読めない保存データは null にして既定値で始める', () => {
  for (const bad of [null, undefined, 'x', 42, {}, { v: 99 }]) {
    assert.equal(migrate(bad), null, `${JSON.stringify(bad)} を通してしまっている`);
  }
});

/* ============================================================
   うるう年・年跨ぎ
   ============================================================ */

test('うるう年の 2 月をまたいでも日付が壊れない', () => {
  const today = D(2028, 2, 20);
  const p = plan3([{ final: false, bands: [parseBand('70h', 70)] }],
    { weekday: 1, weekend: 1, rest: false }, today);
  // 70 日後 = 2028-04-30（2028 年は閏年で 2 月が 29 日）
  assert.equal(p.mid.done.getMonth(), 3);
  assert.equal(p.mid.done.getDate(), 30);
});

test('年をまたいでも完走日が前に進む', () => {
  const today = D(2026, 12, 20);
  const p = plan3([{ final: false, bands: [parseBand('60h', 60)] }],
    { weekday: 2, weekend: 2, rest: false }, today);
  assert.equal(label(p.mid.done), '2027年1月中旬');
});

test('残り 0 時間なら完走日は今日のまま', () => {
  const today = D(2026, 9, 1);
  const p = plan3([], { weekday: 2, weekend: 2, rest: false }, today);
  assert.equal(p.mid.totalHours, 0);
  assert.equal(days(today, p.mid.done), 0);
});

test('異常な想定時間（負・巨大）でも日付計算が壊れない', () => {
  const today = D(2026, 9, 1);
  const neg = plan3([{ final: false, bands: [{ min: -10, mid: -10, max: -10, unverified: false }] }],
    { weekday: 2, weekend: 2, rest: false }, today);
  assert.equal(days(today, neg.mid.done), 0, '負の時間で日付が戻らない');
  const huge = plan3([{ final: false, bands: [{ min: 1e6, mid: 1e6, max: 1e6, unverified: false }] }],
    { weekday: 2, weekend: 2, rest: false }, today);
  assert.equal(huge.mid.done, null, '上限を超えたら日付を出さない');
});
