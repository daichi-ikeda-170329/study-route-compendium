/**
 * 書影（本の表紙画像）の共通パーツ。
 *
 * 画像は Amazon・国立国会図書館サーチ・openBD が公開している商品画像 URL を
 * 参照するだけで、保存も加工もしない。どれも取れない本があるので、
 * 書名と出版社を出す代替表示を必ず画像の下に敷いておく。
 */
import { esc } from './extract.mjs';

/**
 * 書影の候補 URL を優先順に返す。
 *
 * Amazon は画像を持たない ISBN に対して 43 バイトほどの 1x1 画像を
 * HTTP 200 で返すことがある。この場合 onerror は発火しないので、
 * 表示側で naturalWidth を見て次の候補へ送る（科目ページと同じ方式）。
 */
export function coverSrcs(b) {
  const key = b.isbn10 || b.asin;
  const list = [];
  if (b.cover) list.push(b.cover);
  if (key) {
    list.push(`https://images-fe.ssl-images-amazon.com/images/P/${key}.09.LZZZZZZZ.jpg`);
    list.push(`https://images-na.ssl-images-amazon.com/images/P/${key}.09.LZZZZZZZ.jpg`);
  }
  if (b.isbn13) {
    list.push(`https://ndlsearch.ndl.go.jp/thumbnail/${b.isbn13}.jpg`);
    list.push(`https://cover.openbd.jp/${b.isbn13}.jpg`);
  }
  return list;
}

/**
 * 候補を順に試す <img>。最後の候補も駄目なら自分を消して代替表示に譲る。
 * JavaScript の無い環境では最初の候補だけを試す（読み込めなければ空欄になる）。
 */
function imgTag(srcs, alt) {
  if (!srcs.length) return '';
  return `<img src="${esc(srcs[0])}" alt="${esc(alt)}" loading="lazy" decoding="async"`
    + ` referrerpolicy="no-referrer" data-srcs="${esc(srcs.join('|'))}" data-s="0"`
    + ` onload="if(this.naturalWidth&lt;=1)this.onerror()"`
    + ` onerror="var s=this.dataset.srcs.split('|'),n=+this.dataset.s+1;`
    + `if(s.length&gt;n){this.dataset.s=n;this.src=s[n]}else{this.remove()}">`;
}

/**
 * 一覧・ルートに並べる小さな書影。幅は --cw で呼び出し側から決める。
 *
 * @param {object} b     BOOKS の 1 冊
 * @param {object} opts  color: 代替表示の地色 / alt: 代替テキスト（既定は空 = 装飾扱い）
 */
export function coverBox(b, opts = {}) {
  const color = opts.color || 'var(--sc)';
  return `<span class="rt-cov" style="--cc:${color}">`
    + `<span class="rt-cov__ph"><b>${esc(b.name)}</b><em>${esc(b.pub || '')}</em></span>`
    + imgTag(coverSrcs(b), opts.alt || '')
    + `</span>`;
}
