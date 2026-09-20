/**
 * 書籍ページに並ぶ「同じ役割の本」「次に進む本」のカードに出す、**そのページの本との違い**。
 *
 * もともとこれらのカードには相手の本の `desc`（概要文）をそのまま出していた。
 * 概要文は一覧ページ・記事・ほかの書籍ページでも同じものが出るので、1 冊の desc が
 * 6〜8 ページに複製される。実測では書籍ページ 1,390 枚の本文の 78% が
 * ページをまたいで一致する文で、AdSense はこれを「有用性の低いコンテンツ」として
 * 2026-09-20 に却下した（2 度目）。
 *
 * 概要文を消すだけだと読み手が困るので、**そのページでしか成り立たない文**に置き換える。
 * 「この本と比べて難易度がいくつ違い、想定時間がどれだけ違うか」は A のページと
 * B のページで別の文になるため、複製されない。並べて比べるという、そもそもこの
 * セクションがやりたかったことにも近い。
 *
 * **推測は書かない。** 使うのは BOOKS が実際に持っている値（diff・h）だけで、
 * 「解説が詳しい」のようなデータにない評価は入れない。
 *
 * **カードに出ている数字は繰り返さない**（docs/style-guide.md）。難易度・到達目安・
 * 問題数はカードの足元に並んでいるので、ここで書くのは差分（何段違うか、
 * 想定時間が何時間違うか）だけにする。差分はどちらのページにも表として
 * 出ていない、この並べ方でしか出てこない情報にあたる。
 */

/** 想定時間の差をこの割合までは「ほぼ同じ」と見る（120h に対して 18h） */
const SAME_HOURS_RATIO = 0.15;

/**
 * base のページに置く cand のカード用の 1 行。
 *
 * 比べられる値を持たないとき（新刊など diff が無い本）は null を返す。
 * 呼び出し側は概要文に戻すこと。
 *
 * @param {object} base そのページの本
 * @param {object} cand カードに出す本
 * @returns {string|null}
 */
export function compareNote(base, cand) {
  if (!base || !cand) return null;
  if (typeof base.diff !== 'number' || typeof cand.diff !== 'number') return null;

  // 1. 難易度は何段違うか。同じ 10 段階の物差しなので、差をそのまま段数で言える
  const dd = cand.diff - base.diff;
  const head = dd === 0 ? 'この本と同じ難易度'
    : dd > 0 ? `この本より ${dd} つ上の難易度`
      : `この本より ${-dd} つ下の難易度`;

  // 2. 想定時間は何時間違うか。h（想定時間の代表値）は全冊が持つ
  const bh = Number(base.h);
  const ch = Number(cand.h);
  if (!Number.isFinite(bh) || !Number.isFinite(ch) || bh <= 0 || ch <= 0) return `${head}。`;

  const gap = ch - bh;
  const tail = Math.abs(gap) / bh < SAME_HOURS_RATIO ? '想定時間はほぼ同じ'
    : gap > 0 ? `仕上げるのに ${gap}h 多くかかる`
      : `${-gap}h 短く終わる`;

  return `${head}で、${tail}。`;
}

/** 概要文の 1 文目だけ。句点が無ければ全体を返す */
function firstSentence(desc) {
  const t = String(desc || '').trim();
  if (!t) return '';
  const i = t.indexOf('。');
  return i < 0 ? t : t.slice(0, i + 1);
}

/**
 * 書籍ページの関連書カードに出す文。
 *
 * 差分だけだと、同じ役割・同じ難易度で選んだ候補が並ぶ Alternatives で
 * 「この本と同じ難易度で、想定時間はほぼ同じ。」が何枚も続き、どれを選ぶかの
 * 手がかりが消える。そこで差分（このページ固有）のあとに、相手の概要文を
 * **1 文だけ**添える。概要文はほかのページにも出る文なので、全文（72 字で
 * 切っていた）ではなく 1 文目に絞って、複製される量を減らす。
 *
 * @param {object} base そのページの本
 * @param {object} cand カードに出す本
 * @returns {string} 空文字なら呼び出し側の既定（概要文）に任せる
 */
export function cardNote(base, cand) {
  const diff = compareNote(base, cand);
  const head = firstSentence(cand?.desc);
  if (!diff) return head;
  return head ? `${diff}${head}` : diff;
}
