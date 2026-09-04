/**
 * 志望校モードの共有が、元の結果と一致することを検査する。
 *
 * 共有 URL は学部名を持たない（個人が特定されうるため URL に入れない）。
 * ところが受け取り側は大学名から判定をやり直すので、学部の入力で志望レベルが
 * 動いていた場合（医学部医学科など）、共有先では学部なしの判定に戻って
 * **別の教材列が出る**。ここでは「大学名を載せた共有 URL は、必ず同じ結果へ戻る」
 * ことを確かめる。戻らない条件では大学名を載せないのが正しい挙動。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, SUBJECTS } from './helpers.mjs';

/** 学部の入力で志望レベルが動く大学の件数。科目ごとに数え、最後に合計を見る */
const TIER_MOVERS = {};

/** 共有 URL に大学名を載せてよいと判断された場合、その大学で解き直しても同じ結果になる */
for (const dir of SUBJECTS) {
  test(`${dir}: 大学名を載せた共有 URL は、受け取り側でも同じ志望レベルへ戻る`, () => {
    const { ctx } = loadPage(dir);
    const S = ctx.S;
    let shared = 0, checked = 0;

    for (const u of ctx.UNIS) {
      for (const fac of ['', '医学部医学科', '工学部', '経済学部']) {
        S.mode = 'uni'; S.uni = u; S.fac = fac;
        S.bunriConfirmed = 'ri';
        S.bunri = 'ri';
        const r = ctx.resolveUni(u, fac);
        if (!r || r.needsBunri) continue;
        S.tier = r.tier;
        if (r.bunri) S.bunri = r.bunri;
        if (r.basic !== undefined) S.basic = r.basic;
        if (r.course) S.course = r.course;

        const name = ctx.sharedUniName();
        checked++;
        if (name === null) continue;   // 載せない判断は常に安全側
        shared++;

        // 受け取り側と同じ初期状態で解き直す
        const keep = S.bunriConfirmed;
        S.bunriConfirmed = (dir === 'english' || dir === 'math') ? S.bunri : null;
        const again = ctx.resolveUni(u, '');
        S.bunriConfirmed = keep;

        assert.ok(again && !again.needsBunri,
          `${dir}/${u.n}/${fac}: 大学名を載せたのに、共有先では判定できない`);
        assert.equal(again.tier, S.tier,
          `${dir}/${u.n}/${fac}: 共有先の志望レベルが ${again.tier}（元は ${S.tier}）`);
      }
    }
    assert.ok(checked > 100, `${dir}: 検査した組み合わせが ${checked} 件しかない`);
    assert.ok(shared > 0, `${dir}: 大学名を載せられる場合が 1 件も無い（判定が厳しすぎる）`);
  });

  test(`${dir}: 学部の入力で志望レベルが動く場合は大学名を載せない`, () => {
    const { ctx } = loadPage(dir);
    const S = ctx.S;
    S.mode = 'uni'; S.bunriConfirmed = 'ri'; S.bunri = 'ri';
    // 医学部医学科は多くの大学で志望レベルが上がる。上がった状態では大学名を載せない
    let found = 0;
    for (const u of ctx.UNIS) {
      const base = ctx.resolveUni(u, '');
      const med = ctx.resolveUni(u, '医学部医学科');
      if (!base || !med || base.needsBunri || med.needsBunri) continue;
      if (base.tier === med.tier) continue;
      found++;
      S.uni = u; S.fac = '医学部医学科'; S.tier = med.tier;
      if (med.bunri) S.bunri = med.bunri;
      if (med.basic !== undefined) S.basic = med.basic;
      if (med.course) S.course = med.course;
      assert.equal(ctx.sharedUniName(), null,
        `${dir}/${u.n}: 学部で志望レベルが ${base.tier} → ${med.tier} と動いたのに大学名を載せている`);
    }
    // 科目によっては、受験区分を確定させた時点で学部が結果を動かさなくなる
    // （社会は理系と答えた時点で共通テスト社会に寄るため）。その場合はここで
    // 検査するものが無い。サイト全体で 1 件も無いことは下のテストで見張る
    TIER_MOVERS[dir] = found;
  });
}

test('共有ブロックの注記が、URL に含まれないものを正しく挙げている', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../assets/js/share.js', import.meta.url), 'utf8');
  assert.match(src, /学部名・模試の偏差値・既習の参考書は含まれません/);
});

test('学部の入力で志望レベルが動く大学が、サイト全体で存在する（検査が空回りしていない）', () => {
  const total = Object.values(TIER_MOVERS).reduce((a, b) => a + b, 0);
  assert.ok(total > 0,
    `どの科目でも学部で志望レベルが動かない。上の検査が空回りしている: ${JSON.stringify(TIER_MOVERS)}`);
});
