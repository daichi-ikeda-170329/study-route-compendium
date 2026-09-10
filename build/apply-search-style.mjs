/**
 * ヘッダー検索ボックスの CSS を、描画をブロックする形で全ページへ配る。
 *
 *   node build/apply-search-style.mjs          書き込む
 *   node build/apply-search-style.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * ## なぜ要るか
 *
 * この CSS はもともと assets/js/search.js が実行時に <style> を作って差し込んでいた。
 * 手書き HTML（ポータル・科目トップ 7 枚・404）は assets/site.css を読まないので、
 * 全ページ共通の置き場が JS しか無かったためである。
 *
 * その代償が CLS だった。CSS が届く前のヘッダーは検索欄がロゴの横に並ぶ 1 行で、
 * `.rt-search{flex:1 1 100%;order:9}` が効いた瞬間に検索欄が 2 行目へ回り、
 * ヘッダーが 35px 高くなって本文が丸ごと下へずれる。412×823・回線と CPU を絞った
 * 計測で、この 1 回のずれだけで CLS 0.2126（全体の 98%）を出していた。
 *
 * そこで**正本は search.js の STYLE のまま**にし、配り方だけを変える。
 * このスクリプトが STYLE を読んで、
 *
 *   - assets/site.css の末尾（生成ページ 1,476 枚はこれを <link> で読む）
 *   - 手書き HTML（ポータル・404）のインライン <style> の末尾
 *   - 科目トップ 7 枚の CSS（assets/css/subject-<科目>.css。2026-09-10 に外へ出した）
 *
 * の 2 か所へ、マーカーで挟んだ同じ中身を書き込む。どちらも描画をブロックするので、
 * 最初の描画から正しい版面になる。search.js 側の差し込みは、この書き込みが無い
 * ページのための保険として残っている（`--rt-search-css` が読めれば差し込まない）。
 *
 * **マーカーの中を手で編集しない。** 直すのは assets/js/search.js の STYLE。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/* search.js は CommonJS としても読める（build/generate-search.mjs と同じ読み方）。
   Node には document が無いので、読み込んでも DOM には触らない */
const { style: STYLE } = createRequire(import.meta.url)('../assets/js/search.js');

const START = '/* rt-search:start — build/apply-search-style.mjs が assets/js/search.js の STYLE から書き込む。手で編集しない */';
const END = '/* rt-search:end */';

/** 書き込む中身。マーカーごと返す */
export function block(indent = '') {
  const body = STYLE.split('\n').map(l => indent + l).join('\n');
  return `${indent}${START}\n${body}\n${indent}${END}`;
}

/** 手書き HTML のうち、インライン <style> を持つもの。ここは site.css を読まない */
export const HAND_WRITTEN = ['index.html', '404.html'];

/**
 * 科目トップの CSS。2026-09-10 にインライン <style> から assets/css/subject-<科目>.css へ
 * 出した（仕様書 2.2）。どれも描画をブロックする <link> で読むので、ここへ書けば同じ効果になる
 */
export const SUBJECT_CSS = SUBJECTS.map(s => `assets/css/subject-${s.dir}.css`);

/** すでにあるマーカー区間を差し替える。無ければ append() で足す */
function replaceBlock(src, next) {
  const i = src.indexOf(START);
  if (i < 0) return null;
  const j = src.indexOf(END, i);
  if (j < 0) throw new Error(`${START} はあるのに ${END} が無い`);
  return src.slice(0, i) + next.trimStart() + src.slice(j + END.length);
}

function applyToCss(src) {
  const next = block();
  const replaced = replaceBlock(src, next);
  if (replaced !== null) return replaced;
  return src.replace(/\s*$/, '\n\n') + next + '\n';
}

function applyToHtml(src, rel) {
  const next = block();
  const replaced = replaceBlock(src, next);
  if (replaced !== null) return replaced;
  // インライン <style> の末尾へ入れる。手書き HTML はどれも <style> を 1 つだけ持つ
  const m = [...src.matchAll(/<style>[\s\S]*?<\/style>/g)];
  if (m.length !== 1) throw new Error(`${rel}: <style> が ${m.length} 個ある（1 個を想定）`);
  const tag = m[0][0];
  const inner = tag.slice('<style>'.length, -'</style>'.length);
  return src.replace(tag, `<style>${inner.replace(/\s*$/, '\n')}${next}\n</style>`);
}

function main() {
  const targets = [
    { rel: 'assets/site.css', apply: applyToCss },
    ...SUBJECT_CSS.map(rel => ({ rel, apply: applyToCss })),
    ...HAND_WRITTEN.map(rel => ({ rel, apply: (s) => applyToHtml(s, rel) })),
  ];

  const drifted = [];
  for (const t of targets) {
    const file = path.join(ROOT, t.rel);
    if (!fs.existsSync(file)) throw new Error(`対象が無い: ${t.rel}`);
    const src = fs.readFileSync(file, 'utf8');
    const out = t.apply(src);
    if (out === src) continue;
    drifted.push(t.rel);
    if (!CHECK) fs.writeFileSync(file, out);
  }

  if (CHECK && drifted.length) {
    console.error(`検索ボックスの CSS が search.js とずれている（${drifted.length} ファイル）:`);
    for (const r of drifted) console.error(`  ${r}`);
    console.error('node build/apply-search-style.mjs を流す');
    process.exit(1);
  }
  if (CHECK) console.log(`検索ボックスの CSS は最新（対象 ${targets.length} ファイル）`);
  else console.log(`検索ボックスの CSS を配った（書き換え ${drifted.length} / 対象 ${targets.length} ファイル）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
