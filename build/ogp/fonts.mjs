/**
 * OGP のラスタライズに使うフォントを用意する。
 *
 * **フォントは明示的に渡す。** resvg の loadSystemFonts に任せると、手元と CI で
 * 字形も行送りも変わり、同じデータから違う画像が出る（gen-ogp.mjs --check が
 * 環境ごとに落ちる）。
 *
 * **フォントファイルはリポジトリに入れない**（ライセンス表記と容量のため）。
 * 初回だけ Google Fonts から取って build/.cache/fonts/ に置き、次からはそれを使う。
 * このディレクトリは .gitignore にある。
 *
 * 使うのはサイト本文と同じ 2 書体（assets/site.css と build/lib/parts.mjs の
 * <link> に同じものが並んでいる）。
 *
 *   Zen Kaku Gothic New … 本文・ラベル（SIL Open Font License 1.1）
 *   Shippori Mincho B1  … 見出し（SIL Open Font License 1.1）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FONT_DIR = path.join(ROOT, 'build', '.cache', 'fonts');

/** 取ってくる書体とウェイト。ファイル名はここから決める */
const WANTED = [
  { family: 'Zen Kaku Gothic New', weight: 400 },
  { family: 'Zen Kaku Gothic New', weight: 500 },
  { family: 'Zen Kaku Gothic New', weight: 700 },
  { family: 'Zen Kaku Gothic New', weight: 900 },
  { family: 'Shippori Mincho B1', weight: 800 },
];

const fileOf = f => path.join(FONT_DIR, `${f.family.replace(/\s+/g, '-')}-${f.weight}.ttf`);

/**
 * Google Fonts の css2 から TTF の URL を引く。
 *
 * User-Agent を古いものにすると woff2 ではなく truetype を返す。resvg は
 * woff2 を読めないので TTF を取る。
 */
async function ttfUrl(family, weight) {
  const q = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&display=swap`;
  const res = await fetch(q, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Google Fonts に届かない（${res.status}）: ${q}`);
  const css = await res.text();
  const m = css.match(/https:\/\/[^)]*\.ttf/);
  if (!m) throw new Error(`TTF の URL が返ってこない: ${q}`);
  return m[0];
}

/**
 * フォントを用意して、ファイルパスの配列を返す。
 * すでに置いてあるものは取り直さない。
 */
export async function ensureFonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const out = [];
  for (const f of WANTED) {
    const file = fileOf(f);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      const url = await ttfUrl(f.family, f.weight);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`フォントを取れない（${res.status}）: ${url}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log(`  ↓ ${path.relative(ROOT, file)}`);
    }
    out.push(file);
  }
  return out;
}

/** 画面に出す書体名。SVG の font-family に書くものと合わせる */
export const SANS = 'Zen Kaku Gothic New';
export const SERIF = 'Shippori Mincho B1';
