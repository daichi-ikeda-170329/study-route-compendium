/**
 * 書籍ページの「同じ役割・同じレベルの参考書」（横）と「この本のあとに進む参考書」（縦）を選ぶ。
 *
 * もとは build/generate-books.mjs の中にあった。候補を難易度の昇順だけで並べていたため、
 * 同じ難易度の中では書名順に近い並びになり、The Rules 4（早慶・旧帝・東大京大向け）の次に
 * 「阪大の英語20カ年」「私立医大の英語」が先頭に来ていた（2026-09-10）。
 * 候補にスコアを付け、同点のときだけ難易度順にする。
 */
import { isProvisional } from './newbooks.mjs';
import { byDifficultyAsc } from './rank.mjs';
import { nextStages } from './flow.mjs';
import { sharesTag } from './unitags.mjs';

/** スコアの内訳。数字は仕様書 1.7 のとおり */
export const LINK_SCORE = {
  sharedTag: 3,     // 元の本と BOOKS[].unis のタグが重なる（同じ層・同じ大学に向く）
  laterInRoute: 2,  // 元の本を本編に含むルートで、同じルートの後ろの段に載っている
  sameBunri: 1,     // bunri が元の本と同じか both
  placeholder: -2,  // ルート上の枠（志望校の過去問）。出すが末尾へ
};

/**
 * 元の本を本編に含むルートで、それより後ろに載っている本の id。
 * 全志望レベル・全トラック・全方針（omni / quick）を見る。
 */
export function laterInRoutes(bookId, routes) {
  const out = new Set();
  for (const node of Object.values(routes || {})) {
    for (const [k, v] of Object.entries(node || {})) {
      if (!v || Array.isArray(v) || k === 'para' || k === 'final' || k === 'basic') continue;
      for (const pol of ['omni', 'quick']) {
        const list = v[pol] || [];
        const i = list.findIndex(s => s.id === bookId);
        if (i < 0) continue;
        for (const s of list.slice(i + 1)) out.add(s.id);
      }
    }
  }
  return out;
}

/** 候補 1 冊のスコア */
export function linkScore(book, cand, later) {
  let score = 0;
  if (sharesTag(book, cand)) score += LINK_SCORE.sharedTag;
  if (later && later.has(cand.id)) score += LINK_SCORE.laterInRoute;
  if (cand.bunri && (cand.bunri === book.bunri || cand.bunri === 'both')) score += LINK_SCORE.sameBunri;
  if (cand.recordType === 'routePlaceholder') score += LINK_SCORE.placeholder;
  return score;
}

/** 同じ役割・近い難易度の本（横の選択肢）。unis のタグが重なる本を先に置く */
export function pickAlternatives(book, books, max = 6) {
  // 難易度を持たない本は、近さを測れないので横にも縦にも並べない。
  // NaN 比較で暗黙に空になるが、意図として明示しておく
  if (isProvisional(book)) return [];
  const tag = (b) => (sharesTag(book, b) ? LINK_SCORE.sharedTag : 0);
  return books
    .filter(b => !isProvisional(b) && b.id !== book.id && b.stage === book.stage
      && (book.sub ? b.sub === book.sub : true)
      && Math.abs(b.diff - book.diff) <= 1)
    .sort((a, b) => tag(b) - tag(a)
      || Math.abs(a.diff - book.diff) - Math.abs(b.diff - book.diff) || byDifficultyAsc(a, b))
    .slice(0, max);
}

/**
 * この本のあとに進む本（縦の接続）。
 * 同じ役割の上位と、次の段階の本を並べる。
 * 「同じレベルの選択肢」として既に出した本は、重複を避けるため除外する。
 *
 * @param {object} book
 * @param {object[]} books   同じ科目の BOOKS
 * @param {object[]} exclude pickAlternatives の結果
 * @param {string} dir       科目
 * @param {object} routes    同じ科目の ROUTES（ルート上の位置を見る）
 */
