/**
 * 信頼性ページを生成する。
 *
 *   /about/       運営者について
 *   /methodology/ データの作り方（難易度・到達目安・学習時間の算出方法）
 *   /privacy/     プライバシーポリシー
 *   /disclaimer/  免責事項
 *   /ads/         広告について
 *   /changelog/   更新履歴（git のコミット履歴から自動集計）
 *
 * これまでこの内容は科目トップの JS モーダルにしか無く、クローラー・AdSense の
 * 審査・JS を切った環境からは存在しないのと同じだった。静的ページを正本にする。
 *
 * 本文は build/content/legal.mjs。数字（冊数・大学数）と広告表記の出し分けは
 * 実データと CONFIG から渡すので、本文側には書かない。
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, ORIGIN, X_HANDLE, esc, clip } from './lib/extract.mjs';
import { head, topBars, portalHeader, crumbs, footer, jsonLd, breadcrumbLd, GA_ID } from './lib/parts.mjs';
import { ADSENSE, adUnit } from './lib/ads.mjs';
import { degreeTable } from './lib/scale.mjs';
import { PAGES } from './content/legal.mjs';
import { fileDate } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** ポータル index.html の CONFIG から ID を読む（サイト全体の設定はここが正本） */
function portalConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const pick = k => (src.match(new RegExp(`\\b${k}:\\s*"([^"]*)"`)) || [, ''])[1];
  return { amazonTag: pick('amazonTag'), rakutenId: pick('rakutenId') };
}

/* ============================================================
   本文ブロックの描画
   ============================================================ */

