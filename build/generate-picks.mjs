/**
 * 科目ごとの「おすすめ」ページ（/<科目>/osusume/）を生成する。
 *
 * 一覧ページ（/<科目>/books/）が収録全冊の索引なのに対し、こちらは
 * ROUTES で実際に本線として選んだ本だけを、採用回数の多い順に並べたもの。
 * 「おすすめ」の根拠は編集上の主観ではなく、志望校ルートに何回組み込んだかに置く。
 * 採用が 0 回の本はここに出さない。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, SUB_LABELS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { head, topBars, header, crumbs, footer, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { searchName } from './lib/booktitle.mjs';
import { tally } from './lib/tally.mjs';
import { coverBox } from './lib/cover.mjs';
import { adUnit } from './lib/ads.mjs';
import { byDifficultyAsc } from './lib/rank.mjs';
import { fileDate, saveDates } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function card(b, sub, stages, t, rank) {
  const st = stages[b.stage] || {};
  const n = t.main.get(b.id) || 0;
  const tiers = [...(t.where.get(b.id) || [])];
  const role = [...(t.roles.get(b.id) || [])].join('・');
  const bars = Array.from({ length: 10 }, (_, i) => `<i class="${i < b.diff ? 'on' : ''}"></i>`).join('');
  return `      <a class="pcard" href="/${sub.dir}/books/${b.id}/" style="--bc:${st.color || sub.color}">
        <span class="pcard__rank">${rank}</span>
        <span class="pcard__cov">${coverBox(b, { color: st.color || sub.color })}</span>
        <div class="pcard__body">
          <div class="pcard__top"><span class="pcard__stage">${esc(st.short || '')}</span><span>${esc(b.pub)}</span></div>
          <b>${esc(searchName(b, sub.dir))}</b>
          <p>${esc(clip(b.desc, 82))}</p>
          <div class="pcard__meta">
            <span class="pcard__adopt">ルート採用 ${n} 回</span>
            ${role ? `<span>役割：${esc(role)}</span>` : ''}
            <span class="pcard__diff">${bars}</span>
            <span>難易度 ${b.diff}／${esc(b.hensachi || '—')}</span>
          </div>
          ${tiers.length ? `<div class="pcard__tiers">${tiers.map(x => `<i>${esc(x)}</i>`).join('')}</div>` : ''}
        </div>
      </a>`;
}

function render(sub, d, counts) {
  const updated = fileDate(`${sub.dir}/index.html`);
  const url = `${ORIGIN}/${sub.dir}/osusume/`;
  const t = tally(d.routes, d.tiers);

  // 本線に 1 回でも採用した本だけを、採用回数の多い順・同数なら易しい順に並べる
  const picked = d.books
    .filter(b => (t.main.get(b.id) || 0) > 0)
    .sort((a, b) => (t.main.get(b.id) - t.main.get(a.id)) || byDifficultyAsc(a, b));
  const n = picked.length;
  const stageKeys = Object.keys(d.stages).filter(k => picked.some(b => b.stage === k));

  const title = `${sub.ja}の参考書おすすめ${n}冊｜志望校ルートで実際に選んだ定番 - ${sub.full}`;
  const desc = clip(
    `${sub.ja}の参考書${d.books.length}冊のうち、志望校別ルートで実際に本線として組み込んだ${n}冊。`
    + `採用回数の多い順に並べ、役割・難易度・使う志望レベルを添えています。`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` },
    { name: 'おすすめ', url, absUrl: url },
  ];

  const sections = stageKeys.map(key => {
    const st = d.stages[key];
    const list = picked.filter(b => b.stage === key);
    return `    <section class="block" id="stage-${key}">
      <div class="eyebrow" style="color:${st.color}">${esc(st.short)}</div>
      <h2 class="sec">${esc(st.label)}のおすすめ<span class="cnt">${list.length}冊</span></h2>
      <div class="pcards">
${list.map((b, i) => card(b, sub, d.stages, t, i + 1)).join('\n')}
      </div>
    </section>`;
  }).join('\n\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'CollectionPage',
        dateModified: updated,
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'ItemList',
        name: `${sub.ja}の参考書おすすめ${n}冊`,
        numberOfItems: n,
        itemListElement: picked.map((b, i) => ({
          '@type': 'ListItem', position: i + 1, name: searchName(b, sub.dir),
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
.pcards{display:grid;gap:10px;margin-top:16px}
.pcard{display:flex;gap:14px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--bc);padding:14px 16px;transition:.15s;box-shadow:var(--sh-s)}
.pcard:hover{transform:translateY(-2px);box-shadow:var(--sh-m)}
.pcard__rank{font-family:var(--mono);font-size:15px;font-weight:700;color:var(--bc);min-width:26px;padding-top:2px}
.pcard__cov{flex:none;display:block;--cw:58px}
.pcard__body{flex:1;min-width:0}
.pcard__top{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--muted);font-weight:600}
.pcard__stage{color:var(--bc)}
.pcard b{display:block;font-family:var(--serif);font-size:16px;font-weight:800;margin:5px 0 4px;color:var(--ink);line-height:1.45}
.pcard p{font-size:12.5px;color:var(--ink-2);line-height:1.7;margin:0}
.pcard__meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:9px;font-size:11.5px;color:var(--muted);font-weight:600}
.pcard__adopt{background:var(--bc);color:#fff;padding:2px 8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.04em}
.pcard__diff{display:inline-flex;gap:2px}
.pcard__diff i{width:6px;height:6px;background:var(--line-2);border-radius:50%}
.pcard__diff i.on{background:var(--bc)}
.pcard__tiers{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.pcard__tiers i{font-style:normal;font-size:10.5px;color:var(--muted-2);border:1px solid var(--line);padding:2px 7px}
@media(max-width:520px){.pcard{padding:12px 13px;gap:10px}.pcard b{font-size:15px}.pcard__cov{--cw:48px}}
</style>
</head>
<body>

${topBars(sub.dir)}

${header(sub)}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Recommended</div>
    <h1 class="sec" style="font-size:29px">${esc(sub.ja)}の参考書おすすめ　${n}冊</h1>
    <p class="sec-lead">収録している${esc(sub.ja)}の参考書${d.books.length}冊のうち、${d.tiers.length}段階の志望校ルートで実際に本線として組み込んだのがこの${n}冊です。並び順は採用回数の多い順で、多くの志望校で共通して通る定番ほど上に来ます。「誰かの主観で選んだ順位」ではなく「ルートを組んだ結果として何回必要になったか」で並べています。</p>
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
    <p class="sec-lead">残りの${d.books.length - n}冊が悪い本というわけではありません。特定の志望校・特定の弱点に効く本や、上の本が合わなかったときの代替として、各ページで挙げています。全冊を見るなら<a href="/${sub.dir}/books/">${esc(sub.ja)}の参考書一覧</a>へ。</p>
  </div>

${sections}

  <div class="cta">
    <h2>おすすめを並べるより、順番を決めるほうが速い</h2>
    <p>どれが良い本かより、どの順で何冊やるかで結果が変わります。志望校と今の学力を入れると、この中を通る道だけが残ります。</p>
    <div class="cta__btns">
      <a class="p" href="/${sub.dir}/">${esc(sub.ja)}のルートを作る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/${sub.dir}/books/">全${d.books.length}冊の一覧</a>
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
  data[s.dir] = extractSubject(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

let total = 0;
for (const sub of SUBJECTS) {
  // おすすめはルートの採用回数で並べるページ。ルートが無い科目には作れない
  if (sub.catalogOnly) { console.log(`  – ${sub.dir}: ルートを持たない科目のため生成しない`); continue; }
  const outDir = path.join(ROOT, sub.dir, 'osusume');
  fs.mkdirSync(outDir, { recursive: true });
  const html = render(sub, data[sub.dir], counts);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  const n = (html.match(/class="pcard"/g) || []).length;
  console.log(`  ✓ ${sub.dir}/osusume/index.html  (${n}冊)`);
  total++;
}
console.log(`合計 ${total} ページを生成した。`);

/* 更新日の台帳を書き戻す。書き戻さないと次の実行で前回の日付を思い出せず、
   実際には変えていない日を「更新日」として出してしまう */
saveDates();
