/**
 * 志望校レベル別の参考書ルートページ（/<科目>/routes/<tier>/）を生成する。
 *
 * ROUTES の形は 5 科目で共通で ROUTES[tier][トラック][policy]。トラックだけが科目で違う。
 *   math / english : bun / ri
 *   japanese       : gendai / kobun / kanbun
 *   science        : butsuri / kagaku / seibutsu / chigaku
 *   social         : nihonshi / sekaishi / …
 * さらに para（並行して進める本）と final（最終仕上げ）が tier 直下にぶら下がる。
 * トラックとして扱わないキーは NON_TRACK に並べてある。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, SUB_LABELS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { head, topBars, header, crumbs, footer, jsonLd, breadcrumbLd, shareBar } from './lib/parts.mjs';
import { coverBox } from './lib/cover.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** トラックキーの表示名。分野コードは SUB_LABELS と共通 */
const TRACK_LABELS = { bun: '文系', ri: '理系', ...SUB_LABELS };
const POLICIES = [
  { key: 'omni',  label: '王道網羅型',   note: '時間に余裕があり、抜けを作らずに積み上げたい場合の並び。網羅系を軸に据えます。' },
  { key: 'quick', label: '時短・精選型', note: '残り時間が少ない、または他科目に時間を回したい場合の並び。冊数を絞って要点だけ通します。' },
];
/* トラックの名前として現れるが、ルートの並びそのものではないキー。
   basic は理科基礎（文系・共テのみ）のルートで、科目トップだけで使う */
const NON_TRACK = new Set(['para', 'final', 'basic']);
/** トラックの表示順。ROUTES のキー順は科目によってばらつくのでここで固定する */
const TRACK_ORDER = [
  'bun', 'ri',
  'gendai', 'kobun', 'koten', 'kanbun',
  'butsuri', 'kagaku', 'seibutsu', 'chigaku',
  'nihonshi', 'sekaishi', 'chiri', 'kokyo', 'seikei', 'rinri',
  'sogo',
];
const trackRank = (k) => {
  const i = TRACK_ORDER.indexOf(k);
  return i < 0 ? TRACK_ORDER.length : i;
};

/**
 * ROUTES を { [tier]: { tracks: {track: {omni, quick}}, para: {track: []}, final: {track: []} } } に揃える。
 *
 * para / final は「トラック→配列」の辞書のことも、配列そのもののこともある。
 * 配列のときは全トラック共通なので '*' に置き、描画側がトラック名で引けなければ '*' に落ちる。
 */
function normalize(routes, tiers) {
  const tierIds = new Set(tiers.map(t => t.id));
  const out = {};

  for (const tier of Object.keys(routes)) {
    if (!tierIds.has(tier)) continue;
    const node = routes[tier] || {};
    out[tier] = { tracks: {}, para: {}, final: {} };
    for (const key of Object.keys(node)) {
      if (NON_TRACK.has(key) || !node[key]) continue;
      out[tier].tracks[key] = node[key];
    }
    for (const kind of ['para', 'final']) {
      const v = node[kind];
      if (!v) continue;
      if (Array.isArray(v)) out[tier][kind]['*'] = v;
      else for (const k of Object.keys(v)) if (Array.isArray(v[k])) out[tier][kind][k] = v[k];
    }
  }
  return out;
}

const trackLabel = (k) => TRACK_LABELS[k] || k;

function stepList(steps, bookById, sub, stages) {
  return steps.map((s, i) => {
    const b = bookById.get(s.id);
    if (!b) return '';
    const st = stages[b.stage] || {};
    const alts = (s.alts || []).map(id => bookById.get(id)).filter(Boolean);
    return `        <li class="rstep">
          <span class="rstep__no">${String(i + 1).padStart(2, '0')}</span>
          <a class="rstep__cov" href="/${sub.dir}/books/${b.id}/" tabindex="-1" aria-hidden="true">${coverBox(b, { color: st.color || sub.color })}</a>
          <div class="rstep__body">
            <span class="rstep__role">${esc(s.role || '')}</span>
            <a class="rstep__name" href="/${sub.dir}/books/${b.id}/">${esc(b.name)}</a>
            <span class="rstep__meta">${esc(b.pub)}／難易度 ${b.diff}／${esc(b.hensachi || '')}</span>
            ${s.note ? `<p class="rstep__note">${esc(s.note)}</p>` : ''}
            ${alts.length ? `<p class="rstep__alts">代わりに使える本：${alts.map(a => `<a href="/${sub.dir}/books/${a.id}/">${esc(a.name)}</a>`).join('、')}</p>` : ''}
          </div>
        </li>`;
  }).filter(Boolean).join('\n');
}

