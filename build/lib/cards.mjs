/**
 * 参考書 1 冊のカード。
 *
 * 一覧（/<科目>/books/）・書籍ページの「同じ役割の本」「次に進む本」・解説記事の
 * 3 か所で同じものを出す。以前は 3 か所に似て非なる HTML が置かれていて、
 * 書影を足すときに直し忘れが出たのでここに 1 本化した。
 * 見た目は assets/site.css の .bcard が持つ。
 */
import { esc, clip } from './extract.mjs';
import { coverBox } from './cover.mjs';
import { isProvisional, PROVISIONAL_LABEL } from './newbooks.mjs';

/**
 * @param {object} b      BOOKS の 1 冊
 * @param {object} sub    SUBJECTS の 1 科目
 * @param {object} stages その科目の STAGES
 */
export function bookCard(b, sub, stages) {
  const st = stages[b.stage] || {};
  const color = st.color || sub.color;

  // 新刊は現物を読んでいないので難易度を持たない。バーは 0 本、数字は出さずに
  // 「評価準備中」と書く。ここで `難易度 ${b.diff}` を通すと undefined が出る
  const prov = isProvisional(b);
  const bars = Array.from({ length: 10 }, (_, i) => `<i class="${!prov && i < b.diff ? 'on' : ''}"></i>`).join('');
  const foot = prov
    ? `<span class="bcard__prov">${esc(PROVISIONAL_LABEL)}</span>`
    : `<span class="bcard__diff">${bars}</span><span>難易度 ${b.diff}／${esc(b.hensachi || '—')}</span>`;

  return `      <a class="bcard" href="/${sub.dir}/books/${b.id}/" style="--bc:${color}">
        <div class="bcard__head">
          ${coverBox(b, { color })}
          <div class="bcard__meta">
            <div class="bcard__top"><span class="bcard__stage">${esc(st.short || '')}</span><span>${esc(b.pub || '')}</span></div>
            <b>${esc(b.name)}</b>
          </div>
        </div>
        <p>${esc(clip(b.desc || `${b.pub} から刊行された新刊。評価は準備中です。`, 72))}</p>
        <div class="bcard__foot">${foot}</div>
      </a>`;
}

/** カードを並べるグリッド。style は呼び出し側の余白調整用 */
export function bookCards(list, sub, stages, style = '') {
  return `      <div class="bcards"${style ? ` style="${style}"` : ''}>
${list.map(b => bookCard(b, sub, stages)).join('\n')}
      </div>`;
}
