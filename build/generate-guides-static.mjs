/**
 * 科目トップの学習ガイドを 1 本 1 ページで出す（/<科目>/guides/basics/<nn>/）。
 *
 *   node build/generate-guides-static.mjs
 *
 * 型は解説記事と同じ（build/generate-articles.mjs の articlePage）。
 * 変換は build/lib/subject-guides.mjs、科目トップ側は見出しと「1 ページで読む」リンクだけを持つ。
 *
 * **`/<科目>/guides/basics/` は、科目に属する記事の slug と重ならないこと。**
 * 重なると同じパスに 2 枚書き出すので、ここで止める（article-categories.mjs の冒頭と同じ理由）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { ARTICLES } from './content/articles.mjs';
import { articlePage } from './generate-articles.mjs';
import { guideToArticle } from './lib/subject-guides.mjs';
import { recordDate, saveDates } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
for (const s of SUBJECTS) {
  const guides = loadSubjectData(ROOT, s.dir).guides || [];
  const baseDir = path.join(ROOT, s.dir, 'guides', 'basics');
  if (!guides.length) continue;

  const clash = ARTICLES.find(a => a.subject === s.dir && (a.slug === 'basics' || a.slug.startsWith('basics/')));
  if (clash) throw new Error(`${s.dir}: 記事の slug「${clash.slug}」が学習ガイドのパス /${s.dir}/guides/basics/ とぶつかる`);

  const keep = new Set();
  guides.forEach((g, i) => {
    /* 更新日は guides.json のその 1 本が変わった日。記事の求め方（articleContentDate）に通すと、
       台帳に無い新しいページが articles.mjs の日付を引き継ぎ、公開日より古い更新日が出る */
    const a = { ...guideToArticle(s.dir, g, i), updated: recordDate(`guide/${s.dir}/${i + 1}`, g) };
    const dir = path.join(ROOT, s.dir, 'guides', a.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), articlePage(a));
    keep.add(path.basename(a.slug));
    n++;
  });

  // ガイドを減らしたときに古いページが残らないようにする（sitemap に載らないページを置かない）
  for (const e of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (e.isDirectory() && !keep.has(e.name)) {
      fs.rmSync(path.join(baseDir, e.name), { recursive: true, force: true });
      console.log(`  – /${s.dir}/guides/basics/${e.name}/ を削除した`);
    }
  }
  console.log(`  ✓ ${s.dir}: 学習ガイド ${guides.length} 本`);
}
console.log(`合計 ${n} ページを生成した。`);

saveDates();