function sideList(steps, bookById, sub, stages) {
  return steps.map(s => {
    const b = bookById.get(s.id);
    if (!b) return '';
    const st = stages[b.stage] || {};
    return `          <li>
            <a class="rside__cov" href="/${sub.dir}/books/${b.id}/" tabindex="-1" aria-hidden="true">${coverBox(b, { color: st.color || sub.color })}</a>
            <div><a class="rside__name" href="/${sub.dir}/books/${b.id}/">${esc(b.name)}</a>${s.note ? `<span>${esc(s.note)}</span>` : ''}</div>
          </li>`;
  }).filter(Boolean).join('\n');
}

function render(sub, d, tier, norm, counts) {
  const bookById = new Map(d.books.map(b => [b.id, b]));
  const url = `${ORIGIN}/${sub.dir}/routes/${tier.id}/`;
  const node = norm[tier.id];
  const trackKeys = Object.keys(node.tracks).sort((a, b) => trackRank(a) - trackRank(b));
  const unis = d.unis.filter(u => u.t === tier.id);

  // 収録冊数（重複を除いた実数）
  const used = new Set();
  for (const tk of trackKeys) for (const p of POLICIES) (node.tracks[tk][p.key] || []).forEach(s => used.add(s.id));
  for (const kind of ['para', 'final']) for (const k of Object.keys(node[kind])) node[kind][k].forEach(s => used.add(s.id));

  const title = `${tier.name}の${sub.ja}参考書ルート｜${tier.sub} - ${sub.full}`;
  const desc = clip(`${tier.name}（${tier.sub}）を目指す人向けの${sub.ja}参考書ルート。` +
    `目標は${tier.goal}、${tier.hensachi}。導入から過去問まで、何をどの順で進めるかを${used.size}冊の中から並べています。` +
    `${trackKeys.map(trackLabel).join('・')}別、王道網羅型と時短・精選型の2通り。2026年 新課程対応。`, 158);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` },
    { name: '志望校別ルート', url: `/${sub.dir}/routes/`, absUrl: `${ORIGIN}/${sub.dir}/routes/` },
    { name: tier.name, url, absUrl: url },
  ];

  const sections = trackKeys.map(tk => {
    const label = trackLabel(tk);
    const seq = node.tracks[tk];
    const bodies = POLICIES.filter(p => (seq[p.key] || []).length).map(p => `      <div class="rpol">
        <h3 class="rpol__t"><b>${p.label}</b><span>${(seq[p.key] || []).length}冊</span></h3>
        <p class="rpol__n">${p.note}</p>
        <ol class="rsteps">
${stepList(seq[p.key], bookById, sub, d.stages)}
        </ol>
      </div>`).join('\n');

    const para = node.para[tk] || node.para['*'] || [];
    const final = node.final[tk] || node.final['*'] || [];

    return `    <section class="block" id="track-${tk}">
      <div class="eyebrow">${esc(label)}</div>
      <h2 class="sec">${esc(label)}のルート</h2>
      <div class="rpols">
${bodies}
      </div>
      ${para.length ? `<div class="rside">
        <h3>並行して進める本</h3>
        <p>上の順番とは別に、期間を通して毎日並行させる本です。ルートの「次の1冊」を待つ必要はありません。</p>
        <ul>
${sideList(para, bookById, sub, d.stages)}
        </ul>
      </div>` : ''}
      ${final.length ? `<div class="rside">
        <h3>最後の仕上げ</h3>
        <p>直前期に取り組む総仕上げです。上のルートを終えてから着手します。</p>
        <ul>
${sideList(final, bookById, sub, d.stages)}
        </ul>
      </div>` : ''}
    </section>`;
  }).join('\n\n');

  const others = d.tiers.filter(t => t.id !== tier.id && norm[t.id]);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: `${tier.name}の${sub.ja}参考書ルート`,
        description: desc,
        inLanguage: 'ja',
        author: { '@type': 'Organization', name: 'ルート大全 編集部' },
        publisher: { '@type': 'Organization', name: 'ルート大全 編集部' },
        mainEntityOfPage: url,
      },
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
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp-${sub.dir}.png` })}
<style>
:root{--sc:${tier.color || sub.color}}
.tier-head{display:flex;flex-wrap:wrap;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:20px;box-shadow:var(--sh-s)}
.tier-head div{background:var(--surface);padding:15px 18px;flex:1 1 180px}
.tier-head dt{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.05em}
.tier-head dd{font-size:14px;color:var(--ink);font-weight:700;margin-top:5px;line-height:1.5}
.tnav{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}
.tnav a{background:var(--surface);border:1px solid var(--line);padding:10px 14px;font-size:12.5px;font-weight:700;color:var(--ink-2);transition:.15s;box-shadow:var(--sh-s)}
.tnav a:hover{transform:translateY(-2px);box-shadow:var(--sh-m);border-color:var(--line-d)}
.rpols{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:18px;box-shadow:var(--sh-s)}
@media(min-width:900px){.rpols{flex-direction:row}}
.rpol{background:var(--surface);padding:20px 20px 22px;flex:1;min-width:0}
.rpol__t{font-family:var(--serif);font-weight:800;font-size:16px;letter-spacing:.03em;display:flex;align-items:baseline;gap:10px}
.rpol__t span{font-family:var(--mono);font-size:10.5px;color:var(--muted);font-weight:600}
.rpol__n{font-size:12px;color:var(--muted);margin-top:7px;line-height:1.75}
.rsteps{list-style:none;margin-top:16px;display:flex;flex-direction:column;gap:0}
.rstep{display:flex;gap:12px;padding:14px 0;border-top:1px dashed var(--line)}
.rstep:first-child{border-top:none;padding-top:4px}
.rstep__no{font-family:var(--mono);font-size:11px;color:var(--muted-2);font-weight:600;padding-top:3px;flex:none;width:20px}
/* 書影は書名リンクの隣に置く飾り。読み上げ・タブ移動では書名リンクだけを通す */
.rstep__cov{flex:none;display:block;--cw:52px}
.rstep__body{min-width:0;flex:1}
.rstep__role{display:inline-block;font-size:10px;font-weight:700;color:#fff;background:var(--sc);padding:2px 7px;border-radius:2px;letter-spacing:.04em;margin-bottom:5px}
/* 指でタップできる高さを確保する（当たり判定だけ広げ、見た目は変えない） */
.rstep__name{display:block;font-size:14.5px;font-weight:700;color:var(--ink);letter-spacing:.02em;line-height:1.45;text-decoration:underline;text-decoration-color:var(--line-d);text-underline-offset:3px;transition:.15s;padding:4px 0}
.rstep__name:hover{color:var(--accent-deep);text-decoration-color:var(--accent)}
.rstep__meta{display:block;font-family:var(--mono);font-size:10.5px;color:var(--muted-2);margin-top:4px;letter-spacing:.03em}
.rstep__note{font-size:12.5px;color:var(--ink-2);margin-top:7px;line-height:1.75}
.rstep__alts{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.7}
.rstep__alts a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:2px;padding:4px 0;display:inline-block}
.rside{background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--gold);padding:18px 20px;margin-top:14px}
.rside h3{font-family:var(--serif);font-weight:800;font-size:14.5px;letter-spacing:.03em;margin-bottom:7px}
.rside p{font-size:12.5px;color:var(--muted);line-height:1.8}
.rside ul{list-style:none;margin-top:11px;display:flex;flex-direction:column;gap:12px}
.rside li{display:flex;gap:11px;align-items:flex-start;font-size:13px;line-height:1.7}
.rside li>div{min-width:0}
.rside__cov{flex:none;display:block;--cw:40px}
.rside__name{font-weight:700;color:var(--indigo);text-decoration:underline;text-underline-offset:2px;padding:3px 0;display:inline-block}
.rside li span{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
.unis{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.unis span{font-size:12px;font-weight:700;color:var(--ink-2);background:var(--surface);border:1px solid var(--line);padding:6px 12px;box-shadow:var(--sh-s)}
</style>
</head>
<body>

${topBars(sub.dir)}

${header(sub)}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Route by target</div>
    <h1 class="sec" style="font-size:29px">${esc(tier.name)}の${esc(sub.ja)}参考書ルート</h1>
    <p class="sec-lead">${esc(tier.sub)}を目指す人に向けた${esc(sub.ja)}の並びです。導入から過去問まで、${used.size}冊の中から「何を・どの順で」やるかを${trackKeys.map(trackLabel).map(esc).join('・')}別にまとめています。すでに終えた段階は飛ばして構いません。</p>
    <div class="tier-head">
      <div><dt>目標</dt><dd>${esc(tier.goal)}</dd></div>
      <div><dt>想定レベル</dt><dd>${esc(tier.hensachi)}</dd></div>
      <div><dt>収録冊数</dt><dd>${used.size} 冊</dd></div>
    </div>
    ${trackKeys.length > 1 ? `<div class="tnav">
${trackKeys.map(tk => `      <a href="#track-${tk}">${esc(trackLabel(tk))}のルート</a>`).join('\n')}
    </div>` : ''}
    ${shareBar({
      url,
      head: 'SHARE — このルートを共有する',
      text: `【ルート大全】${tier.name}の${sub.ja}参考書ルート（${used.size}冊）\n#ルート大全 #大学受験`,
    })}
  </div>

${sections}

  ${unis.length ? `<section class="block">
    <div class="eyebrow">Target</div>
    <h2 class="sec">この志望レベルに含まれる大学</h2>
    <p class="sec-lead">${esc(sub.full)}が「${esc(tier.name)}」として扱っている大学です。同じ大学でも学部・方式で必要な到達点は変わります。個別の出題傾向は${esc(sub.full)}のルート画面で大学名を入れると確認できます。</p>
    <div class="unis">
${unis.slice(0, 60).map(u => `      <span>${esc(u.n)}</span>`).join('\n')}
    </div>
    ${unis.length > 60 ? `<p class="sec-lead" style="margin-top:12px">ほか ${unis.length - 60} 校</p>` : ''}
  </section>` : ''}

  <section class="block">
    <div class="eyebrow">Other levels</div>
    <h2 class="sec">他の志望レベルのルート</h2>
    <div class="tnav" style="margin-top:16px">
${others.map(t => `      <a href="/${sub.dir}/routes/${t.id}/">${esc(t.name)}</a>`).join('\n')}
    </div>
  </section>

  <div class="cta">
    <h2>志望校名を入れると、もう一段細かく出ます</h2>
    <p>ここに載せたのは志望レベル単位の標準的な並びです。${esc(sub.full)}のルート画面では、大学名と現在の学力を入れることで、出題形式や残り時間に合わせた並びに調整できます。</p>
    <div class="cta__btns">
      <a class="p" href="/${sub.dir}/">${esc(sub.ja)}のルートを作る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/${sub.dir}/books/">参考書一覧を見る</a>
    </div>
  </div>
</main>

${footer(sub.dir, counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/** 科目ごとの志望レベル一覧ページ */
function renderIndex(sub, d, norm, counts) {
  const url = `${ORIGIN}/${sub.dir}/routes/`;
  const tiers = d.tiers.filter(t => norm[t.id]);
  const title = `${sub.ja}の志望校別 参考書ルート一覧｜共通テストから最難関まで - ${sub.full}`;
  const desc = clip(`大学受験${sub.ja}の参考書ルートを志望校レベル別にまとめた一覧。` +
    `${tiers.map(t => t.name).join('・')}の${tiers.length}段階。各ルートで導入から過去問まで、何をどの順で進めるかを確認できます。2026年 新課程対応。`, 158);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` },
    { name: '志望校別ルート', url, absUrl: url },
  ];

  const cards = tiers.map((t, i) => {
    const n = new Set();
    const node = norm[t.id];
    for (const tk of Object.keys(node.tracks)) for (const p of POLICIES) (node.tracks[tk][p.key] || []).forEach(s => n.add(s.id));
    return `      <a class="tcard" href="/${sub.dir}/routes/${t.id}/" style="--tc:${t.color || sub.color}">
        <div class="tcard__no">ROUTE ${String(i + 1).padStart(2, '0')}<span>${n.size}冊</span></div>
        <b>${esc(t.name)}</b>
        <span class="tcard__sub">${esc(t.sub)}</span>
        <div class="tcard__foot"><span>${esc(t.goal)}</span><span class="mono">${esc(t.hensachi)}</span></div>
      </a>`;
  }).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'ItemList',
        name: `${sub.ja}の志望校別参考書ルート`,
        numberOfItems: tiers.length,
        itemListElement: tiers.map((t, i) => ({
          '@type': 'ListItem', position: i + 1, name: `${t.name}の${sub.ja}参考書ルート`,
          url: `${ORIGIN}/${sub.dir}/routes/${t.id}/`,
        })),
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp-${sub.dir}.png` })}
<style>
:root{--sc:${sub.color}}
.tgrid{display:grid;grid-template-columns:1fr;gap:11px;margin-top:22px}
@media(min-width:640px){.tgrid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:980px){.tgrid{grid-template-columns:repeat(3,1fr)}}
.tcard{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--tc);padding:17px 18px 15px;box-shadow:var(--sh-s);transition:.16s;display:flex;flex-direction:column}
.tcard:hover{transform:translateY(-3px);box-shadow:var(--sh-m);border-color:var(--line-d);border-top-color:var(--tc)}
.tcard__no{font-family:var(--mono);font-size:10px;color:var(--muted-2);letter-spacing:.1em;display:flex;justify-content:space-between;margin-bottom:9px}
.tcard__no span{color:var(--tc);font-weight:600}
.tcard b{font-family:var(--serif);font-weight:800;font-size:17px;letter-spacing:.03em;line-height:1.4;color:var(--ink)}
.tcard__sub{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.65;flex:1}
.tcard__foot{display:flex;flex-direction:column;gap:4px;margin-top:13px;padding-top:11px;border-top:1px dashed var(--line);font-size:11.5px;color:var(--ink-2);font-weight:700}
.tcard__foot .mono{font-family:var(--mono);font-size:10.5px;color:var(--muted);font-weight:600}
</style>
</head>
<body>

${topBars(sub.dir)}

${header(sub)}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Routes by target</div>
    <h1 class="sec" style="font-size:29px">${esc(sub.ja)}の志望校別 参考書ルート</h1>
    <p class="sec-lead">志望校のレベルごとに、${esc(sub.ja)}で必要になる参考書の並びをまとめました。同じ${esc(sub.ja)}でも、共通テストだけで使う場合と最難関大の二次試験で使う場合では、必要な到達点も冊数もまったく違います。まず自分の志望レベルを選んでください。</p>
    <div class="tgrid">
${cards}
    </div>
  </div>

  <div class="cta">
    <h2>レベルが決めきれないときは</h2>
    <p>志望校がまだ固まっていない場合や、今の学力から逆算したい場合は、${esc(sub.full)}の 3 分診断を使ってください。いくつかの質問に答えるだけで、現在地に合った並びが出ます。</p>
    <div class="cta__btns">
      <a class="p" href="/${sub.dir}/">3分診断を試す<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/${sub.dir}/books/">参考書一覧を見る</a>
    </div>
  </div>
</main>

${footer(sub.dir, counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   実行
   ============================================================ */
const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = extractSubject(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

let total = 0;
for (const sub of SUBJECTS) {
  const d = data[sub.dir];
  const norm = normalize(d.routes, d.tiers);
  const tiers = d.tiers.filter(t => norm[t.id] && Object.keys(norm[t.id].tracks).length);
  if (!tiers.length) { console.error(`  ✗ ${sub.dir}: ルートを正規化できなかった`); process.exit(1); }

  for (const tier of tiers) {
    const outDir = path.join(ROOT, sub.dir, 'routes', tier.id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), render(sub, d, tier, norm, counts));
    total++;
  }
  fs.writeFileSync(path.join(ROOT, sub.dir, 'routes', 'index.html'), renderIndex(sub, d, norm, counts));
  total++;
  console.log(`  ✓ ${sub.dir}: ${tiers.length} ルート + 一覧`);
}
console.log(`合計 ${total} ページを生成した。`);
