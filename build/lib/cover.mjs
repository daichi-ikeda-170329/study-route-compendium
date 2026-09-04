/**
 * 書影（本の表紙画像）の共通パーツ。
 *
 * 画像は Amazon・国立国会図書館サーチ・openBD が公開している商品画像 URL を
 * 参照するだけで、保存も加工もしない。どれも取れない本があるので、
 * 書名と出版社を出す代替表示を必ず画像の下に敷いておく。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { esc } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * 候補の作り方は assets/js/cover-resolver.js が持つ。**ここに写さない。**
 *
 * 以前はこのファイルと各科目の描画コードに同じような関数が 2 つあり、
 * 中身が食い違っていた（こちらは Amazon → NDL → openBD の 4 候補、
 * 科目トップ側は Amazon の 2 候補だけ）。同じ本なのに、書籍ページでは表紙が出て
 * 科目トップでは出ない差が生まれていた。ブラウザからも Node からも
 * 同じファイルを読む形にして 1 本化した。
 */
const resolver = require(path.join(HERE, '../../assets/js/cover-resolver.js'));

/** 取得元の利用条件。enabled が false の provider は候補に入れない */
export const COVER_POLICIES = JSON.parse(
  fs.readFileSync(path.join(HERE, '../data/cover-provider-policies.json'), 'utf8'),
);

/**
 * 書影の候補 URL を優先順に返す。
 *
 * Amazon は画像を持たない ISBN に対して 43 バイトほどの 1x1 画像を
 * HTTP 200 で返すことがある。この場合 onerror は発火しないので、
 * 表示側で naturalWidth を見て次の候補へ送る。
 */
export function coverSrcs(b) {
  return resolver.coverSrcs(b, COVER_POLICIES);
}

/** その URL がどの provider のものか */
export function providerOf(url) {
  return resolver.providerOf(url, COVER_POLICIES);
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
