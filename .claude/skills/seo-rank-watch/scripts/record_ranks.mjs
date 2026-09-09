#!/usr/bin/env node
// WebSearch などで目視した順位を rank-history.json に追記する。
//
// rank-history.json は追記専用。このスクリプトは既存の entries を書き換えない。
// 同じ date + source の記録が既にある場合は 1 で落とす（二重記録を防ぐため）。
//
// 使い方（測定値は標準入力から JSON 配列で渡す）
//   echo '[{"keyword":"青チャート Focus Gold","rank":3}]' \
//     | node record_ranks.mjs --repo <REPO_PATH> --source websearch
//
// rank は 1 以上の数値、または null（圏外・未確認）。
// impressions / clicks は省略可（WebSearch では取れないため）。
//
// 終了コード: 0 追記した / 1 入力または検証に失敗

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  const out = { repo: process.cwd(), source: 'websearch', note: null };
  let pending = null;
  for (const a of argv.slice(2)) {
    if (pending) { out[pending] = a; pending = null; continue; }
    if (a === '--repo' || a === '--source' || a === '--note') pending = a.slice(2);
    else if (a.startsWith('--repo=')) out.repo = a.slice(7);
    else if (a.startsWith('--source=')) out.source = a.slice(9);
    else if (a.startsWith('--note=')) out.note = a.slice(7);
  }
  out.repo = resolve(out.repo);
  return out;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const args = parseArgs(process.argv);
if (args.source !== 'websearch' && args.source !== 'manual') {
  fail('--source は websearch または manual（GSC からの取り込みは fetch_gsc_ranks.mjs を使う）');
}

const raw = readStdin().trim();
if (!raw) fail('標準入力に測定値の JSON 配列が無い');

let input;
try {
  input = JSON.parse(raw);
} catch (err) {
  fail(`標準入力が JSON として読めない: ${err.message}`);
}
if (!Array.isArray(input) || input.length === 0) fail('測定値は 1 件以上の配列で渡す');

const watchPath = join(args.repo, 'data', 'seo', 'watchwords.json');
const historyPath = join(args.repo, 'data', 'seo', 'rank-history.json');
if (!existsSync(watchPath)) fail(`監視キーワードが無い: ${watchPath}`);
if (!existsSync(historyPath)) fail(`順位履歴が無い: ${historyPath}`);

const watch = JSON.parse(readFileSync(watchPath, 'utf-8'));
const known = new Set(watch.keywords.map((k) => k.keyword));

const measurements = [];
for (const m of input) {
  if (typeof m?.keyword !== 'string') fail('各要素に keyword（文字列）が要る');
  if (!known.has(m.keyword)) fail(`watchwords.json に無いキーワード: ${m.keyword}`);
  const rank = m.rank ?? null;
  if (rank !== null && (typeof rank !== 'number' || !(rank >= 1))) {
    fail(`rank は 1 以上の数値か null: ${m.keyword} → ${JSON.stringify(rank)}`);
  }
  const entry = { keyword: m.keyword, rank };
  if (typeof m.impressions === 'number') entry.impressions = m.impressions;
  if (typeof m.clicks === 'number') entry.clicks = m.clicks;
  if (typeof m.url === 'string') entry.url = m.url;
  measurements.push(entry);
}

const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
const today = new Date().toISOString().slice(0, 10);
if (history.entries.some((e) => e.date === today && e.source === args.source)) {
  fail(`${today} の ${args.source} 記録が既にある。追記専用のため上書きしない。`);
}

const record = { date: today, source: args.source, measurements };
if (args.note) record.note = args.note;
history.entries.push(record);
writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf-8');

console.log(`${today} / ${args.source} として ${measurements.length} 件を追記した。`);
for (const m of measurements) {
  console.log(`  ${m.rank === null ? '未確認' : `${String(m.rank).padStart(3)}位`}  ${m.keyword}`);
}
