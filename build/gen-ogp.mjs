/**
 * OGP 画像を作る。
 *
 *   node build/gen-ogp.mjs                全部
 *   node build/gen-ogp.mjs --subjects     科目別と共通だけ
 *   node build/gen-ogp.mjs --books        書籍別だけ
 *   node build/gen-ogp.mjs --check        データとずれていれば終了コード 1 で落ちる
 *
 * **なぜ要るか。** 2026-08 に置かれた assets/ogp*.png は、元の SVG も生成手順も
 * リポジトリに無く、画像の中に冊数が焼き込まれていた。冊数が増えても直せず、
 * 情報・小論文は科目別の画像を作れないまま共通画像に逃がしてあった。
 * ここで**画像をビルドの生成物にして、数字はデータから流し込む**。
 *
 * **書き出しは変わったものだけ。** 1,390 枚を毎回書き換えると git の履歴が膨らむ。
 * SVG の文字列のハッシュを build/data/ogp-hashes.json に持ち、前回と同じならスキップする。
 *
 * 依存は package.json の devDependencies にある（サイト本体は Node 標準だけで動く）。
 *   @resvg/resvg-js … SVG → PNG
 *   sharp           … PNG のパレット量子化。1 枚 80KB が 13KB になる
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

import { SUBJECTS, extractSubject } from './lib/extract.mjs';
import { seriesOf, hensachiPlain } from './lib/series.mjs';
import { isProvisional, PROVISIONAL_LABEL } from './lib/newbooks.mjs';
import { ensureFonts } from './ogp/fonts.mjs';
import { subjectSvg, bookSvg, W } from './ogp/templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const ONLY_SUBJECTS = args.includes('--subjects');
const ONLY_BOOKS = args.includes('--books');
const doSubjects = !ONLY_BOOKS;
const doBooks = !ONLY_SUBJECTS;

/** 生成物と SVG の対応台帳。生成物なので手で触らない */
const HASH_FILE = path.join(ROOT, 'build', 'data', 'ogp-hashes.json');

/**
 * 書き出しの設定。**変えたら必ず上げる。**台帳は SVG のハッシュで「変わっていない」を
 * 判断するので、SVG が同じまま量子化やサイズを変えると、古い設定の画像が残り続ける。
 */
const RENDER_VERSION = 2;

const sha = s => crypto.createHash('sha256').update(`v${RENDER_VERSION}\n${s}`).digest('hex').slice(0, 16);

/** 台帳を読む。壊れていたら空から作り直す（全枚書き直しになるだけで、内容は変わらない） */
function loadHashes() {
  try {
    const raw = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8'));
    return raw && typeof raw.files === 'object' ? raw.files : {};
  } catch { return {}; }
}

let fonts = null;
/** SVG を 1200×630 の 32 色パレット PNG にする */
function rasterize(svg) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false, fontFiles: fonts },
  }).render().asPng();
  // 量子化しないと 1 枚 80KB 前後になり、1,390 枚で 100MB を超える。
  // 16 色・ディザ無しで 1 枚 10〜14KB。使っている色は地・文字 3 段・科目色・役割色・白と
  // 水玉の薄い階調だけなので、これで見た目は変わらない（ディザを掛けると水玉が
  // ノイズになってファイルが 4 割膨らむ）
  return sharp(png).png({ palette: true, colors: 16, dither: 0, effort: 10, compressionLevel: 9 }).toBuffer();
}

const written = [];
const stale = [];

/**
 * 1 枚を書き出す。SVG が前回と同じならスキップする。
 * --check のときは書かず、ずれているものを stale に積む。
 */
async function emit(rel, svg, hashes) {
  const file = path.join(ROOT, rel);
  const h = sha(svg);
  if (hashes[rel] === h && fs.existsSync(file)) return;
  if (CHECK) { stale.push(rel); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await rasterize(svg));
  hashes[rel] = h;
  written.push(rel);
}

/* ============================================================
   科目別・共通
   ============================================================ */

