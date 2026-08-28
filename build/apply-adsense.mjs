/**
 * Google AdSense の ID を、サイト全体へ一度に反映する。
 *
 *   node build/apply-adsense.mjs ca-pub-1234567890123456     # 有効にする
 *   node build/apply-adsense.mjs ca-pub-… --in-article=1234567890 --bottom=9876543210
 *   node build/apply-adsense.mjs --off                       # 取り消す
 *   node build/apply-adsense.mjs --check                     # いまの状態を見る
 *
 * ID の置き場が 3 種類あるため（生成側の定数・手書き HTML の <head>・手書き HTML の
 * CONFIG）、手で書き換えると必ずどれかが取り残される。書き換えはこの 1 本に集約する。
 *
 * 実行後は生成ページを流し直すこと（このスクリプトは生成物に触らない）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** ID を書き込む手書き HTML。CONFIG を持たない 404 は <head> だけ */
const HTML = [
  { file: 'index.html',          config: true },
  { file: 'english/index.html',  config: true },
  { file: 'japanese/index.html', config: true },
  { file: 'math/index.html',     config: true },
  { file: 'science/index.html',  config: true },
  { file: 'social/index.html',   config: true },
  { file: '404.html',            config: false },
];

const ADS_MJS = 'build/lib/ads.mjs';
const ADS_TXT = 'ads.txt';
const GA_MARK = '<!-- Google アナリティクス 4 -->';
/** <head> に静的に置くローダー。審査時のクローラーが HTML から直接探すため JS で作らない */
const loaderBlock = id =>
  `<!-- Google AdSense -->\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${id}" crossorigin="anonymous"></script>\n`;
const LOADER_RE = /<!-- Google AdSense -->\n<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=[^"]*" crossorigin="anonymous"><\/script>\n/g;

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

/* ---------- 引数 ---------- */
const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || '';
const off = args.includes('--off');
const check = args.includes('--check');
const id = args.find(a => a.startsWith('ca-pub-')) || '';

if (!off && !check && !id) {
  console.error('使い方: node build/apply-adsense.mjs <ca-pub-…> [--in-article=…] [--bottom=…] | --off | --check');
  process.exit(1);
}
if (id && !/^ca-pub-\d{16}$/.test(id)) {
  console.error(`ID の形式が違う: ${id}\nAdSense の「アカウント情報」に出る ca-pub- + 数字 16 桁をそのまま渡す。`);
  process.exit(1);
}
for (const [k, v] of [['in-article', opt('in-article')], ['bottom', opt('bottom')]]) {
  if (v && !/^\d{6,}$/.test(v)) {
    console.error(`--${k} の形式が違う: ${v}\n広告ユニットのスロット ID（数字のみ）を渡す。`);
    process.exit(1);
  }
}

/* ---------- 現状の確認 ---------- */
if (check) {
  const cur = (read(ADS_MJS).match(/ADSENSE_CLIENT = '([^']*)'/) || [, ''])[1];
  const slots = read(ADS_MJS).match(/inArticle: '([^']*)',[\s\S]*?bottom: '([^']*)'/) || [, '', ''];
  console.log(`ads.mjs の ADSENSE_CLIENT : ${cur || '(未設定)'}`);
  console.log(`  広告ユニット inArticle  : ${slots[1] || '(未設定 — 自動広告のみ)'}`);
  console.log(`  広告ユニット bottom     : ${slots[2] || '(未設定 — 自動広告のみ)'}`);
  for (const h of HTML) {
    const s = read(h.file);
    const head = (s.match(/adsbygoogle\.js\?client=([^"]*)/) || [, ''])[1];
    const conf = h.config ? (s.match(/adsenseId:\s*"([^"]*)"/) || [, ''])[1] : '—';
    console.log(`${h.file.padEnd(20)} head: ${(head || '(なし)').padEnd(26)} CONFIG: ${conf || '(空)'}`);
  }
  console.log(`${ADS_TXT.padEnd(20)} ${fs.existsSync(path.join(ROOT, ADS_TXT)) ? read(ADS_TXT).trim() : '(なし)'}`);
  process.exit(0);
}

/* ---------- 反映 ---------- */
const changed = [];

let ads = read(ADS_MJS);
ads = ads.replace(/ADSENSE_CLIENT = '[^']*'/, `ADSENSE_CLIENT = '${off ? '' : id}'`);
if (off) {
  ads = ads.replace(/inArticle: '[^']*'/, `inArticle: ''`).replace(/bottom: '[^']*'/, `bottom: ''`);
} else {
  if (opt('in-article')) ads = ads.replace(/inArticle: '[^']*'/, `inArticle: '${opt('in-article')}'`);
  if (opt('bottom')) ads = ads.replace(/bottom: '[^']*'/, `bottom: '${opt('bottom')}'`);
}
write(ADS_MJS, ads);
changed.push(ADS_MJS);

for (const h of HTML) {
  let s = read(h.file);
  s = s.replace(LOADER_RE, '');                       // 既存のローダーを必ず落としてから入れ直す
  if (!off) {
    if (!s.includes(GA_MARK)) {
      console.error(`${h.file} に ${GA_MARK} が無い。挿入位置が見つからないので中断する。`);
      process.exit(1);
    }
    s = s.replace(GA_MARK, loaderBlock(id) + GA_MARK);
  }
  if (h.config) s = s.replace(/adsenseId:(\s*)"[^"]*"/, `adsenseId:$1"${off ? '' : id}"`);
  write(h.file, s);
  changed.push(h.file);
}

const adsTxtPath = path.join(ROOT, ADS_TXT);
if (off) {
  if (fs.existsSync(adsTxtPath)) { fs.unlinkSync(adsTxtPath); changed.push(`${ADS_TXT} (削除)`); }
} else {
  // AdSense の直販枠を宣言する 1 行。f08c47fec0942fa0 は Google 共通の認証 ID
  write(ADS_TXT, `google.com, ${id.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  changed.push(ADS_TXT);
}

console.log(off ? 'AdSense の設定を取り消した。' : `AdSense の ID を ${id} に設定した。`);
console.log(changed.map(f => `  - ${f}`).join('\n'));
console.log(`
次にやること:
  1) 生成ページを作り直す
     node build/generate-books.mjs && node build/generate-index.mjs \\
       && node build/generate-picks.mjs && node build/generate-routes.mjs \\
       && node build/generate-articles.mjs && node build/generate-search.mjs \\
       && node build/generate-sitemap.mjs
  2) node --test test/
  3) git add -A && git commit && git push（GitHub Pages へ反映される）
  4) node build/apply-adsense.mjs --check で全箇所に入ったか確認`);
