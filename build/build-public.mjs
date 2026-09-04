/**
 * 公開用の dist/ を作る。
 *
 *   node build/build-public.mjs           作る
 *   node build/build-public.mjs --check   作らずに、公開してはいけないものが無いか見る
 *
 * **リポジトリ全体を公開しない。** 2026-09 の時点では GitHub Pages がリポジトリ直下を
 * そのまま配信していたため、本番から build/・test/・data/_backup/・package.json を
 * そのまま取得できた。生成の仕組みや検証中のメモが、意図せず公開されている状態だった。
 *
 * ここでは **許可リストで拾う**（禁止リストで落とすのではなく）。禁止リストは
 * 「新しく置いたものが既定で公開される」ので、足し忘れが事故になる。
 * 許可リストなら、足し忘れは「公開されない」で終わる。
 *
 * dist/ は毎回まるごと作り直す。古いファイルが残ると、消したはずのページが
 * 公開され続ける。削除はリポジトリ直下の dist/ に限定し、パスを検証してから行う。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');

/** 公開してよいもの。ここに無いものは公開されない */
const ALLOW_FILES = [
  'index.html', '404.html',
  'robots.txt', 'sitemap.xml', 'ads.txt',
  'favicon.svg', 'CNAME', '.nojekyll',
  // IndexNow の鍵ファイル。ファイル名が鍵そのものなので、名前で拾わず拡張子で拾う
];

/** 公開してよいディレクトリ。中身は再帰的に入れる */
const ALLOW_DIRS = [
  'assets',
  'about', 'ads', 'changelog', 'disclaimer', 'guides', 'methodology', 'privacy',
  /* 学習の記録（noindex,follow）。中身は端末の localStorage にしかないが、
     器の HTML と描画コードは配信する。ここへ足し忘れると、生成はされるのに
     本番で 404 になる（許可リスト方式のため） */
  'progress',
  ...SUBJECTS.map(s => s.dir),
];

/** assets/ の中でも公開しないもの。X のプロフィール用画像はサイトから参照しない */
const ASSET_SKIP = new Set(['x-header.png', 'x-header.svg', 'x-icon.png', 'x-icon.svg']);

/** どのディレクトリでも公開しない名前 */
const NEVER = new Set(['.DS_Store', 'Thumbs.db', '.git', 'node_modules']);

/** 公開物に混ざってはいけないパターン。--check と test/dist.test.mjs が使う */
export const FORBIDDEN_PATH = [
  /(^|\/)\.git(\/|$)/, /(^|\/)\.github(\/|$)/, /(^|\/)node_modules(\/|$)/,
  /(^|\/)build(\/|$)/, /(^|\/)tests?(\/|$)/, /(^|\/)e2e(\/|$)/,
  /(^|\/)docs(\/|$)/, /(^|\/)data(\/|$)/,
  /(^|\/)test-results(\/|$)/, /(^|\/)playwright-report(\/|$)/,
  /(^|\/)package(-lock)?\.json$/, /(^|\/)README\.md$/, /(^|\/)playwright\.config\./,
  /\.map$/, /\.mjs$/, /\.md$/, /\.csv$/, /(^|\/)\.env/, /(^|\/)\.gitignore$/,
];

/** 公開物に混ざってはいけない文字列。鍵や管理用の値の取り違えを拾う */
export const FORBIDDEN_TEXT = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: '秘密鍵' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS のアクセスキー' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, why: 'GitHub のトークン' },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/, why: 'API キー' },
  { re: /\bAIza[0-9A-Za-z_-]{30,}\b/, why: 'Google API キー' },
];

/** ROOT 配下であることを確かめる。dist/ の削除で外へ出ないための歯止め */
function assertInsideRoot(p) {
  const r = path.resolve(p);
  if (r !== ROOT && !r.startsWith(ROOT + path.sep)) {
    throw new Error(`リポジトリの外を触ろうとしている: ${r}`);
  }
  return r;
}

function rmDist() {
  const d = assertInsideRoot(DIST);
  if (path.basename(d) !== 'dist' || path.dirname(d) !== ROOT) {
    throw new Error(`削除してよいのはリポジトリ直下の dist/ だけ: ${d}`);
  }
  fs.rmSync(d, { recursive: true, force: true });
}

function copyDir(srcRel, out) {
  const src = path.join(ROOT, srcRel);
  if (!fs.existsSync(src)) return;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (NEVER.has(e.name)) continue;
    const rel = path.join(srcRel, e.name);
    if (srcRel === 'assets' && ASSET_SKIP.has(e.name)) continue;
    if (e.isDirectory()) { copyDir(rel, out); continue; }
    if (FORBIDDEN_PATH.some(re => re.test(rel.split(path.sep).join('/')))) continue;
    const dst = path.join(out, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
}

/** dist/ に入っているものを列挙する */
export function listDist(dir = DIST, base = DIST, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listDist(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function build() {
  rmDist();
  fs.mkdirSync(DIST, { recursive: true });

  for (const f of ALLOW_FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
  }
  // IndexNow の鍵ファイル（名前が鍵そのもの）。直下の 32 桁 .txt だけを拾う
  for (const f of fs.readdirSync(ROOT)) {
    if (/^[0-9a-f]{32}\.txt$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
  }
  for (const d of ALLOW_DIRS) copyDir(d, DIST);

  const files = listDist();
  const bytes = files.reduce((a, f) => a + fs.statSync(path.join(DIST, f)).size, 0);
  const html = files.filter(f => f.endsWith('.html'));
  console.log(`dist/ を作った: ${files.length} ファイル / HTML ${html.length} 枚 / ${(bytes / 1048576).toFixed(1)} MB`);
  return files;
}

/** 公開物に入ってはいけないものが無いか見る */
export function auditDist() {
  const problems = [];
  const files = listDist();
  if (!files.length) return ['dist/ が空。先に node build/build-public.mjs を流す'];

  for (const f of files) {
    if (FORBIDDEN_PATH.some(re => re.test(f))) problems.push(`公開してはいけないパス: ${f}`);
  }
  const TEXTY = /\.(html|css|js|json|txt|xml|webmanifest)$/;
  for (const f of files.filter(f => TEXTY.test(f))) {
    const src = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const { re, why } of FORBIDDEN_TEXT) {
      if (re.test(src)) problems.push(`${why}らしき文字列: ${f}`);
    }
    if (/\/\/# sourceMappingURL=/.test(src)) problems.push(`ソースマップの参照: ${f}`);
  }
  return problems;
}

function main() {
  if (!CHECK) build();
  const problems = auditDist();
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (problems.length) {
    console.error(`公開物の検査で ${problems.length} 件見つかった`);
    process.exit(1);
  }
  console.log('公開物の検査を通過した');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
