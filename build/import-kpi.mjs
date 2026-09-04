/**
 * 管理画面から出した集計 CSV を読み、KPI の基準値へ落とす。
 *
 *   node build/import-kpi.mjs                     private/kpi-input/ の CSV を読む
 *   node build/import-kpi.mjs --dir=<パス>        別の場所から読む
 *   node build/import-kpi.mjs --template          値が null の雛形だけを書く
 *
 * ## 受け取るもの・受け取らないもの
 *
 * 取り込むのは**管理画面から出した集計 CSV だけ**。
 * `build/data/kpi-schema.json` の `rejectColumns` に載っている列
 * （ユーザー ID・client ID・IP・検索クエリ・市区町村・緯度経度など）が
 * 1 つでも入っていたら、**そのファイルはまるごと取り込まない。**
 * 個人が特定できる情報を KPI の集計に混ぜない。
 *
 * ## 生の CSV をリポジトリにも公開物にも入れない
 *
 * 入力は `private/kpi-input/`（`.gitignore` 済み）。出力は集計値だけを
 * `docs/kpi-baseline.json` と `docs/kpi-baseline.md` に書く。
 * `docs/` は `build/build-public.mjs` の `FORBIDDEN_PATH` に入っているので `dist/` へ出ない。
 *
 * ## 推測で埋めない
 *
 * 読めなかった項目は `null` のままにする。**0 で埋めない。**
 * 「0 だった」と「分からなかった」を同じ形にすると、あとから区別できない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const arg = (n, d) => {
  const hit = ARGS.find(a => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const TEMPLATE_ONLY = ARGS.includes('--template');
const IN_DIR = path.resolve(ROOT, arg('dir', 'private/kpi-input'));

const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/kpi-schema.json'), 'utf8'));
const OUT_JSON = path.join(ROOT, 'docs', 'kpi-baseline.json');
const OUT_MD = path.join(ROOT, 'docs', 'kpi-baseline.md');

/** 値が入っていない雛形。**推測で埋めない**ことを形で示す */
function emptyBaseline() {
  const sources = {};
  for (const [id, s] of Object.entries(SCHEMA.sources)) {
    sources[id] = Object.fromEntries(Object.keys(s.metrics).map(m => [m, null]));
  }
  return {
    schemaVersion: 1,
    period: { start: null, end: null, days: SCHEMA.period.days },
    collectedAt: null,
    currency: null,
    sources,
    notes: [],
  };
}

/* ============================================================
   CSV
   ============================================================ */

