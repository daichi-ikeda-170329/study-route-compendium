/**
 * sitemap.xml を実ファイルから組み立て直す。
 *
 * 生成済みページを走査して作るので、ページを増やしたあとに毎回実行すれば
 * 記載漏れが起きない。**最後に実行する。**
 *
 * lastmod は「そのページが実際に表示している最終更新日」を使う。全 URL に
 * 今日の日付を入れると、何も変えていないページまで更新したと申告することになり、
 * クローラーが lastmod を信用しなくなる。ページ側の <time datetime> が正本で、
 * 無い場合だけ git のコミット日に落とす。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, ORIGIN } from './lib/extract.mjs';
import { fileDate } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** そのページが表示している最終更新日。取れなければ git のコミット日 */
function lastmodOf(relDir) {
  const file = path.join(ROOT, relDir, 'index.html');
  try {
    const m = fs.readFileSync(file, 'utf8').match(/<time datetime="(\d{4}-\d{2}-\d{2})"/);
    if (m) return m[1];
  } catch { /* 読めなければ git に聞く */ }
  return fileDate(path.join(relDir, 'index.html'));
}

/** URL を 1 本足す。loc からディレクトリを割り出して lastmod を引く */
function add(list, dirPath, priority, changefreq) {
  list.push({
    loc: dirPath === '' ? `${ORIGIN}/` : `${ORIGIN}/${dirPath}/`,
    priority, changefreq, lastmod: lastmodOf(dirPath),
  });
}

const urls = [];
add(urls, '', '1.0', 'weekly');

// 信頼性ページ（/about/ /methodology/ /privacy/ /disclaimer/ /ads/ /changelog/）
for (const slug of ['about', 'methodology', 'privacy', 'disclaimer', 'ads', 'changelog']) {
  if (fs.existsSync(path.join(ROOT, slug, 'index.html'))) add(urls, slug, '0.5', 'monthly');
}

for (const s of SUBJECTS) {
  add(urls, s.dir, '0.9', 'weekly');

  for (const [sub, priority] of [['books', '0.8'], ['osusume', '0.8'], ['guides', '0.8'], ['routes', '0.8']]) {
    if (fs.existsSync(path.join(ROOT, s.dir, sub, 'index.html'))) {
      add(urls, `${s.dir}/${sub}`, priority, 'weekly');
    }
  }
  for (const [sub, priority] of [['guides', '0.8'], ['routes', '0.7'], ['books', '0.6']]) {
    const dir = path.join(ROOT, s.dir, sub);
    if (!fs.existsSync(dir)) continue;
    const ids = fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'index.html')))
      .map(d => d.name)
      .sort();
    for (const id of ids) {
      add(urls, `${s.dir}/${sub}/${id}`, priority, sub === 'routes' ? 'weekly' : 'monthly');
    }
  }
}

// 科目に属さない記事（/guides/…）
const rootGuides = path.join(ROOT, 'guides');
if (fs.existsSync(path.join(rootGuides, 'index.html'))) add(urls, 'guides', '0.8', 'weekly');
if (fs.existsSync(rootGuides)) {
  for (const d of fs.readdirSync(rootGuides, { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(rootGuides, d.name, 'index.html'))) {
      add(urls, `guides/${d.name}`, '0.8', 'monthly');
    }
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`  ✓ sitemap.xml — ${urls.length} URL`);
