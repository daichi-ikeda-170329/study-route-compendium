/**
 * 手書き HTML（ポータル・科目トップ 7 枚・404）の <head> に、Consent Mode v2 の既定値を書き込む（仕様書 5.3）。
 *
 *   node build/apply-consent.mjs          書き込む
 *   node build/apply-consent.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * 正本は build/lib/parts.mjs の CONSENT_DEFAULT（生成ページの analytics() も同じものを使う）。
 * 手書き HTML は AdSense のタグが GA4 より前にあるので、**AdSense のタグの直前**に置く
 * （同意の既定値は、Google のタグが読まれるより前に宣言しないと効かない）。
 * マーカーが無ければ `<!-- Google AdSense -->` の前に足す。**マーカーの中を手で編集しない。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { CONSENT_DEFAULT } from './lib/parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const START = '<!-- consent-default:start — build/apply-consent.mjs が build/lib/parts.mjs の CONSENT_DEFAULT から書き込む。手で編集しない -->';
const END = '<!-- consent-default:end -->';
export const TARGETS = ['index.html', '404.html', ...SUBJECTS.map(s => `${s.dir}/index.html`)];

export function block() {
  return `${START}\n<script>\n${CONSENT_DEFAULT}\n</script>\n${END}`;
}

export function applyToSource(src, rel) {
  const i = src.indexOf(START);
  if (i >= 0) {
    const j = src.indexOf(END, i);
    if (j < 0) throw new Error(`${rel}: 開始マーカーはあるのに終了マーカーが無い`);
    return src.slice(0, i) + block() + src.slice(j + END.length);
  }
  // 最初の Google のタグ（AdSense、無ければ GA4）の直前に足す
  const at = ['<!-- Google AdSense -->', '<!-- Google アナリティクス 4 -->'].map(m => src.indexOf(m)).filter(x => x >= 0);
  if (!at.length) throw new Error(`${rel}: Google のタグが見つからない（同意の既定値を置く場所が無い）`);
  const k = Math.min(...at);
  return src.slice(0, k) + block() + '\n' + src.slice(k);
}

function main() {
  const drifted = [];
  for (const rel of TARGETS) {
    const file = path.join(ROOT, rel);
    const src = fs.readFileSync(file, 'utf8');
    const out = applyToSource(src, rel);
    if (out === src) continue;
    drifted.push(rel);
    if (!CHECK) fs.writeFileSync(file, out);
  }
  if (CHECK && drifted.length) {
    console.error(`Consent Mode の既定値がずれている（${drifted.length} ファイル）: ${drifted.join(', ')}。node build/apply-consent.mjs を流す`);
    process.exit(1);
  }
  console.log(CHECK ? `Consent Mode の既定値は最新（対象 ${TARGETS.length} ファイル）`
    : `Consent Mode の既定値を書き込んだ（書き換え ${drifted.length} / 対象 ${TARGETS.length} ファイル）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
