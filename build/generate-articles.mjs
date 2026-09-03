/**
 * 解説記事（比較・選び方）を生成する。
 *
 *   科目つき記事 : /<科目>/guides/<slug>/
 *   科目なし記事 : /guides/<slug>/
 *
 * 本文は build/content/articles.mjs にブロックの配列として持つ。
 * 難易度や問題数といった数値は BOOKS から引くので、記事側には書かない。
 * 記事本文と参考書データが食い違うのを構造的に防ぐための決まりごと。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { head, topBars, header, portalHeader, crumbs, footer, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { bookCards } from './lib/cards.mjs';
import { ARTICLES } from './content/articles.mjs';
import { adUnit } from './lib/ads.mjs';
import { fileDate } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = extractSubject(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

/** 記事から参照する書籍を引く。見つからなければビルドを止める（リンク切れを出さない） */
function lookup(dir, id, ctxLabel) {
  const b = data[dir]?.books.find(x => x.id === id);
  if (!b) throw new Error(`${ctxLabel}: ${dir} に書籍 id "${id}" がない`);
  return b;
}

function bookLink(dir, id, label) {
  const b = lookup(dir, id, 'bookLink');
  return `<a href="/${dir}/books/${b.id}/">${esc(label || b.name)}</a>`;
}

/** 本文中の [[id]] / [[id|表示名]] を書籍ページへのリンクに変換する */
function inline(text, dir) {
  return esc(text)
    .replace(/\[\[([a-z0-9_-]+)(?:\|([^\]]+))?\]\]/gi, (_, id, label) => bookLink(dir, id, label))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