/** **強調** と [表示名](URL) だけを解釈する。本文に生の HTML は書かない */
function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
      `<a href="${esc(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

function renderBlock(bl) {
  if (bl.p) return `      <p>${inline(bl.p)}</p>`;
  if (bl.h3) return `      <h3>${esc(bl.h3)}</h3>`;
  if (bl.ul) return `      <ul>\n${bl.ul.map(li => `        <li>${inline(li)}</li>`).join('\n')}\n      </ul>`;
  if (bl.scale) return `      ${degreeTable({ open: true })}`;
  if (bl.table) {
    return `      <div class="tbl-scroll"><div class="tbl-wrap">
        <table class="cmp">
          <thead><tr>${bl.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
${bl.table.rows.map(r => `            <tr>${r.map((c, i) => (i ? `<td>${inline(c)}</td>` : `<th scope="row">${inline(c)}</th>`)).join('')}</tr>`).join('\n')}
          </tbody>
        </table>
      </div></div>`;
  }
  throw new Error(`未知のブロック: ${JSON.stringify(bl).slice(0, 120)}`);
}

/* ============================================================
   更新履歴（git のコミット履歴から）
   ============================================================ */

/** データ・生成物に触ったコミットだけを拾う。docs/ や README だけの変更は載せない */
const CHANGELOG_PATHS = [
  'english', 'japanese', 'math', 'science', 'social', 'joho', 'shoron',
  'guides', 'build', 'assets', 'index.html', '404.html',
];

function changelogEntries(limit = 80) {
  let raw = '';
  try {
    raw = execFileSync('git', [
      'log', `-${limit}`, '--no-merges', '--date=short', '--format=%cs\t%s', '--', ...CHANGELOG_PATHS,
    ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  const byDate = new Map();
  for (const line of raw.split('\n')) {
    const [date, ...rest] = line.split('\t');
    const subject = rest.join('\t').trim();
    if (!date || !subject) continue;
    // 読者にとって意味のないコミットは落とす（自動コミット・作業中の保存）
    if (/（自動）$/.test(subject) || /^chore: 冊数の表記/.test(subject)) continue;
    const msg = subject.replace(/^(feat|fix|refactor|docs|test|chore|perf|ci)(\([^)]*\))?:\s*/, '');
    if (/^auto-save\b/i.test(msg) || /^wip\b/i.test(msg)) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    const arr = byDate.get(date);
    if (!arr.includes(msg)) arr.push(msg);
  }
  return [...byDate.entries()].map(([date, items]) => ({ date, items }));
}

/* ============================================================
   ページ 1 枚
   ============================================================ */

function render(page, ctx) {
  const base = `/${page.slug}/`;
  const url = `${ORIGIN}${base}`;
  const title = `${page.title} - ルート大全`;
  const desc = clip(page.desc, 120);
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: page.title, url: base, absUrl: url },
  ];
  const body = page.sections.map((s, i) => `    <section class="block prose" id="s${i + 1}">
      <h2 class="sec">${esc(s.h2)}</h2>
${s.body.map(renderBlock).join('\n')}
    </section>`).join('\n\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        dateModified: ctx.updated,
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        publisher: { '@id': `${ORIGIN}/#publisher` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>:root{--sc:#24427C}</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <article>
    <div class="art-head">
      <div class="eyebrow">${esc(page.nav)}</div>
      <h1 class="art-h1">${esc(page.title)}</h1>
      <p class="page-updated">最終更新: <time datetime="${ctx.updated}">${ctx.updated}</time></p>
      <p class="art-lead">${inline(page.lead)}</p>
    </div>

${body}

    <div class="note">
      <h3>そのほかの表記</h3>
      <p>${ctx.others.map(o => `<a href="/${o.slug}/">${esc(o.title)}</a>`).join(' ／ ')}</p>
    </div>${adUnit('bottom')}
  </article>
</main>

${footer('', ctx.counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

function renderChangelog(ctx) {
  const base = '/changelog/';
  const url = `${ORIGIN}${base}`;
  const title = '更新履歴 - ルート大全';
  const desc = 'ルート大全の参考書データ・ページの更新履歴です。git のコミット履歴から自動で作っています。';
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '更新履歴', url: base, absUrl: url },
  ];
  const entries = ctx.changelog;
  const list = entries.length
    ? entries.map(e => `      <div class="chg">
        <div class="chg__d"><time datetime="${e.date}">${e.date}</time></div>
        <ul class="chg__l">
${e.items.map(i => `          <li>${esc(i)}</li>`).join('\n')}
        </ul>
      </div>`).join('\n')
    : '      <p>更新履歴を取得できませんでした。</p>';

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        dateModified: entries[0]?.date || ctx.updated,
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#24427C}
.chg{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:14px 0;border-bottom:1px solid var(--line-2)}
.chg:last-child{border-bottom:none}
.chg__d{font-family:var(--mono);font-size:11.5px;color:var(--muted-2);letter-spacing:.04em;padding-top:2px}
.chg__l{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--ink-2);line-height:1.75}
@media(max-width:620px){.chg{grid-template-columns:1fr;gap:5px}}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <article>
    <div class="art-head">
      <div class="eyebrow">Changelog</div>
      <h1 class="art-h1">更新履歴</h1>
      <p class="page-updated">最終更新: <time datetime="${entries[0]?.date || ctx.updated}">${entries[0]?.date || ctx.updated}</time></p>
      <p class="art-lead">参考書データとページの更新履歴です。リポジトリのコミット履歴から自動で作っているので、手で書き足すことはありません。各ページの最終更新日は、そのページのデータが実際に変わった日を表示しています。</p>
    </div>

    <section class="block">
      <h2 class="sec">データとページの変更</h2>
${list}
    </section>

    <div class="note">
      <h3>そのほかの表記</h3>
      <p>${ctx.others.map(o => `<a href="/${o.slug}/">${esc(o.title)}</a>`).join(' ／ ')}</p>
    </div>${adUnit('bottom')}
  </article>
</main>

${footer('', ctx.counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   実行
   ============================================================ */
const counts = {};
let total = 0;
const uniNames = new Set();
for (const s of SUBJECTS) {
  const d = extractSubject(ROOT, s.dir);
  counts[s.dir] = d.books.length;
  total += d.books.length;
  d.unis.forEach(u => uniNames.add(u.n));
}

const cfg = portalConfig();
const ctxBase = {
  total, unis: uniNames.size, subjects: counts,
  affAz: Boolean(cfg.amazonTag), affRk: Boolean(cfg.rakutenId), adsense: ADSENSE,
  ga: GA_ID, xHandle: X_HANDLE,
  // Amazon アソシエイトの登録名がリポジトリから分からないので、サイト名を使う
  amazonName: 'ルート大全',
};

const pages = PAGES(ctxBase);
const nav = [...pages.map(p => ({ slug: p.slug, title: p.nav })), { slug: 'changelog', title: '更新履歴' }];
const changelog = changelogEntries();
const updated = fileDate('build/content/legal.mjs');

for (const p of pages) {
  const dir = path.join(ROOT, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(p, {
    counts, updated, changelog,
    others: nav.filter(n => n.slug !== p.slug),
  }));
  console.log(`  ✓ /${p.slug}/`);
}

const cdir = path.join(ROOT, 'changelog');
fs.mkdirSync(cdir, { recursive: true });
fs.writeFileSync(path.join(cdir, 'index.html'), renderChangelog({
  counts, updated, changelog, others: nav.filter(n => n.slug !== 'changelog'),
}));
console.log('  ✓ /changelog/');
console.log(`信頼性ページ ${pages.length + 1} 件を生成した`);
