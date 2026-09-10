/**
 * 新刊・評価準備中の一覧 `/new/` を作る（仕様書 4.4）。
 *
 *   node build/generate-new.mjs
 *
 * 対象は全科目の `provisional: true` の本（build/lib/newbooks.mjs の isProvisional）。
 * 評価が固まるまで難易度・到達目安は出さず、書名・出版社・ISBN・刊行年と役割だけを載せる。
 * **0 冊のときもページは作る**（フッターとポータルからリンクしているので、消すとリンク切れになる）。
 * 公開経路: build/all.mjs の STEPS / build/build-public.mjs の ALLOW_DIRS（'new'）/ sitemap。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, SUB_LABELS, ORIGIN, esc } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { isProvisional, PROVISIONAL_LABEL } from './lib/newbooks.mjs';
import { displayName } from './lib/booktitle.mjs';
import { head, topBars, portalHeader, footer, crumbs, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { recordDate, saveDates } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const data = {};
const counts = {};
for (const s of SUBJECTS) { data[s.dir] = loadSubjectData(ROOT, s.dir); counts[s.dir] = data[s.dir].books.length; }

/* 科目ごとの評価待ちの本。並び順は刊行年の新しい順 → 書名（新刊は難易度を持たないので難易度では並べない） */
const groups = SUBJECTS.map(s => ({
  s,
  books: data[s.dir].books.filter(isProvisional)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.name).localeCompare(String(b.name), 'ja')),
})).filter(g => g.books.length);
const total = groups.reduce((a, g) => a + g.books.length, 0);

const url = `${ORIGIN}/new/`;
const updated = recordDate('page:new', groups.map(g => [g.s.dir, g.books.map(b => b.id)]));
const title = `新刊・評価準備中の参考書 - ルート大全`;
const desc = '収録したばかりで、難易度・到達目安の評価がまだ済んでいない参考書の一覧です。書名・出版社・ISBN・刊行年と役割だけを載せています。';
const crumbItems = [
  { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
  { name: '新刊・評価準備中', url: '/new/', absUrl: url },
];

const body = total ? groups.map(({ s, books }) => `  <section class="block">
    <div class="eyebrow">${esc(s.en)}</div>
    <h2 class="sec">${esc(s.ja)}<span class="ncount">${books.length}冊</span></h2>
    <ul class="nlist">
${books.map(b => {
    const st = data[s.dir].stages[b.stage] || {};
    const field = b.sub ? SUB_LABELS[b.sub] : '';
    return `      <li><a href="/${s.dir}/books/${b.id}/">${esc(displayName(b, s.dir))}</a>
        <span>${esc(b.pub || '—')}${b.year ? `／${b.year} 年` : ''}${b.isbn13 ? `／ISBN ${esc(b.isbn13)}` : ''}</span>
        <span>${esc([field, st.label].filter(Boolean).join('・') || '—')}　<b>${esc(PROVISIONAL_LABEL)}</b></span></li>`;
  }).join('\n')}
    </ul>
  </section>`).join('\n\n') : `  <section class="block">
    <p class="nempty">いま評価待ちの本はありません。</p>
  </section>`;

const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    breadcrumbLd(crumbItems, `${url}#breadcrumb`),
    { '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: title, description: desc, inLanguage: 'ja',
      dateModified: updated, isPartOf: { '@id': `${ORIGIN}/#website` }, breadcrumb: { '@id': `${url}#breadcrumb` } },
  ],
};

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#24427C}
.ncount{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:600;margin-left:10px}
.nlist{list-style:none;margin-top:14px;display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);box-shadow:var(--sh-s)}
.nlist li{background:var(--surface);padding:13px 16px}
.nlist a{font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-color:var(--line-d);text-underline-offset:3px;padding:3px 0;display:inline-block}
.nlist span{display:block;font-size:12px;color:var(--muted);margin-top:3px}
.nlist b{color:var(--accent-deep);font-weight:700}
.nempty{font-size:14px;color:var(--ink-2);padding:18px 0}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">New books</div>
    <h1 class="sec" style="font-size:29px">新刊・評価準備中の参考書</h1>
    <p class="sec-lead">評価が固まるまで難易度・到達目安は出しません。書名・出版社・ISBN・刊行年と役割だけを載せています。現物を確認して評価を書いたら、この一覧から外れて通常の図鑑とルートに並びます。</p>
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
  </div>

${body}
</main>

${footer('', counts)}

${jsonLd(ld)}

</body>
</html>
`;

fs.mkdirSync(path.join(ROOT, 'new'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'new', 'index.html'), html);
console.log(`  ✓ /new/（評価待ち ${total} 冊）`);
saveDates();