function renderBlock(bl, dir) {
  if (bl.p) return `      <p>${inline(bl.p, dir)}</p>`;
  if (bl.h3) return `      <h3>${esc(bl.h3)}</h3>`;
  if (bl.ul) return `      <ul>\n${bl.ul.map(li => `        <li>${inline(li, dir)}</li>`).join('\n')}\n      </ul>`;
  if (bl.note) return `      <div class="note" style="margin:22px 0">${bl.noteTitle ? `<h3>${esc(bl.noteTitle)}</h3>` : ''}<p>${inline(bl.note, dir)}</p></div>`;

  // 書籍の比較表。数値は BOOKS から引くので記事側に転記しない
  if (bl.bookTable) {
    const books = bl.bookTable.map(id => lookup(bl.dir || dir, id, 'bookTable'));
    const d = bl.dir || dir;
    const cols = bl.columns || ['難易度', '到達目安', '問題数', '想定時間', '向いている人'];
    const cell = (b, c) => ({
      '難易度': `${b.diff} / 10`,
      '到達目安': b.hensachi || '—',
      '問題数': b.problems || '—',
      '想定時間': b.hours || '—',
      '向いている人': b.bestFor || '—',
      '出版社': b.pub || '—',
      '形式': b.style || '—',
    })[c] ?? '—';
    return `      <div class="tbl-scroll">
        <div class="tbl-scroll__hint">横にスクロールできます</div>
        <div class="tbl-wrap">
        <table class="cmp">
          <thead><tr><th>参考書</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
${books.map(b => `            <tr><th scope="row">${bookLink(d, b.id)}</th>${cols.map(c => `<td>${esc(cell(b, c))}</td>`).join('')}</tr>`).join('\n')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  // 書籍カード
  if (bl.books) {
    const d = bl.dir || dir;
    const sub = SUBJECTS.find(s => s.dir === d);
    const list = bl.books.map(id => lookup(d, id, 'books'));
    return bookCards(list, sub, data[d].stages, 'margin:20px 0');
  }
  throw new Error(`未知のブロック: ${JSON.stringify(bl).slice(0, 100)}`);
}

function render(a) {
  // 記事本文は build/content/articles.mjs にまとめてある。手で日付を書かず、git の最終コミット日を使う
  const updated = fileDate('build/content/articles.mjs');
  const sub = a.subject ? SUBJECTS.find(s => s.dir === a.subject) : null;
  const base = sub ? `/${sub.dir}/guides/${a.slug}/` : `/guides/${a.slug}/`;
  const url = `${ORIGIN}${base}`;
  const color = sub ? sub.color : '#24427C';

  const crumbItems = [{ name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` }];
  if (sub) crumbItems.push({ name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` });
  crumbItems.push({ name: '解説記事', url: sub ? `/${sub.dir}/guides/` : '/guides/', absUrl: `${ORIGIN}${sub ? `/${sub.dir}` : ''}/guides/` });
  crumbItems.push({ name: a.h1 || a.title, url: base, absUrl: url });

  const toc = a.sections.map((s, i) => `        <li><a href="#s${i + 1}">${esc(s.h2)}</a></li>`).join('\n');

  const body = a.sections.map((s, i) => `    <section class="block prose" id="s${i + 1}">
      <h2 class="sec">${esc(s.h2)}</h2>
${s.body.map(bl => renderBlock(bl, a.subject)).join('\n')}
    </section>`).join('\n\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: a.h1 || a.title,
        description: a.desc,
        inLanguage: 'ja',
        datePublished: a.published,
        dateModified: updated,
        author: { '@type': 'Organization', name: 'ルート大全 編集部', url: `${ORIGIN}/` },
        publisher: { '@type': 'Organization', name: 'ルート大全 編集部', url: `${ORIGIN}/` },
        mainEntityOfPage: url,
        ...(sub ? { about: { '@type': 'Thing', name: `大学受験 ${sub.ja}の参考書選び` } } : {}),
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: a.title, description: a.desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title: a.title, desc: clip(a.desc, 120), url, ogImage: `${ORIGIN}/assets/ogp${sub ? `-${sub.dir}` : ''}.png` })}
<style>
:root{--sc:${color}}
.art-head{padding:26px 0 0}
.art-h1{font-family:var(--serif);font-weight:800;font-size:28px;line-height:1.4;letter-spacing:.02em;margin-top:12px}
@media(min-width:760px){.art-h1{font-size:36px}}
.art-meta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:16px;font-family:var(--mono);font-size:11px;color:var(--muted-2);letter-spacing:.06em}
.art-lead{font-size:15px;color:var(--ink-2);line-height:2;margin-top:20px;max-width:68ch}
.toc{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--sc);padding:19px 22px;margin-top:26px;box-shadow:var(--sh-s)}
.toc h2{font-family:var(--serif);font-weight:800;font-size:14px;letter-spacing:.05em;margin-bottom:11px}
.toc ol{list-style:none;counter-reset:t;display:flex;flex-direction:column;gap:2px}
.toc li{counter-increment:t;font-size:13px;line-height:1.6;display:flex;gap:10px;align-items:center}
.toc li::before{content:counter(t,decimal-leading-zero);font-family:var(--mono);font-size:10.5px;color:var(--muted-2);font-weight:600}
/* タップ領域を 24px 以上にする（WCAG のターゲットサイズ）。
   gap を詰めたぶんを min-height で取り、行の見た目は変えない。 */
.toc a{color:var(--ink-2);font-weight:700;transition:.15s;display:inline-flex;align-items:center;min-height:26px}
.toc a:hover{color:var(--accent-deep)}
/* 表は幅を超えたら中だけ横スクロールさせる。画面が狭いと「切れている」と
   誤解されやすいので、スクロールできることを画面幅で出し分けて明示する。 */
.tbl-scroll{margin:22px 0}
.tbl-scroll__hint{display:none;font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--muted-2);margin-bottom:7px;align-items:center;gap:7px}
.tbl-scroll__hint::before{content:"";width:14px;height:1.5px;background:var(--line-d)}
@media(max-width:860px){.tbl-scroll__hint{display:flex}}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);box-shadow:var(--sh-s);background:var(--surface);-webkit-overflow-scrolling:touch}
table.cmp{border-collapse:collapse;width:100%;min-width:640px;font-size:12.5px}
table.cmp th,table.cmp td{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line-2);vertical-align:top;line-height:1.65}
table.cmp thead th{background:var(--surface-2);font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.04em;white-space:nowrap;border-bottom:1px solid var(--line)}
table.cmp tbody th{font-weight:700;color:var(--ink);white-space:nowrap}
table.cmp tbody th a{color:var(--indigo);text-decoration:underline;text-underline-offset:2px}
table.cmp tbody tr:last-child th,table.cmp tbody tr:last-child td{border-bottom:none}
table.cmp td{color:var(--ink-2)}
</style>
</head>
<body>

${topBars(a.subject || '')}

${sub ? header(sub) : portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <article>
    <div class="art-head">
      <div class="eyebrow">${esc(a.eyebrow || 'Guide')}</div>
      <h1 class="art-h1">${esc(a.h1 || a.title)}</h1>
      <div class="art-meta">
        <span>公開 ${esc(a.published)}</span>
        ${updated !== a.published ? `<span>更新 <time datetime="${updated}">${updated}</time></span>` : ''}
        <span>ルート大全 編集部</span>
      </div>
      <p class="art-lead">${inline(a.lead, a.subject)}</p>
    </div>

    <nav class="toc" aria-label="目次">
      <h2>この記事の内容</h2>
      <ol>
${toc}
      </ol>
    </nav>${adUnit('inArticle')}

${body}

    <div class="cta">
      <h2>${esc(a.ctaTitle || '自分のルートに落とし込む')}</h2>
      <p>${esc(a.ctaText || '記事で挙げた本が、自分の志望校までの並びの中でどこに入るかは、ルート画面で確認できます。志望校と今の学力を選ぶだけです。')}</p>
      <div class="cta__btns">
        <a class="p" href="${sub ? `/${sub.dir}/` : '/#subjects'}">${esc(sub ? `${sub.ja}のルートを作る` : '科目を選んで始める')}<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <a class="g" href="${sub ? `/${sub.dir}/books/` : '/#catalog'}">参考書一覧を見る</a>
      </div>
    </div>${adUnit('bottom')}
  </article>
</main>

${footer(a.subject || '', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/** 記事の一覧ページ */
function renderIndex(dir, list) {
  const sub = dir ? SUBJECTS.find(s => s.dir === dir) : null;
  const base = sub ? `/${sub.dir}/guides/` : '/guides/';
  const url = `${ORIGIN}${base}`;
  const title = sub
    ? `${sub.ja}の参考書の選び方・比較記事一覧 - ${sub.full}`
    : '参考書の選び方・比較記事一覧 - ルート大全';
  const desc = sub
    ? clip(`大学受験${sub.ja}の参考書について、似た本の違いと選び分けを解説した記事の一覧（${list.length} 本）。`, 120)
    : clip(`大学受験の参考書選びについて、科目をまたいで役立つ考え方をまとめた記事の一覧（${list.length} 本）。`, 120);

  const crumbItems = [{ name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` }];
  if (sub) crumbItems.push({ name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` });
  crumbItems.push({ name: '解説記事', url: base, absUrl: url });

  const cards = list.map(a => `      <a class="gcard" href="${sub ? `/${sub.dir}` : ''}/guides/${a.slug}/">
        <div class="gcard__no">${esc(a.eyebrow || 'Guide')}</div>
        <b>${esc(a.h1 || a.title)}</b>
        <p>${esc(clip(a.lead.replace(/\[\[([a-z0-9_-]+)(?:\|([^\]]+))?\]\]/gi, (_, i, l) => l || ''), 96))}</p>
        <span class="gcard__foot">${esc(a.published)}</span>
      </a>`).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'CollectionPage', '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp${sub ? `-${sub.dir}` : ''}.png` })}