async function genSubjects(data, hashes) {
  // 共通画像。冊数は全科目の合計で、科目名ではなくサイト名を見出しにする
  const total = SUBJECTS.reduce((a, s) => a + data[s.dir].books.length, 0);
  await emit('assets/ogp.png', subjectSvg({
    full: 'ルート大全', en: 'ROUTE TAIZEN', ja: '参考書ルート & 図鑑', mark: '全',
    color: '#1B2437', fields: SUBJECTS.map(s => s.ja).join('・'),
    count: total, lead: 'を図鑑化・ルート化',
    tags: SUBJECTS.map(s => s.ja),
  }), hashes);

  for (const s of SUBJECTS) {
    const d = data[s.dir];
    await emit(`assets/ogp-${s.dir}.png`, subjectSvg({
      full: s.full, en: s.en, ja: s.ja, mark: s.mark, color: s.color,
      fields: s.fields, count: d.books.length, lead: 'を役割別に整理',
      tags: Object.values(d.stages).map(v => v.short || v.label),
    }), hashes);
  }
}

/* ============================================================
   書籍別
   ============================================================ */

/**
 * 難易度・到達目安の出し方。サイトの他の画面と同じ判断にそろえる。
 *
 *   評価未了の新刊 … 数字を持たないので出さない（役割だけ）
 *   シリーズ・参照系 … 数字を単独で読ませず、seriesOf() の注記を出す
 *   それ以外       … 「10 段階中 N」と到達目安
 */
function bookLines(b) {
  if (isProvisional(b)) return [PROVISIONAL_LABEL];
  const out = [];
  const ser = seriesOf(b);
  if (ser) out.push(ser.label);
  else out.push(`難易度 10 段階中 ${b.diff}`);
  const h = hensachiPlain(b);
  if (h) out.push(`到達目安 ${h}`);
  return out;
}

async function genBooks(data, hashes) {
  for (const s of SUBJECTS) {
    const d = data[s.dir];
    for (const b of d.books) {
      const st = d.stages[b.stage] || {};
      await emit(`assets/ogp/${s.dir}/${b.id}.png`, bookSvg({
        name: b.name, subject: s.full, color: s.color,
        role: st.short || st.label || '参考書', roleColor: st.color || s.color,
        lines: bookLines(b),
      }), hashes);
    }
  }
}

/* ============================================================
   実行
   ============================================================ */

const data = {};
for (const s of SUBJECTS) data[s.dir] = extractSubject(ROOT, s.dir);

if (!CHECK) fonts = await ensureFonts();

const hashes = loadHashes();
if (doSubjects) await genSubjects(data, hashes);
if (doBooks) await genBooks(data, hashes);

// 台帳に残っているのに BOOKS から消えた本の画像は、孤児になるので消す
if (!CHECK) {
  const alive = new Set(Object.keys(hashes));
  const dir = path.join(ROOT, 'assets', 'ogp');
  if (fs.existsSync(dir)) {
    for (const sub of fs.readdirSync(dir)) {
      const sd = path.join(dir, sub);
      if (!fs.statSync(sd).isDirectory()) continue;
      for (const f of fs.readdirSync(sd)) {
        const rel = `assets/ogp/${sub}/${f}`;
        if (!alive.has(rel)) { fs.unlinkSync(path.join(ROOT, rel)); console.log(`  × ${rel}（BOOKS に無い）`); }
      }
    }
  }
  fs.writeFileSync(HASH_FILE, JSON.stringify({
    _note: '生成物。build/gen-ogp.mjs が持つ SVG のハッシュ台帳で、変わった画像だけを書き出すために使う。手で触らない。',
    files: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 1) + '\n');
}

if (CHECK) {
  if (stale.length) {
    console.error(`OGP がデータとずれている（${stale.length} 枚）。node build/gen-ogp.mjs を流す`);
    for (const r of stale.slice(0, 20)) console.error(`  ✗ ${r}`);
    if (stale.length > 20) console.error(`  … ほか ${stale.length - 20} 枚`);
    process.exit(1);
  }
  console.log('OGP は最新（ずれ 0 枚）');
} else {
  console.log(`${written.length} 枚を書き出した（変化が無い分は書かない）`);
}
