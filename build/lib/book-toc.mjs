/**
 * 書籍ページの「このページの目次」。本文の <h2 class="sec"> を拾い、節へ飛ぶ札を
 * 書籍ヒーローの直後に置く（2026-11-04〜）。スマホで 8,000px を超えるページを、
 * 読みたい節（使い方・購入など）まで指でこすらずに済ませるため。
 *
 * - 見出しに id を振る（s-1, s-2 …。出現順なので生成のたびに同じになる）
 * - 札の文字は短い呼び名にする（長い見出しのままだと横に流れて読めない）
 * - 目次そのものは更新日の材料に入れない（updated.mjs の mainText が <nav class="bk-secnav"> を外す）
 */
const SHORT = new Map([
  ['基本情報', '基本情報'],
  ['この参考書の状態を記録する', '記録'],
  ['この本の評価について', '評価'],
  ['どんな人に向いているか', '向いている人'],
  ['シリーズの巻を選ぶ', 'シリーズ'],
  ['構成', '構成'],
  ['使い方の手順', '使い方'],
  ['終わりの基準', '終わりの基準'],
  ['1 周にかかる期間の目安', '期間の目安'],
  ['志望校別ルートでの位置', 'ルート上の位置'],
  ['この本の前に置く本', '前に置く本'],
  ['同じ役割・同じレベルの参考書', '代わりの本'],
  ['この本のあとに進む参考書', '次に進む本'],
  ['改訂の履歴', '改訂'],
  ['購入する', '購入'],
]);

const H2 = /<h2 class="sec">([^<]+)<\/h2>/g;

export function addSectionNav(html) {
  const found = [];
  let n = 0;
  const out = html.replace(H2, (m, text) => {
    n++;
    found.push({ id: `s-${n}`, label: SHORT.get(text.trim()) || text.trim() });
    return `<h2 class="sec" id="s-${n}">${text}</h2>`;
  });
  if (found.length < 4) return out;
  const nav = `<nav class="bk-secnav" aria-label="このページの目次">${found.map(f => `<a href="#${f.id}">${f.label}</a>`).join('')}</nav>\n\n    `;
  // ヒーローの直後（最初の節の手前）に置く
  const at = out.indexOf('<section class="block">');
  if (at < 0) return out;
  return out.slice(0, at) + nav + out.slice(at);
}
