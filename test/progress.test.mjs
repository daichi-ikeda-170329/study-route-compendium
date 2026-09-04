/**
 * 学習進捗（assets/js/progress.js）の検査。
 *
 * ここで守りたいのは 3 つ。
 *
 *   1. **利用者が積み上げた記録を壊さない。** 壊れた値を黙って上書きしない、
 *      検査に落ちた取り込みで localStorage を変えない、既存キーに触らない。
 *   2. **残り時間の幅を壊さない。** assets/js/pace.js は下限・上限の 2 本を持つ。
 *      進捗を掛けるときは両方に同じ係数を掛ける。片方だけだと幅が嘘になる。
 *   3. **端末の外へ出さない。** 形の検査はここで、通信の検査は e2e/progress.spec.mjs で。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, fakeStorage } from './helpers.mjs';

const require = createRequire(import.meta.url);
const MODULE = path.join(ROOT, 'assets/js/progress.js');

/** localStorage を差し替えて progress.js を読み直す */
function load({ localStorage } = {}) {
  if (localStorage === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true, writable: true });
  delete require.cache[require.resolve(MODULE)];
  const RTProgress = require(MODULE);
  RTProgress.__test.reset();
  return RTProgress;
}

const KEY = 'rt_learning_progress';

/* ============================================================
   形の検査
   ============================================================ */

test('状態は 4 つだけで、表示名がそろっている', () => {
  const P = load({ localStorage: fakeStorage() });
  assert.deepEqual(P.STATUS, ['not_started', 'in_progress', 'completed', 'on_hold']);
  for (const s of P.STATUS) {
    assert.equal(typeof P.STATUS_LABEL[s], 'string', `${s} の表示名が無い`);
  }
  assert.deepEqual(Object.keys(P.STATUS_LABEL).sort(), [...P.STATUS].sort(), '表示名の集合が状態と食い違っている');
});

test('週目標の単位は決まった 4 つだけ', () => {
  const P = load({ localStorage: fakeStorage() });
  assert.deepEqual(P.UNITS, ['hours', 'pages', 'questions', 'chapters']);
  assert.equal(P.setWeeklyGoal({ value: 7, unit: 'hours' }).ok, true);
  assert.equal(P.setWeeklyGoal({ value: 7, unit: 'minutes' }).ok, false, '未知の単位を受け入れた');
  assert.equal(P.setWeeklyGoal({ value: 0, unit: 'hours' }).ok, false, '0 を受け入れた');
  assert.equal(P.setWeeklyGoal({ value: -3, unit: 'hours' }).ok, false, '負数を受け入れた');
});

test('1 冊の値を検査する（不明を 0 や空文字で埋めない）', () => {
  const P = load({ localStorage: fakeStorage() });
  const c = P.__test.checkEntry;
  assert.equal(c({ status: 'in_progress' }), null);
  assert.equal(c({ status: 'in_progress', progressPercent: 40 }), null);
  assert.ok(c({ status: 'unknown' }), '未知の status を通した');
  assert.ok(c({ status: 'in_progress', progressPercent: 101 }), '100 超を通した');
  assert.ok(c({ status: 'in_progress', progressPercent: -1 }), '負数を通した');
  assert.ok(c({ status: 'in_progress', progressPercent: 40.5 }), '小数を通した');
  assert.ok(c({ status: 'in_progress', currentLocation: 'あ'.repeat(121) }), '長すぎるメモを通した');
  assert.equal(c({ status: 'in_progress', currentLocation: 'あ'.repeat(120) }), null);
  assert.ok(c({ status: 'in_progress', startedAt: '2026/09/01' }), '日付の形が違うものを通した');
  assert.equal(c({ status: 'in_progress', startedAt: '2026-09-01' }), null);
});

test('書籍キーは「科目:書籍ID」の形だけを受ける', () => {
  const P = load({ localStorage: fakeStorage() });
  const v = P.__test.validKey;
  assert.equal(v('math:aoChart'), true);
  assert.equal(v('math:ao-chart_2'), true);
  assert.equal(v('math'), false);
  assert.equal(v('math:'), false);
  assert.equal(v(':aoChart'), false);
  assert.equal(v('math:../../etc'), false, 'パスに使える文字を通した');
  assert.equal(v('math:<script>'), false, 'HTML に使える文字を通した');
});

/* ============================================================
   読み書き
   ============================================================ */

test('保存して読み直すと同じ値が返る', () => {
  const store = fakeStorage();
  const P = load({ localStorage: store });
  assert.equal(P.set('math', 'aoChart', { status: 'in_progress', progressPercent: 40, currentLocation: '第3章' }).ok, true);

  const P2 = load({ localStorage: store });
  const e = P2.get('math', 'aoChart');
  assert.equal(e.status, 'in_progress');
  assert.equal(e.progressPercent, 40);
  assert.equal(e.currentLocation, '第3章');
  assert.match(e.startedAt, /^\d{4}-\d{2}-\d{2}$/, '学習中に移った日が入っていない');
});

