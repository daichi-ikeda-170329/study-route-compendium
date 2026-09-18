/**
 * 1 冊の本が志望校別ルート（ROUTES）のどこに置かれているかを集める。
 *
 * 書籍ページの「志望校別ルートでの位置」節が使う。ページごとに固有の情報
 * （何冊目か・前後の本・そのルートでの狙い・代わりに使える本）を、ROUTES から
 * 数えて出すためのもので、文章はここでは作らない（作るのは generate-books.mjs）。
 *
 * 2026-09-18 に足した。書籍ページは書誌と 200 字前後の解説のほかは共通テンプレートが
 * 多く、Google AdSense に「有用性の低いコンテンツ」で落とされ（2026-09-05）、
 * 8 月のコアアップデート（08-26〜09-21）に重なって検索表示が 1 日 1,000 回超から
 * 30 回前後まで落ちた。その本でしか成り立たない文を増やすのが狙い。
 *
 * ## 数え方
 *
 * - 本編: ROUTES[tier][track][omni|quick] の配列。本編が同一のトラック（英語の
 *   国公立二次型と私立個別型など）は build/lib/tracks.mjs の groupTracks でまとめ、
 *   1 行に「国公立二次型・私立個別型」と並べる（別々に出すと同じ行が 2 回並ぶ）
 * - 代替: 本編の各段の alts に入っている本。「○冊目の△△の代わりに使える本」
 * - 並行・仕上げ: ROUTES[tier].para / final
 *
 * `lines` は本編の本数（tier × track × 方針。まとめない実数）。
 * 「42 本のルート」のような全体の本数は、ここ以外に書かない（データが増えると古くなる）。
 */
import { groupTracks, trackKeys, trackLabel } from './tracks.mjs';

export const POLICY_LABEL = { omni: '王道網羅型', quick: '時短・精選型' };

/**
 * @param {object} book  BOOKS の 1 冊
 * @param {object} d     loadSubjectData() の戻り（routes / tiers / books / unis / config）
 * @returns {{
 *   lines: number,
 *   adopted: number,
 *   main: {tier: object, tracks: string[], trackNames: string, policy: string, policyName: string,
 *          index: number, total: number, prev: object|null, next: object|null,
 *          note: string, alts: object[]}[],
 *   asAlt: {tier: object, tracks: string[], trackNames: string, policy: string, policyName: string,
 *           index: number, total: number, forBook: object, note: string}[],
 *   side: {tier: object, tracks: string[], trackNames: string, kind: 'para'|'final', note: string}[],
 * }}
 */
export function routePositions(book, d) {
  const byId = new Map((d.books || []).map(b => [b.id, b]));
  const out = { lines: 0, adopted: 0, main: [], asAlt: [], side: [] };
  const routes = d.routes || {};
  const names = (keys) => keys.map(k => trackLabel(d, k, 'short')).join('・');

  for (const tier of d.tiers || []) {
    const node = routes[tier.id];
    if (!node) continue;
    // 本編の本数は、まとめる前のトラック数で数える
    for (const k of trackKeys(node)) {
      for (const pol of Object.keys(POLICY_LABEL)) if (Array.isArray(node[k][pol]) && node[k][pol].length) out.lines++;
    }
    for (const g of groupTracks(node)) {
      const trackNames = names(g.keys);
      for (const pol of Object.keys(POLICY_LABEL)) {
        const list = Array.isArray(g.seq[pol]) ? g.seq[pol] : [];
        if (!list.length) continue;
        const i = list.findIndex(s => s.id === book.id);
        if (i >= 0) {
          out.adopted += g.keys.length;
          out.main.push({
            tier, tracks: g.keys, trackNames, policy: pol, policyName: POLICY_LABEL[pol],
            index: i + 1, total: list.length,
            prev: i > 0 ? byId.get(list[i - 1].id) || null : null,
            next: i + 1 < list.length ? byId.get(list[i + 1].id) || null : null,
            note: list[i].note || '',
            alts: (list[i].alts || []).map(id => byId.get(id)).filter(Boolean),
          });
          continue;
        }
        list.forEach((s, j) => {
          if (!(s.alts || []).includes(book.id)) return;
          const forBook = byId.get(s.id);
          if (!forBook) return;
          out.asAlt.push({
            tier, tracks: g.keys, trackNames, policy: pol, policyName: POLICY_LABEL[pol],
            index: j + 1, total: list.length, forBook, note: s.note || '',
          });
        });
      }
      for (const kind of ['para', 'final']) {
        for (const sub of g[kind] || []) {
          const hit = sub.list.find(s => s.id === book.id);
          if (hit) out.side.push({ tier, tracks: sub.keys, trackNames: names(sub.keys), kind, note: hit.note || '' });
        }
      }
    }
  }
  return out;
}

/**
 * 同じ役割（stage）でルートに採用している本を、採用回数の多い順に返す。
 * ルートに載っていない本のページで「代わりに何を採用しているか」を示すため。
 * 単語帳のように並行枠（para）にしか置かない役割があるので、本編だけでなく
 * 並行・仕上げの枠も数える。
 */
export function adoptedPeers(book, d, max = 3) {
  const count = new Map();
  const add = (list) => { for (const s of list || []) if (s && s.id) count.set(s.id, (count.get(s.id) || 0) + 1); };
  for (const node of Object.values(d.routes || {})) {
    for (const k of trackKeys(node)) for (const pol of Object.keys(POLICY_LABEL)) add(node[k][pol]);
    for (const kind of ['para', 'final']) {
      const v = node[kind];
      if (Array.isArray(v)) add(v);
      else if (v) for (const list of Object.values(v)) add(list);
    }
  }
  return (d.books || [])
    .filter(b => b.id !== book.id && b.stage === book.stage && (book.sub ? b.sub === book.sub : true) && count.has(b.id))
    .sort((a, b) => count.get(b.id) - count.get(a.id) || a.id.localeCompare(b.id))
    .slice(0, max)
    .map(b => ({ book: b, count: count.get(b.id) }));
}

/**
 * 志望レベルに属する大学のうち、大学別ページ（/univ/<slug>/）があるもの。
 * @param {object} tier
 * @param {object} d
 * @param {Map<string,string>} slugByName  大学名 → slug
 */
export function tierUniversities(tier, d, slugByName, max = 5) {
  return (d.unis || [])
    .filter(u => u.t === tier.id && slugByName.has(u.n))
    .slice(0, max)
    .map(u => ({ name: u.n, slug: slugByName.get(u.n) }));
}
