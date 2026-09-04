/**
 * 1 科目ぶんのデータを、科目 HTML から canonical ファイルへ移す。
 *
 *   node build/migrate-subject.mjs joho          移す
 *   node build/migrate-subject.mjs joho --dry    何をするかだけ出す
 *
 * **手でコピーしない。** 1,390 冊を手で写すと必ず取りこぼす。移行はこのスクリプトだけが行い、
 * スクリプトは移行のコミットに含める（あとから同じ変換をやり直せるようにするため）。
 *
 * ## やること
 *
 *   1. data/subjects/<科目>/*.json を書く（人がレビューする正本。dist/ へは出ない）
 *   2. assets/js/subject-<科目>.js を書く（描画コード。中身は書き換えず切り出すだけ）
 *   3. <科目>/index.html のインライン <script> を、マニフェスト＋2 本の script タグへ置き換える
 *
 * 配信アセット（assets/generated/subjects/）とマニフェストの中身は
 * build/generate-subject-assets.mjs が作る。ここでは受け皿だけを置く。
 *
 * ## 移行が正しかったことの証明
 *
 * `npm run check:shape` が通ること。スナップショットは移行前に取ったハッシュなので、
 * 1 文字でも中身が変わっていれば落ちる。**仕様変更が無いのに取り直してはならない。**
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { loadSubjectData, isMigrated, writeCanonicalFile, clearSubjectCache } from './lib/load-subject-data.mjs';
import { inlineScripts, splitScript, buildAppFile } from './lib/subject-split.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry');
const dirs = ARGS.filter(a => !a.startsWith('--'));

if (!dirs.length) {
  console.error('科目ディレクトリ名を渡す（例: node build/migrate-subject.mjs joho）');
  process.exit(1);
}

/**
 * 読み込みの受け皿。マニフェストの中身は generate-subject-assets.mjs が埋める。
 *
 * script の並びに意味がある。
 *   1. マニフェスト（インライン）… 取得先と、起動前に押された onclick の受け皿
 *   2. subject-<科目>.js（defer）… window.RT_SUBJECT_APP を定義するだけ
 *   3. subject-loader.js（defer）… データを取り、2 を呼ぶ
 * defer は文書の順に実行されるので、3 が動く時点で 2 は必ず定義済み。
 */
function bootstrap(dir) {
  return `<div id="rtLoadStatus" class="rt-load-status" role="status" aria-live="polite" hidden></div>
<script>/* RT_SUBJECT_ASSETS — build/generate-subject-assets.mjs が書き換える。手で編集しない */</` + `script>
<script src="/assets/js/subject-${dir}.js" defer></` + `script>
<script src="/assets/js/subject-loader.js" defer></` + `script>`;
}

/**
 * 切り出した app を実際に走らせて、**データの件数が変わらない**ことを確かめる。
 *
 * 科目 HTML には宣言のあとに `BOOKS.push(...)` や `TIERS.push(...)` が置かれている。
 * `extractSubject()` は vm 上で最後まで走らせるので、その結果はすでに canonical
 * データに入っている。app 側にも残すと起動のたびにもう一度足され、件数が増える。
 *
 * **`npm run check:shape` はこの事故を捕まえない。** あちらが見るのは canonical
 * データそのもので、実行時に何が起きるかは見ていない。2026-09-05 の math の移行で
 * BOOKS が実行時に 162 件から 256 件へ増えたのを、事前描画の差分で気づいた。
 * 気づける仕組みをここに置く。
 */
