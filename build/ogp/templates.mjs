/**
 * OGP 画像の SVG テンプレート。**文字を差し込む関数として書く**（できあがった SVG を
 * ファイルで持つと、冊数や書名を入れ直せなくなる。前の assets/ogp*.png がそれで
 * 更新できなくなった）。
 *
 * 見た目は 2026-08 に置かれた既存の OGP に寄せてある。背景 #F6F4EF、上端に科目色の帯、
 * 見出しは明朝、それ以外はゴシック。色は build/lib/extract.mjs の SUBJECTS[].color。
 *
 * 1200×630 で書き出す（og:image:width / height が build/lib/parts.mjs でこの値）。
 */
import { SANS, SERIF } from './fonts.mjs';

export const W = 1200;
export const H = 630;

/** 地の色。サイトの theme-color と同じ */
const BG = '#F6F4EF';
/** 文字色。濃い順に見出し・本文・添え物 */
const INK = '#1B2437';
const INK2 = '#3A4152';
const INK3 = '#7A8090';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * 文字列の描画幅を em 単位で見積もる。
 *
 * resvg は文字送りを測る API を持たないので、折り返しの判断はここでやる。全角は 1em、
 * 半角英数・記号は 0.5em として数える。厳密ではないが、**書名を勝手に略さない**ために
 * 必要なのは「2 行に収まるか」の判定だけなので、この粒度で足りる。
 */
export function widthEm(s) {
  let w = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    // 半角の英数・記号・カナ。それ以外（かな・漢字・全角記号）は全角として数える
    w += (cp <= 0x2ff || (cp >= 0xff61 && cp <= 0xff9f)) ? 0.5 : 1;
  }
  return w;
}

/**
 * 指定した em 幅で最大 `lines` 行に折り返す。入り切らなければ末尾を「…」で切る。
 * **書名を途中で省略しない**のが原則なので、切るのは 2 行でも収まらないときだけ。
 */
export function wrap(text, maxEm, lines) {
  const chars = [...String(text)];
  const out = [];
  let cur = '', curW = 0;
  for (const ch of chars) {
    const w = widthEm(ch);
    if (curW + w > maxEm && cur) {
      out.push(cur);
      if (out.length === lines) break;
      cur = ''; curW = 0;
    }
    cur += ch; curW += w;
  }
  if (out.length < lines && cur) out.push(cur);
  // 収まらなかったぶんがあるなら、最終行の末尾を … にする
  const used = out.join('').length;
  if (used < chars.length && out.length) {
    let last = [...out[out.length - 1]];
    while (last.length && widthEm(last.join('') + '…') > maxEm) last.pop();
    out[out.length - 1] = last.join('') + '…';
  }
  return out;
}

/** 全ページ共通の下地（地の色・点の模様・上端の帯） */
function base(color) {
  return `<rect width="${W}" height="${H}" fill="${BG}"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
<rect width="${W}" height="10" fill="${color}"/>`;
}

/** 点の模様。既存の OGP と同じ、ごく薄い水玉 */
const DEFS = `<defs>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
  <circle cx="4" cy="4" r="1.6" fill="#1B2437" fill-opacity="0.05"/>
</pattern>
</defs>`;

/** 下端の署名。左にサイト名、右に無料であること */
function footer() {
  return `<line x1="72" y1="527" x2="1128" y2="527" stroke="${INK}" stroke-opacity="0.12" stroke-width="1"/>
<text x="72" y="562" font-family="${SANS}" font-size="21" font-weight="700" letter-spacing="2.4" fill="${INK3}">ROUTE-TAIZEN.COM</text>
<text x="1128" y="562" text-anchor="end" font-family="${SANS}" font-size="21" font-weight="500" fill="${INK3}">登録不要・完全無料</text>`;
}

/** 右上の科目マーク（英・国・数…）を入れた四角 */
function badge(mark, color) {
  return `<rect x="932" y="72" width="208" height="200" rx="10" fill="${color}"/>
<text x="1036" y="222" text-anchor="middle" font-family="${SERIF}" font-size="128" font-weight="800" fill="#FFFFFF">${esc(mark)}</text>`;
}

/**
 * 科目トップ・サイト共通の OGP。
 *
 * **冊数は必ず引数で受ける。**テンプレートに数字を書かない（前の画像が更新できなく
 * なった原因がこれ）。
 *
 * @param {object} o full 見出し / en 英語表記 / ja 科目名 / mark 1 文字 /
 *   color 科目色 / fields 分野 / count 冊数 / tags 下に並べる役割名 / lead 冊数行の後半
 */
