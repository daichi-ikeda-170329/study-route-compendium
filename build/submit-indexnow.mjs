/**
 * IndexNow にページの URL を通知する。
 *
 * Bing・Yahoo・DuckDuckGo・Yandex などが対応しているインデックス即時通知の仕組みで、
 * アカウント登録は要らない。サイト直下に置いたキーファイルで所有権を証明する。
 * Google は IndexNow に対応していないので、Google 向けは Search Console の
 * サイトマップ送信が引き続き必要になる。
 *
 *   git diff --name-status -M <ref> HEAD > changed.txt
 *   node build/submit-indexnow.mjs --changed changed.txt   その差分で変わったページだけ送る
 *   node build/submit-indexnow.mjs                         sitemap.xml の全 URL を送る（大量に作り直したときだけ）
 *   --dry を付けると送信内容だけ表示する
 *
 * デプロイのたびに全 URL を送ると、Bing Webmaster Tools が「IndexNow is in batch mode」
 * （重要度 Moderate）と判定する（2026-09-19 に管理画面で確認）。そのため CI は --changed で
 * 差分だけを送る。差分は呼び出し側（pages.yml）が git で取る。build/ のスクリプトは git を
 * 呼ばない決まり（test/data-integrity.test.mjs）なので、ここでは渡された差分を読むだけにする。変わったページは、公開物の元になる <パス>/index.html の追加・変更・削除
 * から求める。削除したページも送る（IndexNow は消えた URL の通知も受け付ける）。
 *
 * ページを増やしたあと、sitemap.xml を作り直して本番へ反映してから実行する。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ORIGIN } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = new URL(ORIGIN).host;

/**
 * `git diff --name-status` の出力から、通知する URL を求める。
 * 追加・変更したページは sitemap.xml に載っているものだけを送る（404.html などを除く）。
 * 削除したページは sitemap から消えているので、そのまま送る。
 */
export function urlsFromChangedFiles(nameStatus, sitemapUrls, origin = ORIGIN) {
  const inSitemap = new Set(sitemapUrls);
  const urls = new Set();
  for (const line of nameStatus.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...paths] = line.split('\t');
    // リネーム（R100 旧 新）は旧パスを削除、新パスを追加として扱う
    const entries = status.startsWith('R') || status.startsWith('C')
      ? [['D', paths[0]], ['A', paths[1]]]
      : [[status[0], paths[0]]];
    for (const [st, file] of entries) {
      if (!file || !/(^|\/)index\.html$/.test(file)) continue;
      const url = `${origin}/${file.replace(/index\.html$/, '')}`;
      if (st === 'D' || inSitemap.has(url)) urls.add(url);
    }
  }
  return [...urls];
}

function main() {
const DRY = process.argv.includes('--dry');
const changedIdx = process.argv.indexOf('--changed');
const CHANGED = changedIdx >= 0 ? process.argv[changedIdx + 1] : null;

/** サイト直下の <キー>.txt を探す。中身とファイル名が一致していることが条件 */
function findKey() {
  const files = fs.readdirSync(ROOT).filter(f => /^[0-9a-f]{8,128}\.txt$/.test(f));
  if (files.length === 0) throw new Error('キーファイル（<16進数>.txt）がサイト直下にない');
  if (files.length > 1) throw new Error(`キーファイルが複数ある: ${files.join(', ')}`);
  const key = files[0].replace(/\.txt$/, '');
  const body = fs.readFileSync(path.join(ROOT, files[0]), 'utf8').trim();
  if (body !== key) throw new Error(`${files[0]} の中身がファイル名と一致しない`);
  return key;
}

/** sitemap.xml を URL の正本として使う。生成漏れがあればここで一緒に落ちる */
function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (urls.length === 0) throw new Error('sitemap.xml から URL を取り出せなかった');
  return urls;
}

const key = findKey();
let urlList;
if (CHANGED === null) {
  urlList = urlsFromSitemap();
} else {
  if (!CHANGED || !fs.existsSync(CHANGED)) throw new Error(`--changed のファイルが無い: ${CHANGED}`);
  urlList = urlsFromChangedFiles(fs.readFileSync(CHANGED, 'utf8'), urlsFromSitemap());
  if (urlList.length === 0) {
    console.log('変わったページは無い。送信しない。');
    return;
  }
}
const keyLocation = `${ORIGIN}/${key}.txt`;

console.log(`ホスト     : ${HOST}`);
console.log(`キー       : ${key}`);
console.log(`キーの場所 : ${keyLocation}`);
console.log(`対象       : ${CHANGED ? `${CHANGED} の差分で変わったページ` : 'sitemap.xml の全 URL'}`);
console.log(`URL 件数   : ${urlList.length}`);

if (DRY) {
  console.log('\n--dry のため送信しない。先頭 3 件:');
  urlList.slice(0, 3).forEach(u => console.log(`  ${u}`));
  return;
}

return send(key, keyLocation, urlList);
}

async function send(key, keyLocation, urlList) {
// 送信前に、キーファイルが本番から見えることを確かめる。
// ここが 404 のままだと IndexNow 側で所有権を確認できず、通知が捨てられる。
const probe = await fetch(keyLocation);
const probeBody = (await probe.text()).trim();
if (!probe.ok || probeBody !== key) {
  console.error(`キーファイルを本番で確認できない（status=${probe.status}）。`);
  console.error('キーファイルをコミットして GitHub Pages に反映してから実行する。');
  process.exit(1);
}
console.log('キーファイルの公開を確認した。');

// IndexNow は 1 リクエストあたり 10,000 URL まで受け付ける
const CHUNK = 10000;
for (let i = 0; i < urlList.length; i += CHUNK) {
  const chunk = urlList.slice(i, i + CHUNK);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation, urlList: chunk }),
  });
  const text = await res.text();
  // 200 = 受理、202 = 受理（キー検証は非同期）
  const ok = res.status === 200 || res.status === 202;
  console.log(`${ok ? '  ✓' : '  ✗'} ${chunk.length} 件を送信 → HTTP ${res.status} ${text.slice(0, 200)}`);
  if (!ok) process.exit(1);
}
console.log('IndexNow への通知が完了した。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) await main();
