/**
 * レコードの種類。BOOKS には「実在する 1 冊」以外のものも入っている。
 *
 * 「志望校の過去問」は、どの大学の何年度版かが利用者ごとに違う **枠** であって、
 * 特定の商品ではない。ところが 2026-09 まで、この枠に東京大学の赤本の ISBN が
 * 入っていた。英語・数学・理科の 3 科目が同じ ISBN 9784325273943 を共有していて、
 * 書影も購入リンクも JSON-LD も「東大の赤本」を指していた。志望校が東大でない
 * 利用者には誤誘導になる。
 *
 * そこで recordType を持たせ、枠は routePlaceholder として区別する。
 *
 *   book             実在する 1 冊。ISBN・書影・Book JSON-LD を持つ
 *   routePlaceholder ルート上の枠。ISBN・ASIN・単一年版を持たず、
 *                    Book JSON-LD を出さず、特定商品への直リンクも出さない
 *
 * recordType を書いていないレコードは book とみなす（recordType を持たない既存レコードとの互換のため）。
 */

/** @param {object} b BOOKS の 1 レコード */
export function recordType(b) {
  return b && b.recordType ? b.recordType : 'book';
}

/** ルート上の枠か。ISBN・書影・商品リンク・Book JSON-LD を出さない分岐に使う */
export function isPlaceholder(b) {
  return recordType(b) === 'routePlaceholder';
}

/**
 * 枠に添える注意書き。年度・学部で中身が変わることを必ず伝える。
 * 表示する場所が複数あるので文言をここに 1 つ置く。
 */
export const PLACEHOLDER_NOTE =
  '志望校・年度・文理を確認して選んでください。学部・入試方式によって出題科目と過去問の冊子が異なります。';

/** 枠の説明。書籍ページの本文と一覧のバッジで使う */
export const PLACEHOLDER_LABEL = 'ルート上の枠（特定の商品ではありません）';

/**
 * 枠の購入導線。特定商品ではなく検索へ送る。
 * 大学名が分かっているときは検索語に足す（診断結果からの遷移で使う）。
 * @param {string} name  枠の表示名
 * @param {string} [uni] 志望校名。分からなければ空
 */
export function placeholderSearchUrl(name, uni = '') {
  const q = [uni, name].filter(Boolean).join(' ');
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(q || '大学別 過去問')}`;
}
