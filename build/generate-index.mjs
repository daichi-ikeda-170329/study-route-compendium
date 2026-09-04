/**
 * 科目ごとの参考書一覧ページ（/<科目>/books/）を生成する。
 *
 * 個別ページ 1,052 件への内部リンクの起点になる。sitemap だけに載せた
 * ページはクロールが遅れるため、たどれる一覧を必ず用意する。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, SUB_LABELS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, header, crumbs, footer, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { bookCards } from './lib/cards.mjs';
import { adUnit } from './lib/ads.mjs';
import { byDifficultyAsc } from './lib/rank.mjs';
import { degreeTable } from './lib/scale.mjs';
import { subjectContentDate, saveDates } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function render(sub, d, counts) {
  const url = `${ORIGIN}/${sub.dir}/books/`;
  // 一覧の中身は科目データの BOOKS がすべて。**読者に見える中身が変わった日**を更新日にする
  const updated = subjectContentDate(sub.dir, d);
  const n = d.books.length;
  const stageKeys = Object.keys(d.stages).filter(k => d.books.some(b => b.stage === k));
  const hasSub = d.books.some(b => b.sub);

  const title = `${sub.ja}の参考書一覧${n}冊｜難易度・役割つき索引 - ${sub.full}`;
  // meta description は 120 字以内。役割の一覧を全部並べると尻切れになるので、
  // 「何が何冊あって、1 冊ごとに何が分かるか」だけに絞る。
  const desc = clip(`大学受験の${sub.ja}参考書${n}冊を、役割別・難易度順に並べた索引。`
    + `1 冊ごとにレベル・到達目安・向いている人・次に進む本を確認できます。${sub.fields}に対応。`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` },
    { name: '参考書一覧', url, absUrl: url },
  ];

  const sections = stageKeys.map(key => {
    const st = d.stages[key];
    // 難易度順は build/lib/rank.mjs の 1 か所だけを根拠にする。
    // 評価が未了の新刊は diff を持たないので、比較子の中で常に末尾へ落とす
    const list = d.books.filter(b => b.stage === key).sort(byDifficultyAsc);

    // 分野（現代文・物理など）を持つ科目は、役割の中をさらに分野で仕切る
    const groups = hasSub
      ? [...new Set(list.map(b => b.sub || ''))].map(s => ({
          label: s ? (SUB_LABELS[s] || s) : 'その他',
          list: list.filter(b => (b.sub || '') === s),
        }))
      : [{ label: '', list }];

    const body = groups.map(g => `${g.label ? `      <h3 class="grp">${esc(g.label)}<span>${g.list.length}冊</span></h3>\n` : ''}${bookCards(g.list, sub, d.stages)}`).join('\n');

    return `    <section class="block" id="stage-${key}">
      <div class="eyebrow" style="color:${st.color}"><span style="display:none"></span>${esc(st.short)}</div>
      <h2 class="sec">${esc(st.label)}<span class="cnt">${list.length}冊</span></h2>
${body}
    </section>`;
  }).join('\n\n');

  const nav = stageKeys.map(k =>
    `      <a href="#stage-${k}" style="--nc:${d.stages[k].color}">${esc(d.stages[k].label)}<b>${d.books.filter(b => b.stage === k).length}</b></a>`
  ).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        dateModified: updated,
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'ItemList',
        name: `${sub.ja}の参考書一覧`,
        numberOfItems: n,
        itemListElement: d.books.map((b, i) => ({
          '@type': 'ListItem', position: i + 1, name: b.name,
          url: `${ORIGIN}/${sub.dir}/books/${b.id}/`,
        })),
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/${sub.ogp || `ogp-${sub.dir}.png`}` })}
<style>
:root{--sc:${sub.color}}
h2.sec .cnt{font-family:var(--mono);font-size:12px;color:var(--muted);font-weight:600;margin-left:12px;letter-spacing:.06em}
h3.grp{font-family:var(--serif);font-weight:800;font-size:15px;letter-spacing:.04em;margin:24px 0 10px;display:flex;align-items:baseline;gap:10px;color:var(--ink-2)}
h3.grp span{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);font-weight:600}
.stnav{display:flex;flex-wrap:wrap;gap:7px;margin-top:20px}
.stnav a{display:inline-flex;align-items:baseline;gap:7px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--nc);padding:10px 14px;font-size:12.5px;font-weight:700;color:var(--ink-2);transition:.15s;box-shadow:var(--sh-s)}
.stnav a:hover{transform:translateY(-2px);box-shadow:var(--sh-m)}
.stnav a b{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:600}
</style>
</head>
<body>

${topBars(sub.dir)}

${header(sub)}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Catalog index</div>
    <h1 class="sec" style="font-size:29px">${esc(sub.ja)}の参考書一覧　${n}冊</h1>
    <p class="sec-lead">${esc(sub.full)}に収録している${esc(sub.ja)}の参考書${n}冊を、役割別・難易度順に並べた索引です。各冊のページで、レベル・到達目安・向いている人・強みと注意点・次に進む本を確認できます。対象は${esc(sub.fields)}。</p>
    ${sub.catalogOnly ? '' : `<p class="sec-lead">${n}冊は多すぎるという場合は、志望校ルートで実際に本線として選んだ本だけを集めた<a href="/${sub.dir}/osusume/">${esc(sub.ja)}の参考書おすすめ</a>から見てください。</p>`}
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
    ${degreeTable()}
    <div class="stnav">
${nav}
    </div>
  </div>

${sections}

  <div class="cta">
    <h2>${sub.catalogOnly ? '一覧から選ぶより、段階から選ぶほうが速い' : '一覧から選ぶより、ルートから選ぶほうが速い'}</h2>
    <p>${sub.catalogOnly
    ? `${n}冊を上から順に検討する必要はありません。図鑑では段階（${stageKeys.map(k => d.stages[k].label).join('・')}）で絞り込めます。`
    : `${n}冊を上から順に検討する必要はありません。志望校と今の学力を入れると、この中を通る道だけが残ります。`}</p>
    <div class="cta__btns">
      ${sub.catalogOnly
    ? `<a class="p" href="/${sub.dir}/#catalog">${esc(sub.ja)}の参考書図鑑へ<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/">全科目を見る</a>`
    : `<a class="p" href="/${sub.dir}/#route">${esc(sub.ja)}のルートを作る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/${sub.dir}/osusume/">おすすめだけ見る</a>`}
    </div>
  </div>${adUnit('bottom', '  ')}
</main>

${footer(sub.dir, counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = loadSubjectData(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

for (const sub of SUBJECTS) {
  const outDir = path.join(ROOT, sub.dir, 'books');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), render(sub, data[sub.dir], counts));
  console.log(`  ✓ ${sub.dir}/books/index.html  (${counts[sub.dir]}冊)`);
}

/* 更新日の台帳を書き戻す。書き戻さないと次の実行で前回の日付を思い出せず、
   実際には変えていない日を「更新日」として出してしまう */
saveDates();