export function subjectSvg(o) {
  const count = o.count.toLocaleString('en-US');
  // 並べられるだけ並べる。枚数を決め打ちすると、科目によって末尾が切れたり
  // 余白が空いたりする（共通画像で「小論文」が落ちていた）
  let x = 72;
  const chipSvg = (o.tags || []).map(t => {
    const w = Math.round(widthEm(t) * 25 + 34);
    if (x + w > 1128) return '';
    const g = `<g><rect x="${x}" y="446" width="${w}" height="48" rx="6" fill="#FFFFFF" stroke="${INK}" stroke-opacity="0.14"/>`
      + `<text x="${x + w / 2}" y="477" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="500" fill="${INK2}">${esc(t)}</text></g>`;
    x += w + 14;
    return g;
  }).filter(Boolean).join('\n');

  // 見出しは 1 行で収める。長いときだけ字を詰める
  const titleSize = Math.min(92, Math.floor(760 / Math.max(widthEm(o.full), 1) * 1.0));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${DEFS}
${base(o.color)}
<text x="72" y="86" font-family="${SANS}" font-size="24" font-weight="700" letter-spacing="3" fill="${o.color}">${esc(o.en)}　—　大学受験 ${esc(o.ja)}</text>
<text x="72" y="${100 + titleSize}" font-family="${SERIF}" font-size="${titleSize}" font-weight="800" letter-spacing="2" fill="${INK}">${esc(o.full)}</text>
<text x="72" y="285" font-family="${SANS}" font-size="30" font-weight="400" fill="${INK2}">${esc(o.fields)}</text>
<text x="72" y="336" font-family="${SANS}" font-size="30" font-weight="400" fill="${INK2}">参考書<tspan font-size="36" font-weight="700" fill="${o.color}">${count}冊</tspan>${esc(o.lead)}</text>
${badge(o.mark, o.color)}
${chipSvg}
${footer()}
</svg>`;
}

/**
 * 参考書 1 冊の OGP。
 *
 * 数字の出し方はサイトの方針に合わせる。評価が未了の新刊（isProvisional）は難易度も
 * 到達目安も持たないので出さない。レベル別・分冊・参照系（seriesOf）は、難易度の数字を
 * 単独で読ませずシリーズの注記を出す。
 *
 * @param {object} o name 書名 / subject 科目名 / color 科目色 / role 役割ラベル /
 *   roleColor 役割の色 / lines 右下に積む注記（難易度・到達目安・シリーズ）
 */
export function bookSvg(o) {
  // 書名は略さない。2 行に収まる大きさを大きいほうから探し、最後まで収まらないときだけ
  // 末尾を「…」で切る（現在の 1,390 冊は最長 31 字で、いちばん小さい段まで行かずに収まる）
  const TITLE_W = 1050;   // x=72 から右端 1128 まで、少し余裕を取る
  const TRACKING = 1;     // <text> の letter-spacing。1 字あたりの送りに足す
  const SIZES = [68, 62, 56, 50];
  const fit = px => wrap(o.name, TITLE_W / (px + TRACKING), 2);
  let size = SIZES[SIZES.length - 1];
  let lines = fit(size);
  for (const px of SIZES) {
    const cand = fit(px);
    if (cand.join('') === o.name) { size = px; lines = cand; break; }
  }
  const top = lines.length === 1 ? 250 : 212;
  const title = lines.map((t, i) =>
    `<text x="72" y="${top + i * (size + 16)}" font-family="${SERIF}" font-size="${size}" font-weight="800" letter-spacing="1" fill="${INK}">${esc(t)}</text>`
  ).join('\n');

  const roleW = Math.round(widthEm(o.role) * 26 + 40);
  const meta = (o.lines || []).map((t, i) =>
    `<text x="${72 + roleW + 22}" y="${384 + i * 40}" font-family="${SANS}" font-size="27" font-weight="500" fill="${INK2}">${esc(t)}</text>`
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${DEFS}
${base(o.color)}
<text x="72" y="86" font-family="${SANS}" font-size="24" font-weight="700" letter-spacing="3" fill="${o.color}">${esc(o.subject)}　参考書図鑑</text>
${title}
<rect x="72" y="352" width="${roleW}" height="48" rx="6" fill="${o.roleColor}"/>
<text x="${72 + roleW / 2}" y="384" text-anchor="middle" font-family="${SANS}" font-size="25" font-weight="700" fill="#FFFFFF">${esc(o.role)}</text>
${meta}
${footer()}
</svg>`;
}

/**
 * 大学別ページ（/univ/<slug>/）の OGP（仕様書 3.3）。
 *
 * 大学名を大きく出し、科目共通の志望レベルの帯（build/lib/tiers.mjs の TIER_GROUP）と、
 * 5 科目の目標偏差値を横に並べる。**数字は引数で受ける**（universities.json の h）。
 *
 * @param {object} o name 大学名 / kind 区分（国立・私立…）/ group 帯の名前 / color 帯の色 /
 *   scores [{ja: '英語', h: 67, color: '#B5432A'}]（5 科目）
 */
export function univSvg(o) {
  // 大学名は 1 行で収める。長いときだけ字を詰める（最長は「〇〇県立〇〇大学」程度）
  const size = Math.min(88, Math.floor(1040 / Math.max(widthEm(o.name), 1)));
  const n = o.scores.length || 1;
  const gap = 14;
  const boxW = Math.floor((1056 - gap * (n - 1)) / n);
  const boxes = o.scores.map((s, i) => {
    const x = 72 + i * (boxW + gap);
    return `<g><rect x="${x}" y="356" width="${boxW}" height="132" rx="8" fill="#FFFFFF" stroke="${INK}" stroke-opacity="0.12"/>`
      + `<rect x="${x}" y="356" width="${boxW}" height="8" rx="4" fill="${s.color}"/>`
      + `<text x="${x + boxW / 2}" y="404" text-anchor="middle" font-family="${SANS}" font-size="26" font-weight="700" fill="${INK2}">${esc(s.ja)}</text>`
      + `<text x="${x + boxW / 2}" y="462" text-anchor="middle" font-family="${SANS}" font-size="42" font-weight="700" fill="${s.color}">${esc(String(s.h))}</text></g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${DEFS}
${base(o.color)}
<text x="72" y="86" font-family="${SANS}" font-size="24" font-weight="700" letter-spacing="3" fill="${o.color}">大学別 参考書ルート　—　${esc(o.group)}</text>
<text x="72" y="${118 + size}" font-family="${SERIF}" font-size="${size}" font-weight="800" letter-spacing="2" fill="${INK}">${esc(o.name)}</text>
<text x="72" y="318" font-family="${SANS}" font-size="28" font-weight="400" fill="${INK2}">${esc(o.kind ? `${o.kind}・` : '')}科目ごとの目標偏差値と、出題に合わせた参考書</text>
${boxes}
${footer()}
</svg>`;
}
