/**
 * sitemap.xml を実ファイルから組み立て直す。
 *
 * 生成済みページを走査して作るので、ページを増やしたあとに毎回実行すれば
 * 記載漏れが起きない。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, ORIGIN } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: `${ORIGIN}/`, priority: '1.0', changefreq: 'weekly' },
];

for (const s of SUBJECTS) {
  urls.push({ loc: `${ORIGIN}/${s.dir}/`, priority: '0.9', changefreq: 'weekly' });

  for (const [sub, priority] of [['books', '0.8'], ['osusume', '0.8']]) {
    if (fs.existsSync(path.join(ROOT, s.dir, sub, 'index.html'))) {
      urls.push({ loc: `${ORIGIN}/${s.dir}/${sub}/`, priority, changefreq: 'weekly' });
    }
  }

  for (const [sub, priority] of [['guides', '0.8'], ['routes', '0.8']]) {
    if (fs.existsSync(path.join(ROOT, s.dir, sub, 'index.html'))) {
      urls.push({ loc: `${ORIGIN}/${s.dir}/${sub}/`, priority, changefreq: 'weekly' });
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
      urls.push({
        loc: `${ORIGIN}/${s.dir}/${sub}/${id}/`,
        priority,
        changefreq: sub === 'routes' ? 'weekly' : 'monthly',
      });
    }
  }
}

// 科目に属さない記事（/guides/…）
const rootGuides = path.join(ROOT, 'guides');
if (fs.existsSync(path.join(rootGuides, 'index.html'))) {
  urls.push({ loc: `${ORIGIN}/guides/`, priority: '0.8', changefreq: 'weekly' });
}
if (fs.existsSync(rootGuides)) {
  for (const d of fs.readdirSync(rootGuides, { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(rootGuides, d.name, 'index.html'))) {
      urls.push({ loc: `${ORIGIN}/guides/${d.name}/`, priority: '0.8', changefreq: 'monthly' });
    }
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`  ✓ sitemap.xml — ${urls.length} URL`);
