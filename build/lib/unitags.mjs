/**
 * BOOKS[].unis（「この本が向く大学・層」のタグ）を扱う道具。
 * 大学別ページのおすすめ（build/lib/uni-picks.mjs）と、書籍ページの「あとに進む本」
 * （build/generate-books.mjs）が同じ分け方を使う。
 */

/** タグから括弧書きを外し、「・」で分ける。「東大・京大」→ 東大 / 京大 */
export function tagParts(raw) {
  return String(raw)
    .replace(/[（(][^）)]*[）)]/g, '')
    .split('・')
    .map(s => s.trim())
    .filter(Boolean);
}

/** 本のタグをすべて分けた集合 */
export function tagSet(book) {
  const out = new Set();
  for (const raw of [].concat((book && book.unis) || [])) for (const p of tagParts(raw)) out.add(p);
  return out;
}

/** 2 冊のタグに共通するものがあるか */
export function sharesTag(a, b) {
  const sa = tagSet(a);
  if (!sa.size) return false;
  for (const t of tagSet(b)) if (sa.has(t)) return true;
  return false;
}
