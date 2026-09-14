#!/usr/bin/env node
// 今日どのキーワードを触ってよいかを一覧する。
//
//   node status.mjs --repo <REPO_PATH>
//
// 出す内容
//   1. 今日レビューする（observing かつ nextReviewDate <= 今日）
//   2. 観察中で触ってはいけない（observing かつ nextReviewDate > 今日）
//   3. 今日の改善候補（active。直近順位の良い順）
//   4. 達成済み（achieved。監視のみ）
//
// 終了コードは常に 0。判断材料を出すだけで、判断はしない。

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoArg = process.argv.slice(2).find((a) => a.startsWith('--repo='))
  ?? (process.argv[process.argv.indexOf('--repo') + 1] || null);
const repo = resolve(repoArg ? repoArg.replace(/^--repo=/, '') : process.cwd());

const dir = join(repo, 'data', 'seo');
for (const f of ['watchwords.json', 'rank-history.json', 'improvement-log.json']) {
  if (!existsSync(join(dir, f))) {
    console.error(`data/seo/${f} が無い。`);
    process.exit(0);
  }
}
const watch = JSON.parse(readFileSync(join(dir, 'watchwords.json'), 'utf-8'));
const history = JSON.parse(readFileSync(join(dir, 'rank-history.json'), 'utf-8'));
const log = JSON.parse(readFileSync(join(dir, 'improvement-log.json'), 'utf-8'));

const today = new Date().toISOString().slice(0, 10);

// 直近の測定値（新しい記録が勝つ）
const latest = new Map();
const previous = new Map();
for (const entry of history.entries) {
  for (const m of entry.measurements) {
    if (latest.has(m.keyword)) previous.set(m.keyword, latest.get(m.keyword));
    latest.set(m.keyword, { ...m, date: entry.date, source: entry.source });
  }
}

const state = new Map(log.keywords.map((k) => [k.keyword, k]));

function line(kw) {
  const l = latest.get(kw.keyword);
  const p = previous.get(kw.keyword);
  const rank = l?.rank == null ? '  --' : String(l.rank).padStart(4);
  let delta = '      ';
  if (l?.rank != null && p?.rank != null) {
    const d = p.rank - l.rank; // 正 = 上昇
    delta = d === 0 ? '   ±0' : `${d > 0 ? '↑' : '↓'}${Math.abs(d).toFixed(1).padStart(4)}`;
  }
  const imp = l?.impressions == null ? '   -' : String(l.impressions).padStart(4);
  return `  ${rank}位 ${delta}  imp ${imp}  [${kw.priority}]  ${kw.keyword}  → ${kw.targetPath}`;
}

const buckets = { review: [], observing: [], active: [], achieved: [] };
for (const kw of watch.keywords) {
  const s = state.get(kw.keyword);
  const status = s?.status ?? 'active';
  if (status === 'achieved') buckets.achieved.push(kw);
  else if (status === 'observing') {
    (s.nextReviewDate && s.nextReviewDate <= today ? buckets.review : buckets.observing).push(kw);
  } else buckets.active.push(kw);
}

const rankOf = (kw) => latest.get(kw.keyword)?.rank ?? Infinity;
buckets.active.sort((a, b) => rankOf(a) - rankOf(b));

console.log(`基準日: ${today}`);
console.log('');
console.log(`1. 今日レビューする（${buckets.review.length} 件）`);
buckets.review.forEach((k) => console.log(line(k)));
if (buckets.review.length === 0) console.log('  なし');

console.log('');
console.log(`2. 観察中・触らない（${buckets.observing.length} 件）`);
buckets.observing.forEach((k) => console.log(`${line(k)}  next=${state.get(k.keyword).nextReviewDate}`));
if (buckets.observing.length === 0) console.log('  なし');

console.log('');
console.log(`3. 今日の改善候補（${buckets.active.length} 件・直近順位の良い順）`);
buckets.active.forEach((k) => console.log(line(k)));
if (buckets.active.length === 0) console.log('  なし');

console.log('');
console.log(`4. 達成済み・監視のみ（${buckets.achieved.length} 件）`);
buckets.achieved.forEach((k) => console.log(line(k)));
if (buckets.achieved.length === 0) console.log('  なし');