test('登録が無い本は null を返す（「未着手」と決めつけない）', () => {
  const P = load({ localStorage: fakeStorage() });
  assert.equal(P.get('math', 'not-registered'), null);
});

test('status を null にすると登録そのものが消える', () => {
  const store = fakeStorage();
  const P = load({ localStorage: store });
  P.set('math', 'aoChart', { status: 'completed' });
  assert.ok(P.get('math', 'aoChart'));
  P.set('math', 'aoChart', { status: null });
  assert.equal(P.get('math', 'aoChart'), null);
});

test('既存のキー（rt_saved_routes / rt_pace）に触らない', () => {
  const store = fakeStorage({
    rt_saved_routes: '{"v":1,"items":[{"id":"x"}]}',
    rt_pace: '{"v":2,"year":2027}',
  });
  const P = load({ localStorage: store });
  P.set('math', 'aoChart', { status: 'in_progress' });
  P.clear();
  assert.equal(store._data.rt_saved_routes, '{"v":1,"items":[{"id":"x"}]}', '保存したルートを壊した');
  assert.equal(store._data.rt_pace, '{"v":2,"year":2027}', '学習ペースの設定を壊した');
});

test('clear() は進捗だけを消す', () => {
  const store = fakeStorage({ rt_pace: '{"v":2}' });
  const P = load({ localStorage: store });
  P.set('math', 'aoChart', { status: 'completed' });
  assert.ok(store._data[KEY]);
  assert.equal(P.clear(), true);
  assert.equal(store._data[KEY], undefined);
  assert.equal(store._data.rt_pace, '{"v":2}');
  assert.equal(P.summary().total, 0);
});

test('localStorage が使えなくても落ちない', () => {
  const P = load({ localStorage: fakeStorage({}, 'all') });
  assert.doesNotThrow(() => P.all());
  assert.equal(P.set('math', 'aoChart', { status: 'completed' }).ok, false, '保存できていないのに true を返した');
  assert.equal(P.summary().total, 1, '画面上の状態までは持てる');
});

/* ============================================================
   壊れたデータ
   ============================================================ */

test('壊れた localStorage を黙って上書きしない', () => {
  const store = fakeStorage({ [KEY]: '{壊れている' });
  const P = load({ localStorage: store });
  const d = P.damagedInfo();
  assert.ok(d, '壊れていることを持ち上げていない');
  assert.equal(d.raw, '{壊れている', '生データを渡していない（取り出せない）');
  assert.equal(store._data[KEY], '{壊れている', '読んだだけで書き換えた');
  assert.equal(P.summary().total, 0);
});

test('version が違う保存データは読まず、生データを残す', () => {
  const raw = JSON.stringify({ version: 99, books: { 'math:x': { status: 'completed' } } });
  const store = fakeStorage({ [KEY]: raw });
  const P = load({ localStorage: store });
  const d = P.damagedInfo();
  assert.ok(d);
  assert.match(d.reason, /version/);
  assert.equal(store._data[KEY], raw, '読んだだけで書き換えた');
});

test('一部だけ壊れていたら、読めた分を使い、落とした件数を残す', () => {
  const raw = JSON.stringify({
    version: 1,
    books: {
      'math:ok': { status: 'completed' },
      'math:bad': { status: 'なにか' },
      'ダメなキー': { status: 'completed' },
    },
  });
  const P = load({ localStorage: fakeStorage({ [KEY]: raw }) });
  assert.equal(P.summary().total, 1);
  assert.ok(P.get('math', 'ok'));
  const d = P.damagedInfo();
  assert.ok(d, '落としたことを伝えていない');
  assert.deepEqual(d.skipped.sort(), ['math:bad', 'ダメなキー'].sort());
});

/* ============================================================
   取り出しと取り込み
   ============================================================ */

test('書き出す中身に、診断の履歴も検索語も解析 ID も入らない', () => {
  const P = load({ localStorage: fakeStorage() });
  P.set('math', 'aoChart', { status: 'in_progress', progressPercent: 20 });
  const out = P.exportData();
  assert.deepEqual(Object.keys(out).sort(), ['books', 'plans', 'updatedAt', 'version', 'weeklyGoal'].sort());
  const text = JSON.stringify(out);
  for (const bad of ['G-', 'ca-pub-', 'quiz', 'search', 'rt_saved_routes']) {
    assert.ok(!text.includes(bad), `書き出しに ${bad} が混ざっている`);
  }
});

