/**
 * 移行済み科目の配信アセットを作り、科目 HTML のマニフェストを書き換える。
 *
 *   node build/generate-subject-assets.mjs           作る
 *   node build/generate-subject-assets.mjs --check   ずれていれば終了コード 1
 *
 * 正本は `data/subjects/<科目>/`（`dist/` へは出ない）。
 * 配信用は `assets/generated/subjects/<科目>.<種類>.json`（`assets/` は公開される）。
 *
 * ## マニフェストを HTML へ埋める理由
 *
 * GitHub Pages はレスポンスヘッダーを制御できない。「ハッシュ付きファイル名＋別
 * manifest.json を fetch」方式は、manifest だけが古くキャッシュされたときに
 * 存在しないファイルを指す壊れ方をする。ファイル名は固定し、`?v=<内容ハッシュ>`
 * だけを変え、マニフェストは HTML へインラインで埋める。往復も 1 つ減る。
 *
 * ## 生成物をコミットする
 *
 * `assets/js/book-index.js` と同じ扱い。GitHub Pages はビルドを実行しないので、
 * 生成物はリポジトリに入れる。`npm run build` を 2 回流して `git diff --exit-code`
 * が通ることが、生成が入力以外に依存していないことの証明になる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { loadSubjectData, isMigrated } from './lib/load-subject-data.mjs';
import { ASSET_KINDS, ASSET_DIR, buildAssets, contentHash } from './lib/subject-assets.mjs';
import { topLevelFunctions, EXPOSED_STATE, topLevelBindings } from './lib/subject-split.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** マニフェストのインライン script。ここを目印に書き換える */
const MANIFEST_BEGIN = '<script>/* RT_SUBJECT_ASSETS — build/generate-subject-assets.mjs が書き換える。手で編集しない */';
const MANIFEST_END = '</' + 'script>';

/**
 * 起動前に押されたインライン onclick を取りこぼさないための受け皿。
 *
 * HTML の `onclick="openModal('xxx')"` は、事前描画済みのカードにも付いている。
 * データが届く前に押されると `openModal is not defined` になるので、
 * マニフェストと同じインライン script で「呼び出しを覚えておくだけの関数」を先に置き、
 * 起動後に本物へ差し替えて溜まった呼び出しを流す。
 */
function shim(apiNames) {
  return `window.RT_SUBJECT_QUEUE=[];`
    + `(${JSON.stringify(apiNames)}).forEach(function(n){`
    + `if(window[n])return;`
    + `window[n]=function(){window.RT_SUBJECT_QUEUE.push([n,[].slice.call(arguments)])};`
    + `window[n].__rtStub=1});`
    + `window.RT_SUBJECT_FLUSH=function(){`
    + `var q=window.RT_SUBJECT_QUEUE;window.RT_SUBJECT_QUEUE=[];`
    + `q.forEach(function(c){var f=window[c[0]];if(typeof f==="function"&&!f.__rtStub)f.apply(null,c[1])})};`;
}

/** 科目 HTML のマニフェスト区間を差し替える */
function replaceManifest(src, body) {
  const i = src.indexOf(MANIFEST_BEGIN);
  if (i < 0) return null;
  const j = src.indexOf(MANIFEST_END, i);
  if (j < 0) return null;
  return src.slice(0, i + MANIFEST_BEGIN.length) + body + src.slice(j);
}

/** app スクリプトの `?v=` を差し替える */
function replaceAppVersion(src, dir, hash) {
  const re = new RegExp(`(src="/assets/js/subject-${dir}\\.js)(\\?v=[0-9a-f]+)?(")`);
  if (!re.test(src)) return null;
  return src.replace(re, `$1?v=${hash}$3`);
}

let wrote = 0;
const stale = [];

for (const s of SUBJECTS) {
  if (!isMigrated(ROOT, s.dir)) continue;

  const data = loadSubjectData(ROOT, s.dir, { fresh: true });
  const assets = buildAssets(data);

  const files = {};
  const bytes = {};
  for (const kind of ASSET_KINDS) {
    const text = JSON.stringify(assets[kind]) + '\n';
    const rel = `${ASSET_DIR}/${s.dir}.${kind}.json`;
    const abs = path.join(ROOT, rel);
    const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (cur !== text) {
      if (CHECK) stale.push(rel);
      else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); wrote++; }
    }
    files[kind] = `/${rel}?v=${contentHash(text)}`;
    bytes[kind] = Buffer.byteLength(text);
  }

  // app スクリプトの内容ハッシュ。中身が変われば URL が変わる
  const appRel = `assets/js/subject-${s.dir}.js`;
  const appAbs = path.join(ROOT, appRel);
  if (!fs.existsSync(appAbs)) throw new Error(`${appRel} が無い。先に build/migrate-subject.mjs を流す`);
  const appSrc = fs.readFileSync(appAbs, 'utf8');
  const appHash = contentHash(appSrc);

  // HTML の onclick から呼ばれる名前。起動前に押されたときの受け皿に使う
  const fns = topLevelFunctions(appSrc);
  const bindings = topLevelBindings(appSrc);
  const api = [...fns, ...EXPOSED_STATE.filter(n => bindings.has(n))].sort();

  const manifest = `window.RT_SUBJECT_ASSETS=${JSON.stringify({ v: 1, subject: s.dir, files, bytes })};`;
  const body = manifest + shim(fns);

  const file = path.join(ROOT, s.dir, 'index.html');
  const src = fs.readFileSync(file, 'utf8');
  let out = replaceManifest(src, body);
  if (out === null) throw new Error(`${s.dir}/index.html にマニフェストの区間が無い`);
  out = replaceAppVersion(out, s.dir, appHash);
  if (out === null) throw new Error(`${s.dir}/index.html に subject-${s.dir}.js の script タグが無い`);

  if (out !== src) {
    if (CHECK) stale.push(`${s.dir}/index.html`);
    else { fs.writeFileSync(file, out); wrote++; }
  }

  if (!CHECK) {
    const total = Object.values(bytes).reduce((a, b) => a + b, 0);
    console.log(`  ✓ ${s.dir}: アセット ${ASSET_KINDS.length} 本 / 合計 ${(total / 1024).toFixed(1)}KB / api ${api.length} 個`);
  }
}

if (CHECK) {
  if (stale.length) {
    console.error('配信アセットが古い。node build/generate-subject-assets.mjs を流す:');
    for (const f of stale.slice(0, 20)) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('配信アセットは最新');
} else {
  console.log(`${wrote} 件を書いた（変化が無い分は書かない）`);
}