export function pickNext(book, books, exclude, dir, routes, max = 6) {
  if (isProvisional(book)) return { list: [], kind: 'same' };
  const skip = new Set([book.id, ...exclude.map(b => b.id)]);
  const later = laterInRoutes(book.id, routes);
  const order = (a, b) => linkScore(book, b, later) - linkScore(book, a, later) || byDifficultyAsc(a, b);

  const sameRole = books
    .filter(b => !isProvisional(b) && !skip.has(b.id) && b.stage === book.stage
      && (book.sub ? b.sub === book.sub : true) && b.diff > book.diff)
    .sort(order)
    .slice(0, 3);

  // 次の段階は build/lib/flow.mjs が持つ接続表に限る。
  // STAGES の並び順で「自分より後ろ」を全部拾うと、英文解釈のページに英作文が
  // 並ぶような役割の飛びが出る（解釈 → 英作文は積み上げの順序ではない）。
  // 1 つの役割で枠を埋めきらないよう、役割ごとに 2 冊までにする。
  const allowed = nextStages(dir, book.stage);
  const byStage = new Map();
  books
    .filter(b => !isProvisional(b) && !skip.has(b.id) && allowed.includes(b.stage)
      && (book.sub ? b.sub === book.sub : true) && b.diff >= book.diff)
    .sort(order)
    .forEach(b => {
      const arr = byStage.get(b.stage) || [];
      if (arr.length < 2) { arr.push(b); byStage.set(b.stage, arr); }
    });
  // 役割をまたいでもスコアの高い順に並べる（接続表の順で役割ごとに固めない）
  const later2 = allowed
    .flatMap(k => byStage.get(k) || [])
    .sort(order)
    .slice(0, max - sameRole.length);

  const kind = sameRole.length && later2.length ? 'mixed' : later2.length ? 'later' : 'same';
  return { list: [...sameRole, ...later2].slice(0, max), kind };
}

/**
 * この本の前に置く本（縦の接続の逆向き）。
 *
 * 志望校別ルートの全志望レベル・全トラック・全方針（omni / quick）の本編を見て、
 * この本が i 番目にあるときの i-1 番目の本を数える。多く出た順に最大 3 冊。
 * 並行して進める本・ルートに載っていない本は、前に置く本が決まらないので空になる。
 *
 * @param {object} book
 * @param {object[]} books  同じ科目の BOOKS
 * @param {object} routes   同じ科目の ROUTES
 * @param {object[]} tiers  同じ科目の TIERS（並び順と表示名に使う）
 * @returns {{book: object, count: number, tier: object}[]}  tier はその組み合わせが最初に出る志望レベル
 */
export function pickPrev(book, books, routes, tiers, max = 3) {
  const byId = new Map(books.map(b => [b.id, b]));
  const found = new Map();   // 前の本の id → {count, tier, order}
  (tiers || []).forEach((tier, order) => {
    const node = (routes || {})[tier.id] || {};
    for (const [k, v] of Object.entries(node)) {
      if (!v || Array.isArray(v) || k === 'para' || k === 'final' || k === 'basic') continue;
      for (const pol of ['omni', 'quick']) {
        const list = v[pol] || [];
        const i = list.findIndex(s => s.id === book.id);
        if (i <= 0) continue;
        const prevId = list[i - 1].id;
        const cur = found.get(prevId);
        if (cur) cur.count++;
        else found.set(prevId, { count: 1, tier, order });
      }
    }
  });
  return [...found.entries()]
    .map(([id, x]) => ({ book: byId.get(id), count: x.count, tier: x.tier, order: x.order }))
    .filter(x => x.book && x.book.recordType !== 'routePlaceholder' && x.book.id !== book.id)
    .sort((a, b) => b.count - a.count || a.order - b.order || a.book.id.localeCompare(b.book.id))
    .slice(0, max)
    .map(({ book: b, count, tier }) => ({ book: b, count, tier }));
}
