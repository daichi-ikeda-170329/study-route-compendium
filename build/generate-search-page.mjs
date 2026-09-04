/**
 * 詳細検索のページ `/search/` を作る。
 *
 *   node build/generate-search-page.mjs
 *
 * ## 公開経路（実装指示書 §4.4）
 *
 *   1. `build/all.mjs` の STEPS に入れる            … 済
 *   2. `build/build-public.mjs` の ALLOW_DIRS に足す … 済（'search'）
 *   3. `noindex,follow` なので sitemap から自動で外れる
 *   4. title / h1 / canonical を入れる              … 下の render()
 *   5. 内部リンクを張り、孤立ページにしない          … フッターの「詳細検索」
 *
 * ## noindex にする理由
 *
 * 絞り込みの組み合わせは無数にあり、検索結果ページを index させると
 * 中身の薄いページを大量に作ることになる。ここは**サイトの中で探すための道具**で、
 * 検索エンジンに載せるページではない。`follow` は残して、ここから
 * 書籍ページへ辿れることは妨げない。
 *
 * ## 索引は 2 本に分かれている
 *
 * ヘッダー検索が使う `assets/js/book-index.js`（v1・235KB）はそのまま。
 * このページだけが `assets/generated/search-facets.json`（v2）を読む。
 * v1 に絞り込み用の項目を足すと全ページの初回応答が悪くなる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, ORIGIN, esc } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, portalHeader, footer, crumbs, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { books as booksLabel } from './lib/site-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function render(counts, total) {
  const url = `${ORIGIN}/search/`;
  const title = `参考書の詳細検索｜出版社・著者・難易度から探す - ルート大全`;
  const desc = '収録している参考書を、科目・出版社・著者・役割・難易度帯・刊行年・確認状態で絞り込んで探せます。'
    + '情報が分かっていないものも「不明・確認中」として結果に出します。';

  const crumbItems = [
    { name: 'ルート大全', url: `${ORIGIN}/` },
    { name: '詳細検索', url },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, noindex: true, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#24427C}
.sf-layout{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:22px;align-items:start;margin-top:18px}
@media(max-width:860px){.sf-layout{grid-template-columns:1fr}}
.sf-panel{background:var(--card);border:1px solid var(--line-2);border-radius:8px;padding:14px 16px}
.sf-panel h2{font-size:15px;font-weight:800;margin-bottom:8px}
.sf-q{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font:inherit;background:var(--bg);color:inherit}
.sf-q:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.sf-group{border:none;margin:14px 0 0;padding:0}
.sf-group legend{font-weight:800;font-size:13.5px;padding:0;margin-bottom:6px}
.sf-opts{display:flex;flex-direction:column;gap:2px;max-height:15rem;overflow:auto}
.sf-opt{display:flex;align-items:center;gap:8px;min-height:44px;padding:2px 4px;font-size:13.5px;cursor:pointer;border-radius:4px}
.sf-opt:hover{background:var(--surface-2)}
.sf-opt input{width:18px;height:18px;flex:none}
.sf-opt input:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.sf-opt span{min-width:0;overflow-wrap:anywhere}
.sf-opt--unknown{color:var(--muted-2);font-style:normal}
.sf-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.sf-btn{min-height:44px;padding:10px 16px;border-radius:6px;border:1px solid var(--line);background:var(--bg);font:inherit;font-weight:700;cursor:pointer;color:inherit}
.sf-btn:hover{background:var(--surface-2)}
.sf-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.sf-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
.sf-count{font-weight:800}
.sf-sort{min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;background:var(--bg);color:inherit}
.sf-results{display:flex;flex-direction:column;gap:10px}
.sf-card{background:var(--card);border:1px solid var(--line-2);border-radius:8px;padding:14px 16px}
.sf-card__name{font-weight:800;font-size:15px;line-height:1.5;overflow-wrap:anywhere}
.sf-card__name a{color:inherit}
.sf-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:12.5px;color:var(--ink-2)}
.sf-meta b{font-weight:700}
.sf-unknown{color:var(--muted-2)}
.sf-badge{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
.sf-badge[data-v="verified"]{background:#E9F4EE;border-color:#9CCDB1;color:#1D5236}
.sf-badge[data-v="partial"]{background:#F6F1E6;border-color:#D8C79E;color:#5C4A1E}
.sf-badge[data-v="unverified"]{background:var(--surface-3);color:var(--ink-2)}
.sf-badge[data-v="notApplicable"]{background:var(--surface-3);color:var(--muted-2)}
.sf-empty{padding:24px 16px;text-align:center;color:var(--muted)}
.sf-more{margin-top:14px;text-align:center}
.sf-live{min-height:1.6em}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="art-head">
    <div class="eyebrow">Search</div>
    <h1 class="art-h1">参考書の詳細検索</h1>
    <p class="art-lead">収録している${booksLabel(total)}を、科目・出版社・著者・役割・難易度帯・刊行年・確認状態で絞り込めます。<b>情報が分かっていないものも結果に出します。</b>「著者で絞っていない」ことと「著者が分かっている本だけ見たい」ことは違うので、絞り込みを指定していない項目では、分かっていない本も外しません。</p>
  </div>

  <div id="sfStatus" class="sf-live" role="status" aria-live="polite"></div>

  <div class="sf-layout">
    <form class="sf-panel" id="sfPanel" role="search" aria-label="参考書の絞り込み">
      <h2><label for="sfQuery">書名・出版社・著者で探す</label></h2>
      <input class="sf-q" type="search" id="sfQuery" autocomplete="off" placeholder="例: ポラリス、旺文社">
      <div id="sfFacets"></div>
      <div class="sf-actions">
        <button type="button" class="sf-btn" id="sfReset">絞り込みを解除する</button>
      </div>
    </form>

    <section aria-labelledby="sfResultsHead">
      <div class="sf-head">
        <h2 id="sfResultsHead" class="sf-count">読み込んでいます…</h2>
        <label for="sfSort" class="visually-hidden">並べ替え</label>
        <select class="sf-sort" id="sfSort">
          <option value="diff">難易度順</option>
          <option value="name">書名順</option>
          <option value="year">刊行年が新しい順</option>
        </select>
      </div>
      <div class="sf-results" id="sfResults"></div>
      <div class="sf-more" id="sfMore"></div>
      <noscript>
        <p>この画面の絞り込みには JavaScript が要ります。科目ごとの一覧は JavaScript 無しでも読めます。${SUBJECTS.map(s => `<a href="/${s.dir}/books/">${esc(s.ja)}（${counts[s.dir]}）</a>`).join(' ／ ')}</p>
      </noscript>
    </section>
  </div>
</main>

${footer('', counts)}

${jsonLd(ld)}

<script src="/assets/js/search-core.js" defer></` + `script>
<script src="/assets/js/search-page.js" defer></` + `script>

</body>
</html>
`;
}

const counts = {};
let total = 0;
for (const s of SUBJECTS) {
  counts[s.dir] = loadSubjectData(ROOT, s.dir).books.length;
  total += counts[s.dir];
}

const dir = path.join(ROOT, 'search');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), render(counts, total));
console.log(`  ✓ /search/（noindex,follow）`);
