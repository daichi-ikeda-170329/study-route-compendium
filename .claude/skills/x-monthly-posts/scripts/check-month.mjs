#!/usr/bin/env node
/**
 * X の月次投稿ファイル（docs/x-posts/YYYY-MM.md）を検査する。
 *
 *   node .claude/skills/x-monthly-posts/scripts/check-month.mjs 2026-11
 *
 * 見るもの:
 *   - 月の全日に「### M/D(曜) HH:MM — …」の見出しが 1 本ずつあるか
 *   - 各見出しの直後のコードブロック（予約投稿に貼る本文）が 280 以内か（X の重み付け）
 *   - 本文に URL がちょうど 1 本あり、utm 付きで、手元のリポジトリに実在するページか
 *   - 予約投稿でできない手順（返信・アンケート）が混ざっていないか
 *
 * 問題があれば一覧して終了コード 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { weightedLen, X_LIMIT } from '../../../../build/gen-x-posts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const month = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(month || '')) {
  console.error('月を YYYY-MM で渡す（例: 2026-11）');
  process.exit(2);
}
const [y, m] = month.split('-').map(Number);
const file = path.join(ROOT, 'docs/x-posts', `${month}.md`);
if (!fs.existsSync(file)) {
  console.error(`${path.relative(ROOT, file)} が無い`);
  process.exit(2);
}
const src = fs.readFileSync(file, 'utf8');

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const problems = [];
const days = new Date(y, m, 0).getDate();
const re = /^### (\d+)\/(\d+)\(([日月火水木金土])\) (\d\d:\d\d) — .*\n+```\n([\s\S]*?)\n```/gm;
const seen = new Map();
let maxLen = 0;

for (const h of src.matchAll(re)) {
  const [, mo, d, wd, , body] = h;
  const tag = `${mo}/${d}`;
  if (Number(mo) !== m) { problems.push(`${tag}: 月が違う`); continue; }
  if (WD[new Date(y, m - 1, Number(d)).getDay()] !== wd) problems.push(`${tag}: 曜日が違う（${wd}）`);
  seen.set(Number(d), (seen.get(Number(d)) || 0) + 1);

  const n = weightedLen(body);
  maxLen = Math.max(maxLen, n);
  if (n > X_LIMIT) problems.push(`${tag}: ${n} / ${X_LIMIT} で超過`);

  const urls = body.match(/https?:\/\/\S+/g) || [];
  if (urls.length !== 1) problems.push(`${tag}: 本文の URL が ${urls.length} 本（1 本にする）`);
  for (const u of urls) {
    const url = new URL(u);
    if (url.hostname !== 'route-taizen.com') { problems.push(`${tag}: 自サイト以外の URL — ${u}`); continue; }
    if (url.searchParams.get('utm_source') !== 'x' || !url.searchParams.get('utm_campaign')) {
      problems.push(`${tag}: utm が無い — ${u}`);
    }
    const local = path.join(ROOT, url.pathname, 'index.html');
    if (!fs.existsSync(local)) problems.push(`${tag}: ページが無い — ${url.pathname}`);
  }
}

for (let d = 1; d <= days; d++) {
  const c = seen.get(d) || 0;
  if (c === 0) problems.push(`${m}/${d}: 投稿が無い`);
  if (c > 1) problems.push(`${m}/${d}: 投稿が ${c} 本ある`);
}
// 手順の混入は投稿の並び（最初の日付見出し以降）だけで見る。冒頭の説明文は対象にしない
const posts = src.slice(Math.max(0, src.search(/^### \d+\/\d+\(/m)));
if (/投稿の直後に|返信として貼る/.test(posts)) problems.push('返信で貼る手順が残っている（予約投稿ではできない）');
if (/\*\*アンケート/.test(posts)) problems.push('アンケートの指示が残っている（予約投稿で付けられるか未確認）');

console.log(`${path.relative(ROOT, file)}: ${seen.size} 日分 / 最長 ${maxLen} / ${X_LIMIT}`);
if (problems.length) {
  for (const p of problems) console.log(`  NG ${p}`);
  process.exit(1);
}
console.log('  問題なし');
