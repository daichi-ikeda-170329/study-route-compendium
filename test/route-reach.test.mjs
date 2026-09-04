/**
 * 志望レベル（TIERS）にたどり着けることと、旧共有 URL がそのまま復元されることを検査する。
 *
 * 2026-09 まで、数学の TIERS には shiritsui（私立医学部）があるのに、3 分診断の
 * Q3 に選択肢が無く、大学名を入力する経路からしか到達できなかった。データに
 * 定義があることと、利用者がそこへ行けることは別なので、ここで結び付ける。
 *
 * 選択肢を足すときは **必ず末尾に足す**。共有 URL は選択肢の並び順（1 始まりの
 * 番号）で回答を持つので、前や間に挿すと過去に共有された URL が別の回答として
 * 復元される。その保証を fixture で固定する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuiz, loadPage, loadShare, fakeStorage, SUBJECTS } from './helpers.mjs';
import { extractSubject } from '../build/lib/extract.mjs';
import { ROOT } from './helpers.mjs';

/**
 * vm 上で作られた配列を現 realm の配列へ移す。realm が違うと、同じ [] どうしでも
 * deepStrictEqual が落ちる（Array.prototype が別物になるため）。
 */
const plain = (a) => [...a];

const RTShare = loadShare({ localStorage: fakeStorage() });

/** 診断の全回答パターンから、実際に出しうる tier の集合を作る */
function reachableFromQuiz(quiz) {
  const out = new Set();
  const walk = (i, acc) => {
    if (i === quiz.length) {
      // 各科目の renderQuizResult と同じ決め方（tier=top なら tier2 が実体）
      out.add(acc.tier === 'top' && acc.tier2 ? acc.tier2 : acc.tier);
      return;
    }
    const q = quiz[i];
    if (q.cond && !q.cond(acc)) { walk(i + 1, acc); return; }
    for (const o of q.opts) walk(i + 1, { ...acc, [q.key]: o.v });
  };
  walk(0, {});
  return out;
}

for (const dir of SUBJECTS) {
  const { tiers, unis } = extractSubject(ROOT, dir);
  const quiz = loadQuiz(dir);
  const fromQuiz = reachableFromQuiz(quiz);
  const fromUni = new Set(unis.map(u => u.t));

  test(`${dir}: 全ての志望レベルへ診断か大学入力のどちらかから到達できる`, () => {
    const unreachable = plain(tiers).map(t => t.id).filter(id => !fromQuiz.has(id) && !fromUni.has(id));
    assert.deepEqual(unreachable, [],
      `${dir}: 定義はあるのに到達できない志望レベル — ${unreachable.join(', ')}`);
  });
}

test('数学の診断から私立医学部へ到達できる', () => {
  assert.ok(reachableFromQuiz(loadQuiz('math')).has('shiritsui'),
    '数学の Q3 に私立医学部の選択肢が無い');
});

test('英語の診断から国公立医と私立医の両方へ到達できる', () => {
  const r = reachableFromQuiz(loadQuiz('english'));
  assert.ok(r.has('med'), '国公立医学部へ到達できない');
  assert.ok(r.has('shiritsui'), '私立医学部へ到達できない');
});

/**
 * 選択肢を足す前に共有された URL。数学の Q3 で 4 番目（国公立医学部）を選んだ状態。
 * 私立医学部を末尾に足したあとも、この URL は同じ回答へ戻らなければならない。
 */
const LEGACY_MATH_URLS = [
  { qs: 'v=1&a=2.5.4.2.2', want: { bunri: 'ri', tier: 'top', tier2: 'med', level: '1', time: 'mid' } },
  { qs: 'v=1&a=1.1.0.1.1', want: { bunri: 'bun', tier: 'kyote', level: '0', time: 'long' } },
  { qs: 'v=1&a=2.5.3.3.3', want: { bunri: 'ri', tier: 'top', tier2: 'top', level: '2', time: 'short' } },
];

test('選択肢を足す前の数学の共有 URL が、同じ回答へ復元される', () => {
  const quiz = loadQuiz('math');
  for (const { qs, want } of LEGACY_MATH_URLS) {
    const res = RTShare.decodeAnswers(quiz, qs);
    assert.equal(res.ok, true, `${qs} が復元できない（${res.reason}）`);
    assert.deepEqual({ ...res.ans }, want, `${qs} の復元結果が変わっている`);
  }
});

test('末尾に足した私立医学部は、既存の選択肢の番号を動かしていない', () => {
  const quiz = loadQuiz('math');
  const q3 = quiz.find(q => q.key === 'tier2');
  assert.deepEqual(plain(q3.opts).map(o => o.v), ['sokei', 'kyutei', 'top', 'med', 'shiritsui'],
    '既存 4 つの並びが変わっている。共有 URL は並び順で回答を持つので前や間に挿さない');
});

test('医学部を選ぶと、文理の回答に関わらず理系ルートになる（数学）', () => {
  const { ctx } = loadPage('math');
  const routes = ctx.ROUTES;
  for (const tier of ['med', 'shiritsui']) {
    assert.ok(routes[tier] && routes[tier].ri, `math: ROUTES.${tier}.ri が無い`);
  }
});
