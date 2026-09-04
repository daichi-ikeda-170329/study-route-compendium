/**
 * 志望校モードで、文理・受験科目を勝手に決めていないことを検査する。
 *
 * 2026-09 まで、数学は S.bunri の初期値 "bun" がそのまま使われ、東京大学と
 * 入力しただけの人に文系ルート（数III・C なし）を出していた。学部名の正規表現も
 * 「情報」「環境」「教育」「国際」まで拾って文理を確定させていた。どちらも
 * 「入力していない条件を、入力したかのように使う」ことになる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadPage, ROOT, SUBJECTS } from './helpers.mjs';

const require = createRequire(import.meta.url);
const RTBunri = require(path.join(ROOT, 'assets/js/bunri.js'));

/* ---------- 学部名からの推定は「候補」までにとどめる ---------- */

test('文理のどちらにも実在する学部名では推定を出さない', () => {
  const ambiguous = [
    '情報学部', '環境学部', '教育学部', '国際学部', 'デザイン学部',
    '総合政策学部', '人間科学部', '生活科学部', 'スポーツ科学部',
    '社会学部', '地域創造学部', '観光学部', 'データサイエンス学部',
    'グローバル・コミュニケーション学部', 'メディア学部',
  ];
  for (const f of ambiguous) {
    const r = RTBunri.suggest(f);
    assert.equal(r.bunri, null, `${f} を ${r.bunri} と断定している（${r.reason}）`);
    assert.match(r.reason, /どちらにも設置|判断できません/, `${f}: 理由が説明になっていない`);
  }
});

test('学部が未入力なら推定を出さない', () => {
  for (const f of ['', '   ', null, undefined]) {
    assert.equal(RTBunri.suggest(f).bunri, null, `${JSON.stringify(f)} で推定が出ている`);
  }
});

test('明確な学部名では候補を出すが、理由を必ず添える', () => {
  for (const [f, want] of [['工学部', 'ri'], ['理学部', 'ri'], ['薬学部', 'ri'],
    ['経済学部', 'bun'], ['法学部', 'bun'], ['文学部', 'bun']]) {
    const r = RTBunri.suggest(f);
    assert.equal(r.bunri, want, `${f} の候補が ${r.bunri}`);
    assert.match(r.reason, /推定しました/, `${f}: 理由が無い`);
  }
});

