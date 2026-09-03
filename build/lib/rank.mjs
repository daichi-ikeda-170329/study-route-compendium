/**
 * 難易度の並び順。生成ページ（参考書一覧・おすすめ・書籍ページ）で使う。
 *
 * `diff`（1〜10）だけで並べると、同じ diff の中で「40〜55 → 〜48 → 35〜50」の
 * ように目安偏差値が前後して、画面では難易度順に見えない。diff が並んだときは
 * 目安偏差値（下限 → 上限 → 書名）まで見て決める。
 *
 * **科目トップ（各 index.html）にも同じ処理が `hRange` / `byDiffAsc` /
 * `byDiffDesc` として書いてある。** 単一 HTML でビルド工程を持たないため
 * import できない。直すときは `rg 'function byDiffAsc'` で全箇所を出す。
 */
import { isProvisional, provisionalLast } from './newbooks.mjs';

/**
 * 目安偏差値の [下限, 上限]。「45〜60」「〜50(導入)」「68〜」「50〜75(3段階)」を拾う。
 * 下限を書いていない（「〜50」）本は 0 とみなし、同じ難易度の中で先に来る。
 *
 * 「共テ7割〜9割」「東大合格レベル」「全レベル」のように偏差値で書いていない本は
 * [999, 999] を返し、数値で書いてある本のうしろへまとめる。混ぜると得点率の数字が
 * 偏差値として並び、7 割の本が偏差値 40 の本より前に出てしまう。
 * 収録 1,390 冊のうち 207 冊がこの書き方である。
 */
export function hensachiRange(b) {
  const s = String((b && b.hensachi) || '');
  const nums = (s.match(/\d{2}/g) || []).map(Number).filter(n => n >= 25 && n <= 85);
  if (!nums.length) return [999, 999];
  return [/^\s*[〜~]/.test(s) ? 0 : nums[0], nums[nums.length - 1]];
}

/** やさしい順。評価未了（diff を持たない）本は常に末尾 */
export function byDifficultyAsc(a, b) {
  return provisionalLast(a, b) || (a.diff || 0) - (b.diff || 0)
    || hensachiRange(a)[0] - hensachiRange(b)[0]
    || hensachiRange(a)[1] - hensachiRange(b)[1]
    || String(a.name).localeCompare(String(b.name), 'ja');
}

/**
 * 難しい順。評価未了の本と、偏差値を書いていない本は、昇順と同じく末尾に置く
 * （降順だからといって先頭へ出さない。[999,999] をそのまま降順に通すと先頭に来る）
 */
export function byDifficultyDesc(a, b) {
  const ra = hensachiRange(a), rb = hensachiRange(b);
  const unknown = r => (r[0] === 999 ? 1 : 0);
  return provisionalLast(a, b) || (b.diff || 0) - (a.diff || 0)
    || unknown(ra) - unknown(rb) || rb[0] - ra[0] || rb[1] - ra[1]
    || String(a.name).localeCompare(String(b.name), 'ja');
}

/** 難易度を持つ本か（並びの検証に使う） */
export function hasDifficulty(b) {
  return !isProvisional(b) && typeof b.diff === 'number';
}