/** 引用符と改行を含む CSV を読む。外部ライブラリは使わない */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');   // BOM を落とす

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** 数値を読む。読めなければ null（0 で埋めない） */
function num(raw) {
  const t = String(raw || '').replace(/[,¥$￥%\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * 1 ファイルを読む。
 * @returns {{ok:boolean, reason?:string, source?:string, values?:object}}
 */
export function readFile(name, text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, reason: '行が足りない（見出しと値の 2 行が要る）' };

  const header = rows[0].map(norm);

  // **受け取らない列が 1 つでもあれば、そのファイルはまるごと落とす**
  const rejected = header.filter(h => SCHEMA.rejectColumns.some(r => h === norm(r) || h.includes(norm(r))));
  if (rejected.length) {
    return { ok: false, reason: `個人が特定できる列が入っている: ${rejected.join(', ')}` };
  }

  // どのサービスの CSV かを、列の顔ぶれから決める
  let best = null;
  for (const [id, s] of Object.entries(SCHEMA.sources)) {
    let hit = 0;
    for (const m of Object.values(s.metrics)) {
      if (m.columns.some(c => header.includes(norm(c)))) hit++;
    }
    if (hit && (!best || hit > best.hit)) best = { id, hit, def: s };
  }
  if (!best) return { ok: false, reason: '見出しから、どのサービスの CSV か判別できない' };

  const values = {};
  const problems = [];
  for (const [key, def] of Object.entries(best.def.metrics)) {
    const col = def.columns.map(norm).find(c => header.includes(c));
    if (col === undefined) { values[key] = null; continue; }
    const idx = header.indexOf(col);

    // 集計 CSV は 1 行の想定。複数行あるときは合計せず、判断できないものとして落とす
    const raws = rows.slice(1).map(r => r[idx]).filter(v => String(v || '').trim() !== '');
    if (raws.length > 1) {
      problems.push(`${key}: 値が ${raws.length} 行ある。合計値の CSV を出し直す`);
      values[key] = null;
      continue;
    }
    const v = num(raws[0]);
    if (v === null) { values[key] = null; continue; }

    // 型の検査。範囲を外れた値は取り込まない（推測で直さない）
    if (def.type === 'integer' && !Number.isInteger(v)) { problems.push(`${key}: 整数でない（${v}）`); values[key] = null; continue; }
    if (v < 0) { problems.push(`${key}: 負数（${v}）`); values[key] = null; continue; }
    if (def.min !== undefined && v < def.min) { problems.push(`${key}: 下限 ${def.min} を下回る（${v}）`); values[key] = null; continue; }
    if (def.max !== undefined && v > def.max) { problems.push(`${key}: 上限 ${def.max} を超える（${v}）`); values[key] = null; continue; }
    values[key] = v;
  }

  return { ok: true, source: best.id, values, problems };
}

/* ============================================================
   出力
   ============================================================ */

function toMarkdown(b) {
  const L = [];
  L.push('# KPI の基準値');
  L.push('');
  L.push('`build/import-kpi.mjs` が書く。**手で編集しない。**');
  L.push('値が `—` のものは、まだ取り込んでいないか、CSV から読めなかったもの。');
  L.push('**0 と「分からない」を同じ形にしない。**');
  L.push('');
  L.push(`- 期間: ${b.period.start ?? '—'} 〜 ${b.period.end ?? '—'}（${b.period.days} 日間）`);
  L.push(`- 取り込んだ日時: ${b.collectedAt ?? '—'}`);
  L.push(`- 通貨: ${b.currency ?? '—'}`);
  L.push('');
  for (const [id, s] of Object.entries(SCHEMA.sources)) {
    L.push(`## ${s.displayName}`);
    L.push('');
    L.push('| 指標 | 値 |');
    L.push('|---|---:|');
    for (const key of Object.keys(s.metrics)) {
      const v = b.sources[id] ? b.sources[id][key] : null;
      L.push(`| ${key} | ${v === null || v === undefined ? '—' : v} |`);
    }
    L.push('');
  }
  if (b.notes.length) {
    L.push('## 取り込みのときに出たこと');
    L.push('');
    for (const n of b.notes) L.push(`- ${n}`);
    L.push('');
  }
  return L.join('\n') + '\n';
}

function write(b) {
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(b, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, toMarkdown(b));
  console.log(`書いた: docs/kpi-baseline.json / docs/kpi-baseline.md`);
}

/* ============================================================
   実行
   ============================================================ */

function main() {
  const baseline = emptyBaseline();

  if (TEMPLATE_ONLY) {
    baseline.notes.push('値の入っていない雛形。実数はまだ取り込んでいない。');
    write(baseline);
    console.log('雛形を書いた（値はすべて null）。**これを「計測した」と読まない。**');
    return 0;
  }

  if (!fs.existsSync(IN_DIR)) {
    console.error(`未実施: ${path.relative(ROOT, IN_DIR)}/ が無い。`);
    console.error('管理画面から出した集計 CSV をそこへ置いてから流す（docs/kpi-import-guide.md）。');
    console.error('雛形だけが要るなら --template を付ける。');
    return 2;
  }

  const files = fs.readdirSync(IN_DIR).filter(f => /\.csv$/i.test(f));
  if (!files.length) {
    console.error(`未実施: ${path.relative(ROOT, IN_DIR)}/ に CSV が無い。`);
    return 2;
  }

  let taken = 0;
  for (const f of files) {
    const r = readFile(f, fs.readFileSync(path.join(IN_DIR, f), 'utf8'));
    if (!r.ok) {
      console.error(`  ✗ ${f}: ${r.reason}`);
      baseline.notes.push(`${f} は取り込まなかった（${r.reason}）`);
      continue;
    }
    taken++;
    for (const [k, v] of Object.entries(r.values)) {
      if (v !== null) baseline.sources[r.source][k] = v;
    }
    for (const p of r.problems || []) baseline.notes.push(`${f}: ${p}`);
    console.log(`  ✓ ${f} → ${r.source}（読めた指標 ${Object.values(r.values).filter(v => v !== null).length} 件）`);
  }

  baseline.collectedAt = new Date().toISOString();
  baseline.currency = SCHEMA.currency.allowed[0];

  const start = arg('start', null);
  const end = arg('end', null);
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) baseline.period.start = start;
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) baseline.period.end = end;
  if (!baseline.period.start || !baseline.period.end) {
    baseline.notes.push('期間が渡されていない。--start=YYYY-MM-DD --end=YYYY-MM-DD を付けて流し直す。');
  }

  write(baseline);
  const filled = Object.values(baseline.sources).flatMap(s => Object.values(s)).filter(v => v !== null).length;
  const total = Object.values(baseline.sources).flatMap(s => Object.values(s)).length;
  console.log(`取り込んだファイル ${taken} / ${files.length}、値が入った指標 ${filled} / ${total}`);
  if (filled < total) console.log('**入らなかった指標は null のまま。0 で埋めていない。**');
  return taken ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