test('取り込みは 1MiB を超えたら読まない', () => {
  const P = load({ localStorage: fakeStorage() });
  const big = JSON.stringify({ version: 1, books: {}, pad: 'あ'.repeat(400_000) });
  const r = P.previewImport(big, () => true);
  assert.equal(r.ok, false);
  assert.match(r.reason, /大きすぎる/);
});

test('取り込みの下見は localStorage を一切変えない', () => {
  const store = fakeStorage();
  const P = load({ localStorage: store });
  P.set('math', 'aoChart', { status: 'in_progress' });
  const before = store._data[KEY];

  const text = JSON.stringify({ version: 1, books: { 'math:aoChart': { status: 'completed' } } });
  const pv = P.previewImport(text, () => true);
  assert.equal(pv.ok, true);
  assert.equal(store._data[KEY], before, '下見なのに書き換えた');
  assert.equal(P.get('math', 'aoChart').status, 'in_progress', '下見なのに画面上の値まで変えた');
});

test('検査に落ちた取り込みは localStorage を一切変えない', () => {
  const store = fakeStorage();
  const P = load({ localStorage: store });
  P.set('math', 'aoChart', { status: 'in_progress' });
  const before = store._data[KEY];

  for (const bad of ['{壊れている', JSON.stringify({ version: 2, books: {} }), JSON.stringify({ version: 1 })]) {
    const pv = P.previewImport(bad, () => true);
    assert.equal(pv.ok, false, `落とすべき入力を通した: ${bad.slice(0, 30)}`);
    assert.equal(P.commitImport(pv, 'merge').ok, false);
  }
  assert.equal(store._data[KEY], before, '落ちた取り込みで書き換えた');
});

test('掲載していない ID は件数だけ数えて取り込まない', () => {
  const P = load({ localStorage: fakeStorage() });
  const text = JSON.stringify({
    version: 1,
    books: {
      'math:known': { status: 'completed' },
      'math:gone': { status: 'completed' },
      'zzz:other': { status: 'completed' },
    },
  });
  const known = (sub, id) => sub === 'math' && id === 'known';
  const pv = P.previewImport(text, known);
  assert.equal(pv.ok, true);
  assert.equal(pv.counts.incoming, 1);
  assert.equal(pv.counts.unknown, 2);
  assert.equal(P.commitImport(pv, 'merge').ok, true);
  assert.equal(P.get('math', 'gone'), null);
  assert.equal(P.get('zzz', 'other'), null);
  assert.ok(P.get('math', 'known'));
});

test('下見で件数と差分が分かる', () => {
  const P = load({ localStorage: fakeStorage() });
  P.set('math', 'a', { status: 'in_progress' });
  P.set('math', 'b', { status: 'completed' });
  const text = JSON.stringify({
    version: 1,
    books: {
      'math:a': { status: 'completed' },     // 変わる
      'math:c': { status: 'completed' },     // 増える
    },
  });
  const pv = P.previewImport(text, () => true);
  assert.equal(pv.counts.incoming, 2);
  assert.equal(pv.counts.added, 1);
  assert.equal(pv.counts.changed, 1);
  assert.equal(pv.counts.currentTotal, 2);
});

test('統合と置換が別の結果になる', () => {
  const text = JSON.stringify({ version: 1, books: { 'math:c': { status: 'completed' } } });

  const merged = load({ localStorage: fakeStorage() });
  merged.set('math', 'a', { status: 'in_progress' });
  merged.commitImport(merged.previewImport(text, () => true), 'merge');
  assert.equal(merged.summary().total, 2, '統合なのに既存が消えた');

  const replaced = load({ localStorage: fakeStorage() });
  replaced.set('math', 'a', { status: 'in_progress' });
  replaced.commitImport(replaced.previewImport(text, () => true), 'replace');
  assert.equal(replaced.summary().total, 1, '置換なのに既存が残った');
  assert.equal(replaced.get('math', 'a'), null);
});

test('mode を渡し忘れた取り込みは通らない', () => {
  const P = load({ localStorage: fakeStorage() });
  const pv = P.previewImport(JSON.stringify({ version: 1, books: {} }), () => true);
  assert.equal(P.commitImport(pv, undefined).ok, false);
  assert.equal(P.commitImport(pv, 'overwrite').ok, false);
});

test('取り込んだ文字列が、そのまま HTML として扱われない形で保存される', () => {
  // 値は textContent で入れる前提だが、保存の時点でも長さと型を絞っておく
  const P = load({ localStorage: fakeStorage() });
  const text = JSON.stringify({
    version: 1,
    books: { 'math:a': { status: 'in_progress', currentLocation: '<img src=x onerror=alert(1)>' } },
  });
  const pv = P.previewImport(text, () => true);
  assert.equal(pv.ok, true, '文字列としては受け入れる（表示側が textContent で入れる）');
  P.commitImport(pv, 'merge');
  const e = P.get('math', 'a');
  assert.equal(typeof e.currentLocation, 'string');
  assert.ok(e.currentLocation.length <= P.LOCATION_MAX);
});