test('確認ブロックには「まだ分からない」と公式募集要項の注記が必ず入る', () => {
  const html = RTBunri.promptHTML({
    kind: 'bunri', suggested: 'ri', reason: '学部名から理系と推定しました',
    handler: 'pickBunri', picked: null,
  });
  assert.match(html, /まだ分からない/);
  assert.match(html, /公式募集要項を確認/);
  assert.match(html, /文系（数III・Cなし）/);
  assert.match(html, /理系（数III・Cあり）/);
  // 推定はラベルで区別できる。色だけで状態を伝えない
  assert.match(html, /bnr-hint">推定</);
});

test('「まだ分からない」を選ぶと、単一のルートを断定せず違いを説明する', () => {
  const html = RTBunri.promptHTML({
    kind: 'bunri', suggested: null, reason: '学部・学科が未入力です',
    handler: 'pickBunri', picked: 'unknown',
  });
  assert.match(html, /どちらか一方を当サイトが決めることはしません/);
  assert.match(html, /数III・C/);
});

/* ---------- 科目ページ側 ---------- */

test('数学: 大学だけを選んだ状態では文理が未確定として返る', () => {
  const { ctx } = loadPage('math');
  const S = ctx.S;
  S.mode = 'uni'; S.bunriConfirmed = null;
  const todai = ctx.UNIS.find(u => u.n === '東京大学');
  assert.ok(todai, 'UNIS に東京大学が無い');
  const r = ctx.resolveUni(todai, '');
  assert.equal(r.needsBunri, true, '大学名だけでルートを返している');
  assert.equal(r.bunri, undefined, '未確定なのに文理が入っている');
});

test('数学: 学部名だけでは文理を確定しない（推定は候補として返る）', () => {
  const { ctx } = loadPage('math');
  ctx.S.mode = 'uni'; ctx.S.bunriConfirmed = null;
  const todai = ctx.UNIS.find(u => u.n === '東京大学');
  const r = ctx.resolveUni(todai, '工学部');
  assert.equal(r.needsBunri, true, '学部名から確定してしまっている');
  assert.equal(r.suggestedBunri, 'ri', '候補が出ていない');
});

test('数学: 本人が選んだあとだけルートが返る', () => {
  const { ctx } = loadPage('math');
  const todai = ctx.UNIS.find(u => u.n === '東京大学');
  ctx.S.mode = 'uni';
  ctx.S.bunriConfirmed = 'ri';
  const r = ctx.resolveUni(todai, '');
  assert.ok(!r.needsBunri, '確定後も未確定のまま');
  assert.equal(r.bunri, 'ri');
  assert.equal(r.tier, 'top');
});

test('数学: 医学部医学科だけは学部の記載から理系を確定してよい', () => {
  const { ctx } = loadPage('math');
  ctx.S.mode = 'uni'; ctx.S.bunriConfirmed = null;
  const todai = ctx.UNIS.find(u => u.n === '東京大学');
  const r = ctx.resolveUni(todai, '医学部医学科');
  assert.ok(!r.needsBunri, '医学科でも確認を求めている（数III・C が要ることは学部の記載から確定する）');
  assert.equal(r.bunri, 'ri');
});

test('5 科目すべてが assets/js/bunri.js を読み込んでいる', () => {
  for (const dir of SUBJECTS) {
    const src = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
    assert.match(src, /<script src="\/assets\/js\/bunri\.js"><\/script>/, `${dir}: bunri.js を読み込んでいない`);
  }
});

test('志望校モードの説明文が、実際に個別化している範囲と一致している', () => {
  // 「その大学の出題傾向に合わせたルート」は、実装していない個別化を約束する文言
  for (const dir of SUBJECTS) {
    const src = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
    assert.ok(!src.includes('その大学の出題傾向に合わせたルートを表示'),
      `${dir}: 個別化していない内容を約束している`);
  }
});

/* ---------- 5 科目すべてで、大学名だけではルートを出さない ---------- */

/** その科目の UNIS から、二次・個別試験のある代表的な大学を選ぶ */
const PROBE = {
  english: '東京大学', japanese: '東京大学', math: '東京大学',
  science: '東京大学', social: '東京大学',
};

for (const dir of SUBJECTS) {
  test(`${dir}: 大学名だけを選んだ状態ではルートを出さず、確認を求める`, () => {
    const { ctx } = loadPage(dir);
    ctx.S.mode = 'uni';
    ctx.S.bunriConfirmed = null;
    ctx.S.bunriPicked = null;
    const u = ctx.UNIS.find(x => x.n === PROBE[dir]);
    assert.ok(u, `${dir}: UNIS に ${PROBE[dir]} が無い`);
    const r = ctx.resolveUni(u, '');
    assert.equal(r.needsBunri, true,
      `${dir}: 大学名だけで受験区分を決めてしまっている`);
    // 英語だけは、本人が選んだ大学の設置区分（国公立 / 私立）から出題形式の候補を
    // 出してよい。入力済みの事実に基づくためで、それでも確定はしない。
    // ほかの 4 科目の候補は学部名だけが根拠なので、学部が空なら候補も出さない
    if (dir !== 'english') {
      assert.equal(r.suggestedBunri ?? null, null,
        `${dir}: 学部が空なのに推定を出している`);
    }
  });

  test(`${dir}: 本人が選んだあとはルートの条件が返る`, () => {
    const { ctx } = loadPage(dir);
    ctx.S.mode = 'uni';
    ctx.S.bunriConfirmed = 'ri';
    const u = ctx.UNIS.find(x => x.n === PROBE[dir]);
    const r = ctx.resolveUni(u, '');
    assert.ok(!r.needsBunri, `${dir}: 確定後も未確定のまま`);
    assert.ok(r.tier, `${dir}: tier が返っていない`);
  });

  test(`${dir}: 「情報学部」だけでは受験区分を確定しない`, () => {
    const { ctx } = loadPage(dir);
    ctx.S.mode = 'uni';
    ctx.S.bunriConfirmed = null;
    const u = ctx.UNIS.find(x => x.n === PROBE[dir]);
    const r = ctx.resolveUni(u, '情報学部');
    assert.equal(r.needsBunri, true, `${dir}: 情報学部から確定してしまっている`);
    if (dir !== 'english') {
      assert.equal(r.suggestedBunri ?? null, null,
        `${dir}: 情報学部に推定を出している（文理のどちらにも実在する）`);
    }
  });
}
