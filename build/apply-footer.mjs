/**
 * 手書き HTML（ポータル・科目トップ 7 枚・404）のフッターのリンクを、
 * build/lib/parts.mjs の FOOTER_LINKS からそろえる。
 *
 *   node build/apply-footer.mjs          書き込む
 *   node build/apply-footer.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * 生成ページは footer()（build/lib/parts.mjs）が同じ FOOTER_LINKS から組む。
 * 手書き HTML は `<!-- foot-links:start -->`〜`<!-- foot-links:end -->` の間だけを書き換える。
 * マーカーの外（科目ごとのリンクや学習ガイドのボタン）は触らない。
 *
 * 2026-09-10 まで手書き HTML には「詳細検索」「学習の記録」が無く、/progress/ は
 * トップから辿れなかった（仕様書 2.4）。**マーカーの中を手で編集しない。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { FOOTER_LINKS, footerLink } from './lib/parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const START = '<!-- foot-links:start -->';
const END = '<!-- foot-links:end -->';

/** 対象と、リンク 1 本の書き方（ポータルは <ul> の中なので <li> で包む） */
export const TARGETS = [
  { rel: 'index.html', item: 'li' },
  { rel: '404.html', item: 'a' },
  ...SUBJECTS.map(s => ({ rel: `${s.dir}/index.html`, item: 'a' })),
];

/** マーカーの間を書き直す。マーカーが無ければ null */
export function applyToSource(src, item) {
  const re = new RegExp(`([ \\t]*)${START}[\\s\\S]*?${END}`);
  const m = re.exec(src);
  if (!m) return null;
  const indent = m[1];
  const links = [...FOOTER_LINKS.site, ...FOOTER_LINKS.legal]
    .map(l => (item === 'li' ? `<li>${footerLink(l)}</li>` : footerLink(l)))
    .map(x => `${indent}${x}`);
  const block = `${indent}${START}\n${links.join('\n')}\n${indent}${END}`;
  return src.slice(0, m.index) + block + src.slice(m.index + m[0].length);
}

function main() {
  const drifted = [];
  for (const t of TARGETS) {
    const file = path.join(ROOT, t.rel);
    const src = fs.readFileSync(file, 'utf8');
    const out = applyToSource(src, t.item);
    if (out === null) {
      console.error(`${t.rel}: ${START} が無い（フッターの構造を変えたならマーカーも移す）`);
      process.exit(1);
    }
    if (out === src) continue;
    drifted.push(t.rel);
    if (!CHECK) fs.writeFileSync(file, out);
  }
  if (CHECK && drifted.length) {
    console.error(`フッターのリンクが FOOTER_LINKS とずれている（${drifted.length} ファイル）: ${drifted.join(', ')}`);
    console.error('node build/apply-footer.mjs を流す');
    process.exit(1);
  }
  console.log(CHECK ? `フッターのリンクは最新（対象 ${TARGETS.length} ファイル）`
    : `フッターのリンクをそろえた（書き換え ${drifted.length} / 対象 ${TARGETS.length} ファイル）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
