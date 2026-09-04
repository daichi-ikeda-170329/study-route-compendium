/**
 * そのページを検索エンジンに載せてよいかの判定。
 *
 * **薄いページを大量に載せない。** ただし、**既に流入のある URL を
 * 一律に noindex にしない**（指示書 8.3）。検索経由でたどり着いている人を
 * 判断材料なしに締め出すことになるため、対象は「固有の価値がまだ無いと
 * データ上わかるページ」だけに絞る。
 *
 * いまの対象は 1 つだけ。
 *   評価準備中の新刊 … 難易度・到達目安・強み・注意点・向く人をまだ持たない。
 *                      書誌情報の定型しか無いので、検索結果に出しても
 *                      読み手の役に立たない。評価を書いたら自動で index へ戻る。
 *
 * 「確認していない」ことだけを理由に noindex にはしない。書誌情報が未確認でも、
 * 役割・接続関係・代替の説明という固有の内容があるページは載せてよい。
 * 未確認であることは画面の「この情報の確かめ方」で伝える。
 */
import { isProvisional } from './newbooks.mjs';

/**
 * @param {object} book BOOKS の 1 冊
 * @returns {{indexable:boolean, reason:string}}
 */
export function bookIndexable(book) {
  if (isProvisional(book)) {
    return { indexable: false, reason: '評価準備中（難易度・到達目安・使い方をまだ書いていない）' };
  }
  return { indexable: true, reason: '' };
}

/** noindex にするページへ入れる meta。follow は残す（内部リンクはたどってよい） */
export const NOINDEX_META = '<meta name="robots" content="noindex,follow">';
