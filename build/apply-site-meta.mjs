/**
 * 年度コピーを build/data/site-meta.json の値へそろえる。
 *
 *   node build/apply-site-meta.mjs          書き換える
 *   node build/apply-site-meta.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * 対象は手書きの HTML（ポータル 1 枚と科目トップ 7 枚）。生成ページは
 * build/lib/site-meta.mjs を直接読むので、ここでは触らない。
 *
 * **「2026」を一括置換しない。** 刊行年・年度版書名・更新履歴・著作権年まで
 * 巻き込むため、規則ごとに前後の文脈（`hdr-tag` の中、`hero__badge` の中、
 * meta の content 末尾など）を含めて拾う。**1 件も当たらない規則があれば落とす** ——
 * 文面を変えて正規表現が外れると、年度だけが黙って古いまま凍りつくため。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMISSION_YEAR, ADMISSION_LABEL, ADMISSION_LABEL_SHORT,
  ADMISSION_META_SENTENCE, CURRICULUM_LABEL, STALE_YEAR_PATTERNS,
} from './lib/site-meta.mjs';
import { SUBJECTS } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** 手書き HTML。生成ページは含めない（生成側は lib を読む） */
export const HAND_WRITTEN = ['index.html', ...SUBJECTS.map(s => `${s.dir}/index.html`)];

const Y = String(ADMISSION_YEAR);

/**
 * 規則。re は必ず g 付き。to は置換後の文字列（$1 などは使わない）。
 * min は「サイト全体で最低これだけは当たるはず」の件数。
 */
const RULES = [
  {
    label: 'ヘッダーのタグ',
    re: /(<span class="hdr-tag">)[^<]*(<\/span>)/g,
    to: `$1${ADMISSION_LABEL_SHORT}$2`,
    min: 8,
  },
  {
    label: 'ヒーローのバッジ（年度つき）',
    re: /(<span class="hero__badge"><i><\/i>[^<]*?)\s*—\s*20\d\d\s*(?:年度入試に向けて順次確認・更新中|年度入試対応(?:（新課程）)?|共通テスト[^<]*?対応|入試対応)(<\/span>)/g,
    to: `$1 — ${ADMISSION_LABEL}$2`,
    min: 6,
  },
  {
    label: 'meta / JSON-LD の説明文の末尾',
    re: /20\d\d年度(?:入試対応・完全無料。|入試に向けて順次確認・更新中。完全無料。|に向けて更新中・完全無料。)/g,
    to: ADMISSION_META_SENTENCE,
    min: 12,
  },
  {
    label: 'FAQ の新課程の答えに入る年度',
    re: /掲載内容は20\d\d年度入試に向けて順次確認・更新しています/g,
    to: `掲載内容は${ADMISSION_YEAR}年度入試に向けて順次確認・更新しています`,
    min: 2,
  },
  {
    label: 'FAQ の新課程の質問（年度と新課程を同義にしない）',
    re: /(?:20\d\d年度の)?新課程には対応していますか？/g,
    to: `${CURRICULUM_LABEL}には対応していますか？`,
    min: 2,
  },
];

/** 年度を変えても中身が追従することを確かめるため、テストから同じ処理を呼べるようにする */
export function applyToSource(src) {
  let out = src;
  const hits = {};
  for (const r of RULES) {
    const before = out;
    out = out.replace(r.re, r.to);
    hits[r.label] = (before.match(r.re) || []).length;
  }
  return { out, hits };
}

/** 置換後にも残っている古い年度コピーを拾う（書名・刊行年は文脈語が無いので当たらない） */
export function findStaleYearCopy(src) {
  const found = [];
  for (const re of STALE_YEAR_PATTERNS) {
    for (const m of src.matchAll(re)) {
      // 現在の年度で書かれた「順次確認・更新中」は対象外
      if (m[1] === Y && /順次/.test(src.slice(m.index, m.index + 60))) continue;
      found.push(m[0]);
    }
  }
  return found;
}

function main() {
  const total = {};
  let changed = 0;
  const stale = [];

  for (const rel of HAND_WRITTEN) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const { out, hits } = applyToSource(src);
    for (const [k, v] of Object.entries(hits)) total[k] = (total[k] || 0) + v;
    if (out !== src) {
      changed++;
      if (CHECK) console.log(`ずれ: ${rel}`);
      else fs.writeFileSync(file, out);
    }
    for (const s of findStaleYearCopy(out)) stale.push(`${rel}: ${s}`);
  }

  let bad = false;
  for (const r of RULES) {
    const n = total[r.label] || 0;
    if (n < r.min) {
      console.error(`規則が当たらない: ${r.label} — ${n} 件（最低 ${r.min} 件のはず）。文面を変えたなら規則も直す`);
      bad = true;
    }
  }
  if (stale.length) {
    console.error('古い年度コピーが残っている:\n  ' + stale.join('\n  '));
    bad = true;
  }

  if (CHECK && changed) {
    console.error(`年度コピーが site-meta.json とずれている（${changed} ファイル）。node build/apply-site-meta.mjs を流す`);
    bad = true;
  }
  if (!CHECK) console.log(`年度コピーを ${ADMISSION_YEAR} 年度基準にそろえた（書き換え ${changed} ファイル）`);
  if (bad) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
