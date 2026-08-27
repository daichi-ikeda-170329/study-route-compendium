/**
 * ROUTES を走査して、本の採用状況を数える。
 *
 * 「おすすめ」ページ（generate-picks.mjs）と X 投稿案（gen-x-posts.mjs）の
 * どちらも「ルートに何回組み込んだか」を根拠に本を並べる。数え方が 2 か所に
 * 分かれると、片方だけ直したときに順位が黙ってずれるため、ここに 1 つ置く。
 */

/**
 * @param {object} routes ROUTES（志望レベル → トラック → 方針 → 配列）
 * @param {Array}  tiers  TIERS（志望レベルの定義。id と name を持つ）
 * @returns {{main:Map, alts:Map, where:Map, roles:Map}}
 */
export function tally(routes, tiers) {
  const main = new Map();   // id -> 本線に選んだ回数
  const alts = new Map();   // id -> 代替として挙げた回数
  const where = new Map();  // id -> 採用した志望レベル名の集合
  const roles = new Map();  // id -> ルート上の役割の集合

  const tierName = new Map(tiers.map(t => [t.id, t.name]));

  const walk = (node, tier) => {
    if (Array.isArray(node)) {
      for (const it of node) {
        if (it && typeof it === 'object' && it.id) {
          main.set(it.id, (main.get(it.id) || 0) + 1);
          if (tier) {
            if (!where.has(it.id)) where.set(it.id, new Set());
            where.get(it.id).add(tier);
          }
          if (it.role) {
            if (!roles.has(it.id)) roles.set(it.id, new Set());
            roles.get(it.id).add(it.role);
          }
          for (const a of it.alts || []) alts.set(a, (alts.get(a) || 0) + 1);
        } else {
          walk(it, tier);
        }
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v, tier);
    }
  };

  for (const [tierId, node] of Object.entries(routes)) {
    walk(node, tierName.get(tierId) || tierId);
  }
  return { main, alts, where, roles };
}