<style>
:root{--sc:${sub ? sub.color : '#24427C'}}
.ggrid{display:grid;grid-template-columns:1fr;gap:11px;margin-top:22px}
@media(min-width:700px){.ggrid{grid-template-columns:repeat(2,1fr)}}
.gcard{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--sc);padding:18px 19px 16px;box-shadow:var(--sh-s);transition:.16s;display:flex;flex-direction:column}
.gcard:hover{transform:translateY(-3px);box-shadow:var(--sh-m);border-color:var(--line-d);border-top-color:var(--sc)}
.gcard__no{font-family:var(--mono);font-size:10px;color:var(--accent);letter-spacing:.14em;text-transform:uppercase;margin-bottom:9px}
.gcard b{font-family:var(--serif);font-weight:800;font-size:16.5px;letter-spacing:.02em;line-height:1.45;color:var(--ink)}
.gcard p{font-size:12.5px;color:var(--muted);margin-top:9px;line-height:1.8;flex:1}
.gcard__foot{font-family:var(--mono);font-size:10px;color:var(--muted-2);margin-top:13px;padding-top:10px;border-top:1px dashed var(--line);letter-spacing:.06em}
</style>
</head>
<body>

${topBars(dir || '')}

${sub ? header(sub) : portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Guides</div>
    <h1 class="sec" style="font-size:29px">${sub ? `${esc(sub.ja)}の参考書の選び方` : '参考書選びの考え方'}</h1>
    <p class="sec-lead">${sub
      ? `${esc(sub.ja)}でよく比較される参考書について、何が違うのか・どちらを選ぶべきかを整理した記事です。難易度や問題数は${esc(sub.full)}に収録しているデータをそのまま参照しています。`
      : '科目をまたいで共通する、参考書の選び方・使い方の考え方をまとめた記事です。'}</p>
    <div class="ggrid">
${cards}
    </div>
  </div>${adUnit('bottom', '  ')}
</main>

${footer(dir || '', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   実行
   ============================================================ */
const bySubject = new Map();
for (const a of ARTICLES) {
  const key = a.subject || '';
  if (!bySubject.has(key)) bySubject.set(key, []);
  bySubject.get(key).push(a);
}

let n = 0;
for (const a of ARTICLES) {
  const dir = a.subject
    ? path.join(ROOT, a.subject, 'guides', a.slug)
    : path.join(ROOT, 'guides', a.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(a));
  n++;
}
for (const [key, list] of bySubject) {
  const dir = key ? path.join(ROOT, key, 'guides') : path.join(ROOT, 'guides');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), renderIndex(key, list));
  n++;
  console.log(`  ✓ ${key || '(全科目)'}: 記事 ${list.length} 本 + 一覧`);
}
console.log(`合計 ${n} ページを生成した。`);
