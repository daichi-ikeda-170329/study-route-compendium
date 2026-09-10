/**
 * 2 冊比較のページ `/compare/` を作る（仕様書 4.2）。
 *
 *   node build/generate-compare.mjs
 *
 * URL は `/compare/?a=<科目>:<id>&b=<科目>:<id>`。表は assets/js/compare.js が
 * 科目トップと同じ配信データ（assets/generated/subjects/<科目>.{core,books}.json）から描く。
 * 取得先はこのページに**インラインで埋める**（科目トップの RT_SUBJECT_ASSETS と同じ理由。
 * 別の manifest を fetch すると、manifest だけ古くキャッシュされたときに壊れる）。
 *
 * ## noindex にする理由
 *
 * 2 冊の組み合わせは無数にあり、index させると中身の薄いページを大量に作ることになる。
 * `/search/` と同じく**サイトの中で使う道具**なので `noindex,follow`（sitemap にも載らない）。
 * 公開経路: build/all.mjs の STEPS / build/build-public.mjs の ALLOW_DIRS（'compare'）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, ORIGIN } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, portalHeader, footer, crumbs, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { ASSET_DIR, contentHash } from './lib/subject-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 科目ごとの取得先。?v= は内容ハッシュ（科目トップのマニフェストと同じ値になる） */
function manifest() {
  const subjects = {};
  for (const s of SUBJECTS) {
    const files = {};
    for (const kind of ['core', 'books']) {
      const rel = `${ASSET_DIR}/${s.dir}.${kind}.json`;
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      files[kind] = `/${rel}?v=${contentHash(text)}`;
    }
    subjects[s.dir] = { ja: s.ja, full: s.full, color: s.color, ...files };
  }
  return { v: 1, subjects };
}

function render(counts) {
  const url = `${ORIGIN}/compare/`;
  const title = '参考書を 2 冊並べて比べる - ルート大全';
  const desc = '収録している参考書から 2 冊を選び、難易度・到達目安・問題数・想定学習時間・向いている人・強みと注意点を横に並べて比べられます。';
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '2 冊を比べる', url: '/compare/', absUrl: url },
  ];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` }, breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, noindex: true, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#24427C}
.cmp-lead{font-size:13.5px;color:var(--ink-2);line-height:1.9;margin-top:10px;max-width:46em}
.cmp-wrap{overflow-x:auto;margin-top:20px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--sh-s)}
table.cmpx{border-collapse:collapse;width:100%;min-width:620px;font-size:13px}
table.cmpx th,table.cmpx td{padding:12px 14px;border-bottom:1px solid var(--line-2);text-align:left;vertical-align:top;line-height:1.75}
table.cmpx thead th{background:var(--surface-2);font-size:13.5px}
table.cmpx tbody th{width:8.5em;font-size:11.5px;color:var(--muted);font-weight:700;white-space:nowrap}
table.cmpx td{width:calc(50% - 4.25em);color:var(--ink-2)}
table.cmpx tr:last-child th,table.cmpx tr:last-child td{border-bottom:none}
.cmpx__name a{font-family:var(--serif);font-weight:800;font-size:15.5px;color:var(--ink);text-decoration:underline;text-decoration-color:var(--line-d);text-underline-offset:3px}
.cmpx__sub{display:block;font-size:11px;color:var(--muted);margin-top:3px}
.cmpx__cov{width:84px;aspect-ratio:.71;background:var(--surface-2);border:1px solid var(--line);display:block;overflow:hidden}
.cmpx__cov img{width:100%;height:100%;object-fit:cover;display:block}
.cmpx__bar{display:inline-flex;gap:2px;vertical-align:middle;margin-right:8px}
.cmpx__bar i{width:9px;height:12px;background:var(--line);display:block}
.cmpx__bar i.on{background:var(--sc)}
table.cmpx ul{list-style:none;display:flex;flex-direction:column;gap:4px}
table.cmpx li{padding-left:13px;position:relative}
table.cmpx li::before{content:"";position:absolute;left:0;top:10px;width:5px;height:5px;border-radius:50%;background:var(--muted-2)}
.cmpx__buy{display:flex;flex-wrap:wrap;gap:8px}
.cmpx__buy a{font-size:12px;font-weight:700;padding:8px 12px;border:1px solid var(--line-d);background:var(--surface);color:var(--ink)}
.cmp-pick{display:grid;grid-template-columns:1fr;gap:14px;margin-top:20px}
@media(min-width:760px){.cmp-pick{grid-template-columns:1fr 1fr}}
.cmp-slot{background:var(--surface);border:1px solid var(--line);padding:16px 18px;box-shadow:var(--sh-s)}
.cmp-slot h2{font-size:14px;font-weight:800}
.cmp-slot input{width:100%;min-height:44px;margin-top:10px;padding:10px 12px;border:1px solid var(--line-d);border-radius:6px;font:inherit;background:var(--surface);color:inherit}
.cmp-slot__cur{font-size:13px;margin-top:8px;color:var(--ink-2);min-height:1.7em}
.cmp-slot__hits{display:flex;flex-direction:column;gap:2px;margin-top:8px}
.cmp-slot__hits button{min-height:44px;text-align:left;padding:8px 10px;border:1px solid var(--line-2);background:var(--surface-2);font:inherit;font-size:13px;cursor:pointer;color:inherit}
.cmp-slot__hits button:hover{border-color:var(--line-d)}
.cmp-go{margin-top:16px;min-height:44px;padding:10px 18px;border:1px solid var(--ink);background:var(--ink);color:#fff;font:inherit;font-weight:700;cursor:pointer}
.cmp-go[disabled]{opacity:.4;cursor:not-allowed}
.cmp-msg{margin-top:14px;font-size:13px;color:var(--accent-deep)}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Compare</div>
    <h1 class="sec" style="font-size:29px">参考書を 2 冊並べて比べる</h1>
    <p class="cmp-lead">難易度・到達目安・想定学習時間は編集部の推定値です（<a href="/methodology/">算出方法</a>）。書名・出版社・刊行年・問題数は公開されている書誌情報です。</p>
    <div id="cmpRoot" aria-live="polite">
      <noscript><p class="cmp-msg">比べる表の表示には JavaScript が要ります。各参考書の詳細ページは<a href="/search/">詳細検索</a>から開けます。</p></noscript>
    </div>
  </div>
</main>

${footer('', counts)}

${jsonLd(ld)}

<script>/* 取得先。build/generate-compare.mjs が書く。手で編集しない */window.RT_COMPARE_ASSETS=${JSON.stringify(manifest())};</` + `script>
<script src="/assets/js/cover-policies.js" defer></` + `script>
<script src="/assets/js/cover-resolver.js" defer></` + `script>
<script src="/assets/js/compare.js" defer></` + `script>

</body>
</html>
`;
}

const counts = {};
for (const s of SUBJECTS) counts[s.dir] = loadSubjectData(ROOT, s.dir).books.length;
const dir = path.join(ROOT, 'compare');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), render(counts));
console.log('  ✓ /compare/（noindex,follow）');