/* ============================================================
   残り時間
   ============================================================ */

test('残りの割合が状態ごとに決まっている', () => {
  const P = load({ localStorage: fakeStorage() });
  assert.equal(P.remainingFactor(null), 1, '登録が無い本は全部残す');
  assert.equal(P.remainingFactor({ status: 'not_started' }), 1);
  assert.equal(P.remainingFactor({ status: 'completed' }), 0);
  assert.equal(P.remainingFactor({ status: 'on_hold' }), 1, '保留は再開まで全部残す');
  assert.equal(P.remainingFactor({ status: 'in_progress' }), 1, '進捗率が不明なら保守的に全部残す');
  assert.equal(P.remainingFactor({ status: 'in_progress', progressPercent: 0 }), 1);
  assert.equal(P.remainingFactor({ status: 'in_progress', progressPercent: 40 }), 0.6);
  assert.equal(P.remainingFactor({ status: 'in_progress', progressPercent: 100 }), 0);
});

test('下限と上限の両方に同じ係数が掛かる（幅を壊さない）', () => {
  const P = load({ localStorage: fakeStorage() });
  P.set('math', 'aoChart', { status: 'in_progress', progressPercent: 25 });
  const f = P.factorFor('math', 'aoChart');
  assert.equal(f, 0.75);

  // pace.js の band は {min, mid, max}。同じ係数を掛けると幅の比が保たれる
  const band = { min: 100, mid: 150, max: 200 };
  const scaled = { min: band.min * f, mid: band.mid * f, max: band.max * f };
  assert.deepEqual(scaled, { min: 75, mid: 112.5, max: 150 });
  assert.equal((scaled.max - scaled.min) / (band.max - band.min), f, '幅の比が変わっている');
});

test('未確認の教材は係数の対象外（合計は下限のまま）', () => {
  // 想定学習時間が数値で無い教材は pace.js が band.unverified で合計から外す。
  // 進捗を付けてもその扱いは変わらない
  const P = load({ localStorage: fakeStorage() });
  P.set('math', 'x', { status: 'in_progress', progressPercent: 50 });
  const band = { min: 0, mid: 0, max: 0, unverified: true };
  const f = P.factorFor('math', 'x');
  assert.equal(band.min * f, 0);
  assert.equal(band.unverified, true, '未確認の印を消してはいけない');
});

/* ============================================================
   週次の見直し
   ============================================================ */

test('次にやることは決まった規則で 1〜3 件出る', () => {
  const P = load({ localStorage: fakeStorage() });
  P.set('math', 'b', { status: 'in_progress' });
  P.set('math', 'c', { status: 'completed' });
  P.set('math', 'd', { status: 'on_hold' });

  const cands = [
    { subjectId: 'math', bookId: 'a', name: 'A' },   // 登録なし → 未着手
    { subjectId: 'math', bookId: 'b', name: 'B' },   // 学習中
    { subjectId: 'math', bookId: 'c', name: 'C' },   // 完了 → 出さない
    { subjectId: 'math', bookId: 'd', name: 'D' },   // 保留
  ];
  const picks = P.weeklyPicks(cands, 3);
  assert.deepEqual(picks.map(p => p.bookId), ['b', 'a', 'd'], '学習中が先、次に未着手、保留は後ろ');
  assert.ok(!picks.some(p => p.bookId === 'c'), '完了した本を出した');
});

test('同じ入力なら同じ順番になる（実行ごとに変わらない）', () => {
  const P = load({ localStorage: fakeStorage() });
  const cands = ['e', 'c', 'a', 'd', 'b'].map(id => ({ subjectId: 'math', bookId: id, name: id }));
  const first = P.weeklyPicks(cands, 3).map(p => p.bookId);
  const again = P.weeklyPicks(cands, 3).map(p => p.bookId);
  assert.deepEqual(first, again);
  assert.deepEqual(first, ['a', 'b', 'c'], 'ID 順に並んでいない');
});

test('集計が状態ごとに数えられる', () => {
  const P = load({ localStorage: fakeStorage() });
  P.set('math', 'a', { status: 'in_progress' });
  P.set('math', 'b', { status: 'completed' });
  P.set('english', 'c', { status: 'completed' });
  const s = P.summary();
  assert.equal(s.total, 3);
  assert.equal(s.in_progress, 1);
  assert.equal(s.completed, 2);
  assert.equal(s.not_started, 0);
});