function assertNoDataDrift(dir, appFile, data) {
  const noop = () => {};
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : (typeof k === 'symbol' ? undefined : stub())),
    set: () => true, apply: () => stub(), construct: () => stub(),
  });
  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    document: stub(),
    /* 移行済み app は `var RTShare = window.RTShare;` で受け取る（bridgedGlobals） */
    window: {
      RTShare: { setup: noop, beforeQuiz: () => '', beforeResult: () => '', afterResult: () => '', routeBlock: () => '' },
      RTPace: { setup: noop, apply: noop },
      RTBunri: { needsAsk: () => false, ask: () => '' },
    },
    localStorage: stub(), navigator: stub(),
    location: stub(), history: stub(), dataLayer: [],
    URL, URLSearchParams, Math, Date, JSON, Intl,
    setTimeout: noop, setInterval: noop, clearTimeout: noop,
    addEventListener: noop, requestAnimationFrame: noop,
    RTShare: { setup: noop, beforeQuiz: () => '', beforeResult: () => '', afterResult: () => '', routeBlock: () => '' },
    RTPace: { setup: noop, apply: noop },
    RTBunri: { needsAsk: () => false, ask: () => '' },
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(appFile, ctx, { timeout: 30000 });

  const DATA = {
    config: data.config, stages: data.stages, tiers: [...data.tiers],
    routes: JSON.parse(JSON.stringify(data.routes)), unis: [...data.unis],
    guides: [...data.guides], books: [...data.books],
  };
  const before = {
    books: DATA.books.length, tiers: DATA.tiers.length, unis: DATA.unis.length,
    guides: DATA.guides.length, routes: Object.keys(DATA.routes).length,
  };
  try {
    ctx.window.RT_SUBJECT_APP(DATA);
  } catch {
    // 末尾の初期化が DOM に触れて落ちるのは想定内。件数を変える文はそれより前にある
  }
  const after = {
    books: DATA.books.length, tiers: DATA.tiers.length, unis: DATA.unis.length,
    guides: DATA.guides.length, routes: Object.keys(DATA.routes).length,
  };
  for (const k of Object.keys(before)) {
    if (before[k] !== after[k]) {
      throw new Error(
        `${dir}: 起動すると ${k} が ${before[k]} → ${after[k]} に変わる。`
        + ` 宣言のあとの ${k.toUpperCase()} への追加が app 側に残っている`
        + `（build/lib/subject-split.mjs の DATA_MUTATIONS を見る）`);
    }
  }
}

for (const dir of dirs) {
  const sub = SUBJECTS.find(s => s.dir === dir);
  if (!sub) throw new Error(`科目 ${dir} は SUBJECTS に無い`);
  if (isMigrated(ROOT, dir)) {
    console.log(`${dir}: すでに移行済み。何もしない`);
    continue;
  }

  const data = loadSubjectData(ROOT, dir, { fresh: true });
  const file = path.join(ROOT, dir, 'index.html');
  const html = fs.readFileSync(file, 'utf8');

  const main = inlineScripts(html).filter(s => /^const BOOKS\b/m.test(s.code));
  if (main.length !== 1) throw new Error(`${dir}: データの script が ${main.length} 個。1 個のはず`);
  const { cuts, app } = splitScript(main[0].code);

  const names = cuts.map(c => c.name);
  for (const need of ['CONFIG', 'STAGES', 'BOOKS']) {
    if (!names.includes(need)) throw new Error(`${dir}: ${need} の宣言を切り出せなかった`);
  }

  const appFile = buildAppFile(dir, app);
  assertNoDataDrift(dir, appFile, data);
  const nextHtml = html.slice(0, main[0].start) + bootstrap(dir) + html.slice(main[0].end);

  const canonical = {
    'books.json': { schemaVersion: 1, books: data.books },
    'universities.json': { schemaVersion: 1, universities: data.unis },
    'routes.json': { schemaVersion: 1, routes: data.routes, tiers: data.tiers },
    'guides.json': { schemaVersion: 1, guides: data.guides },
    'stages.json': { schemaVersion: 1, stages: data.stages },
    'config.json': { schemaVersion: 1, config: data.config },
  };

  console.log(`${dir}:`);
  console.log(`  切り出した定数: ${names.join(', ')}`);
  console.log(`  HTML  ${Buffer.byteLength(html).toLocaleString()} → ${Buffer.byteLength(nextHtml).toLocaleString()} バイト`);
  console.log(`  app   assets/js/subject-${dir}.js  ${Buffer.byteLength(appFile).toLocaleString()} バイト`);
  console.log(`  正本  data/subjects/${dir}/  ${Object.keys(canonical).length} ファイル / ${data.books.length} 冊`);
  if (DRY) { console.log('  --dry のため書き込まない'); continue; }

  for (const [name, obj] of Object.entries(canonical)) {
    writeCanonicalFile(path.join(ROOT, 'data', 'subjects', dir, name), obj);
  }
  fs.writeFileSync(path.join(ROOT, 'assets', 'js', `subject-${dir}.js`), appFile);
  fs.writeFileSync(file, nextHtml);
  clearSubjectCache();
  console.log('  書いた');
}
