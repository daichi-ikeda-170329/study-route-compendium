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
  // nocover: 商品画像がどこにも無いと確認できた本（未発売など）。
  // Amazon は画像を持たない ISBN に「書名だけを刷った自動生成画像」を返すことがあり、
  // これは 1x1 判定にも onerror にも掛からない。候補を空にして代替表示へ落とす。
  // 科目トップの coverSrcs() にも同じ分岐がある
  if (b.nocover) return [];
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
  // width / height は .rt-cov の aspect-ratio 5/7 と同じ比。CSS が届く前でも
  // 枠の高さが決まるので、読み込みでレイアウトが跳ねない
  return `<img src="${esc(srcs[0])}" alt="${esc(alt)}" width="50" height="70" loading="lazy" decoding="async"`
    + ` referrerpolicy="no-referrer" data-srcs="${esc(srcs.join('|'))}" data-s="0"`
    + ` onload="if(this.naturalWidth&lt;=1)this.onerror()"`
    + ` onerror="var s=this.dataset.srcs.split('|'),n=+this.dataset.s+1;`
    + `if(s.length&gt;n){this.dataset.s=n;this.src=s[n]}else{this.remove()}">`;
}

/**
 * 一覧・ルートに並べる小さな書影。幅は --cw で呼び出し側から決める。
 *
 * @param {object} b     BOOKS の 1 冊
 * @param {object} opts  color: 代替表示の地色 / alt: 代替テキスト
 *
 * alt を既定で空にしているのは、カードの中で書名がすぐ隣のテキストとして
 * 読まれるため。ここに「◯◯の表紙」を入れると、読み上げで書名が 2 回続く。
 * 画像だけが単独で置かれる場所（書籍ページのヒーロー）では alt を渡している。
 */
export function coverBox(b, opts = {}) {
  const color = opts.color || 'var(--sc)';
  return `<span class="rt-cov" style="--cc:${color}">`
    + `<span class="rt-cov__ph"><b>${esc(b.name)}</b><em>${esc(b.pub || '')}</em></span>`
    + imgTag(coverSrcs(b), opts.alt || '')
    + `</span>`;
}
