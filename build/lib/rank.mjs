/**
 * 難易度の並び順。生成ページ（参考書一覧・おすすめ・書籍ページ）で使う。
 *
 * `diff`（1〜10）だけで並べると、同じ diff の中で「40〜55 → 〜48 → 35〜50」の
 * ように目安偏差値が前後して、画面では難易度順に見えない。diff が並んだときは
 * 目安偏差値（下限 → 上限 → 書名）まで見て決める。
 *
 * **実装は assets/js/subject-common.js の 1 つだけ**（仕様書 5.5）。科目トップと同じ関数を
 * createRequire で読んで、名前だけ付け替えて出す。2026-09-11 までは科目トップ 7 本と
 * ここに同じ処理が書き写してあり、テストで「両方の結果が一致すること」を確かめていた。
 */
import { createRequire } from 'node:module';
import { isProvisional } from './newbooks.mjs';

const RTCommon = createRequire(import.meta.url)('../../assets/js/subject-common.js');

/**
 * 目安偏差値の [下限, 上限]。「45〜60」「〜50(導入)」「68〜」「50〜75(3段階)」を拾う。
 * 下限を書いていない（「〜50」）本は 0 とみなし、同じ難易度の中で先に来る。
 *
 * 「共テ7割〜9割」「東大合格レベル」「全レベル」のように偏差値で書いていない本は
 * [999, 999] を返し、数値で書いてある本のうしろへまとめる。混ぜると得点率の数字が
 * 偏差値として並び、7 割の本が偏差値 40 の本より前に出てしまう。
 * 収録 1,390 冊のうち 207 冊がこの書き方である。
 */
export const hensachiRange = RTCommon.hRange;

/** やさしい順。評価未了（diff を持たない）本は常に末尾 */
export const byDifficultyAsc = RTCommon.byDiffAsc;

/**
 * 難しい順。評価未了の本と、偏差値を書いていない本は、昇順と同じく末尾に置く
 * （降順だからといって先頭へ出さない。[999,999] をそのまま降順に通すと先頭に来る）
 */
export const byDifficultyDesc = RTCommon.byDiffDesc;

/** 難易度を持つ本か（並びの検証に使う） */
export function hasDifficulty(b) {
  return !isProvisional(b) && typeof b.diff === 'number';
}
