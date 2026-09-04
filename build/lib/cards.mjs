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
import { seriesOf, hensachiPlain } from './series.mjs';
import { verificationOf } from './verification.mjs';

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
  // レベル別に複数の巻をまとめている本は、難易度の数字がシリーズ全体の代表値。
  // 数字だけを並べると 1 冊の難易度として読まれるので、その場でしるしを付ける
  const series = prov ? null : seriesOf(b);
  const foot = prov
    ? `<span class="bcard__prov">${esc(PROVISIONAL_LABEL)}</span>`
    : `<span class="bcard__diff">${bars}</span><span>難易度 ${b.diff}／${esc(hensachiPlain(b) || '—')}`
      + `${series ? `<span class="bcard__series">${esc(series.label)}</span>` : ''}</span>`;

  // 書誌情報を確かめきれていない本は、カードの時点でそう分かるようにする。
  // 詳細（どの項目を確かめたか）は書籍ページの「この情報の確かめ方」に出る。
  // 色だけで伝えないよう、必ず文字のラベルにする
  const ver = verificationOf(sub.dir, b);
  const verBadge = ver.status === 'unverified'
    ? '<span class="bcard__ver">書誌情報を確認中</span>'
    : ver.status === 'partial' ? '<span class="bcard__ver">一部情報を確認中</span>' : '';

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
        ${verBadge}
      </a>`;
}

/** カードを並べるグリッド。style は呼び出し側の余白調整用 */
export function bookCards(list, sub, stages, style = '') {
  return `      <div class="bcards"${style ? ` style="${style}"` : ''}>
${list.map(b => bookCard(b, sub, stages)).join('\n')}
      </div>`;
}
