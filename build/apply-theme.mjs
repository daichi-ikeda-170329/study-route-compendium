/**
 * サイト共通の見た目（2026-11 のデザイン）を、描画をブロックする形で全ページへ配る。
 *
 *   node build/apply-theme.mjs          書き込む
 *   node build/apply-theme.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * 正本は build/theme.css。配り先は apply-search-style.mjs と同じで、
 *
 *   - assets/site.css（生成ページはこれを <link> で読む）
 *   - 科目トップ 7 枚の CSS（assets/css/subject-<科目>.css）
 *   - 手書き HTML（ポータル・404）のインライン <style>
 *
 * の末尾へ、マーカーで挟んだ同じ中身を書き込む。各ファイルの規則より後ろに置くので、
 * 色・書体・角丸の値はここが勝つ。**マーカーの中を手で編集しない。** 直すのは build/theme.css。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECT_CSS, HAND_WRITTEN } from './apply-search-style.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const START = '/* rt-theme:start — build/apply-theme.mjs が build/theme.css から書き込む。手で編集しない */';
const END = '/* rt-theme:end */';

export function block() {
  // 科目トップの CSS にはバイト予算がある（test/performance-budget.test.mjs）。注釈と空白を落として配る
  const body = fs.readFileSync(path.join(ROOT, 'build/theme.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}');
  return `${START}\n${body}\n${END}`;
}

function strip(src) {
  const i = src.indexOf(START);
  if (i < 0) return src;
  const j = src.indexOf(END, i);
  if (j < 0) throw new Error(`${START} はあるのに ${END} が無い`);
  return src.slice(0, i).replace(/\s*$/, '\n') + src.slice(j + END.length).replace(/^\n/, '');
}

/** 常に末尾へ置く（後から足された規則より後ろに来るように、毎回いったん外して付け直す） */
function applyToCss(src) {
  return strip(src).replace(/\s*$/, '\n\n') + block() + '\n';
}

function applyToHtml(src, rel) {
  const base = strip(src);
  const m = [...base.matchAll(/<style>[\s\S]*?<\/style>/g)];
  if (m.length !== 1) throw new Error(`${rel}: <style> が ${m.length} 個ある（1 個を想定）`);
  const tag = m[0][0];
  const inner = tag.slice('<style>'.length, -'</style>'.length);
  return base.replace(tag, () => `<style>${inner.replace(/\s*$/, '\n')}${block()}\n</style>`);
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
    const src = fs.readFileSync(file, 'utf8');
    const out = t.apply(src);
    if (out === src) continue;
    drifted.push(t.rel);
    if (!CHECK) fs.writeFileSync(file, out);
  }
  if (CHECK && drifted.length) {
    console.error(`共通の見た目（build/theme.css）がずれている（${drifted.length} ファイル）:`);
    for (const r of drifted) console.error(`  ${r}`);
    console.error('node build/apply-theme.mjs を流す');
    process.exit(1);
  }
  console.log(CHECK ? `共通の見た目は最新（対象 ${targets.length} ファイル）` : `共通の見た目を配った（書き換え ${drifted.length} / 対象 ${targets.length} ファイル）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
