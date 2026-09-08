/**
 * 大学別ページ（/univ/<slug>/）と、その一覧（/univ/）を生成する。
 *
 * ## なぜこのページを作るか
 *
 * 受験生が検索するのは「早稲田 英語 参考書」であって「早慶上智 英語 参考書ルート」
 * ではない。ところが 2026-09-08 まで、このサイトの URL は志望レベル
 * （sokei / march / nikkoma …）単位でしか立っておらず、**大学名を持つページが
 * 1 枚も無かった**。Search Console の上位クエリ 11 件もすべて「〈参考書名〉 レベル」型で、
 * 大学名のクエリは 1 件も入っていない。
 *
 * 一方で `data/subjects/<科目>/universities.json` には、160 校ぶんの
 * 出題形式（`no`）・科目別の目標偏差値（`h`）が 5 科目それぞれに手書きで入っている。
 * ページの材料はもう揃っていて、URL に出していないだけだった。
 *
 * ## 「同じ志望レベルの大学は中身が同じ」にならないか
 *
 * ならない。志望レベルが同じでも `no` は大学ごとに書き分けてある。
 * 例（すべて tier=sokei）:
 *   早稲田 … 学部ごとに現代文＋古文＋漢文の構成が違う
 *   慶應   … 一般選抜に国語の科目試験が無く、小論文を課す
 *   上智   … 2021 年度以降、独自の日本史・世界史を廃止し共通テストで評価する
 *
 * 5 科目を 1 ページにまとめると、**固有テキストは 160 校すべてで 400 字以上**
 * （中央値 499 字・最少 407 字。`universities.json` から実測）になる。
 * 加えて科目別の目標偏差値表は 1 校ずつ値が違う。
 *
 * **薄いページを増やさないための線引き（守ること）**
 *   - 5 科目すべてのデータが揃っている大学だけを出す。理科だけの 21 校
 *     （九州工業大学など。固有テキストが 140 字前後）は**ページにしない**
 *   - 参考書のリストは「主な参考書」の 5 冊までに絞る。ここを増やすと、
 *     同じ志望レベルの大学どうしでページの大半が一致してしまう
 *
 * ## slug は台帳で固定する
 *
 * `build/data/university-slugs.json` が正本。エイリアスから正規表現で導出しない。
 * 導出にすると、エイリアスを 1 語足しただけで URL が変わり、公開済みの
 * ページが 404 になる。台帳に無い大学・台帳にあるのにデータに無い大学は落とす。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, SUB_LABELS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, portalHeader, crumbs, footer, jsonLd, breadcrumbLd, shareBar } from './lib/parts.mjs';
import { adUnit } from './lib/ads.mjs';
import { isPlaceholder, placeholderSearchUrl } from './lib/record-type.mjs';
import { recordDate, saveDates } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** ルートを持つ 5 科目だけを扱う（情報・小論文は志望レベルの定義を持たない） */
const ROUTE_SUBJECTS = SUBJECTS.filter(s => !s.catalogOnly);

/** トラックの表示名。generate-routes.mjs と同じ対応を使う */
const TRACK_LABELS = { bun: '文系', ri: '理系', ...SUB_LABELS };
/** ルートの並びそのものではないキー。generate-routes.mjs と同じ */
const NON_TRACK = new Set(['para', 'final', 'basic']);
/** トラックの表示順。generate-routes.mjs と同じ */
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
 * 志望レベルの並び順は tier の `no`（"01"〜"09"）に従う。
 * ここに独自の順序を持たない。持つと、一覧の見出しに出る LEVEL 番号が
 * 07 → 06 → 04 と飛び、科目トップの志望レベル一覧（ROUTE 01…）とも食い違う。
 */
function tierRank(t) {
  const n = Number(t && t.no);
  return Number.isFinite(n) ? n : 99;
}

/** 1 校あたりに出す「主な参考書」の上限。増やすと同レベルの大学どうしが似てくる */
const MAX_BOOKS_PER_SUBJECT = 5;

/* ============================================================
   データの読み込み
   ============================================================ */

const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'data', 'university-slugs.json'), 'utf8'));

const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = loadSubjectData(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

/**
 * 台帳と科目データを突き合わせる。
 * **食い違いは黙って飛ばさず落とす。** 飛ばすと、大学を 1 校足したときに
 * 台帳へ書き忘れてもビルドが通ってしまい、ページだけが永久にできない。
 */
function resolveUniversities() {
  const problems = [];
  const slugs = new Set();
  const out = [];

  for (const row of ledger.universities) {
    if (!/^[a-z0-9-]+$/.test(row.slug)) problems.push(`slug が URL に使えない文字を含む: ${row.slug}`);
    if (slugs.has(row.slug)) problems.push(`slug が重複している: ${row.slug}`);
    slugs.add(row.slug);

    const perSubject = [];
    for (const sub of ROUTE_SUBJECTS) {
      const d = data[sub.dir];
      const u = d.unis.find(x => x.n === row.name);
      if (!u) continue;
      const tier = d.tiers.find(t => t.id === u.t);
      if (!tier) { problems.push(`${row.name}（${sub.dir}）の志望レベル「${u.t}」に対応する tier が無い`); continue; }
      perSubject.push({ sub, u, tier });
    }

    if (perSubject.length !== ROUTE_SUBJECTS.length) {
      problems.push(`${row.name}: 5 科目そろっていない（${perSubject.length} 科目）。`
        + '台帳から外すか、universities.json を埋めること');
      continue;
    }
    if (perSubject[0].u.t !== row.tier) {
      problems.push(`${row.name}: 台帳の tier「${row.tier}」がデータの「${perSubject[0].u.t}」と違う`);
    }
    out.push({ slug: row.slug, name: row.name, tier: row.tier, perSubject });
  }

  // 逆向き。5 科目そろっているのに台帳に無い大学を出す
  const listed = new Set(ledger.universities.map(r => r.name));
  const seen = new Map();
  for (const sub of ROUTE_SUBJECTS) {
    for (const u of data[sub.dir].unis) seen.set(u.n, (seen.get(u.n) || 0) + 1);
  }
  for (const [name, n] of seen) {
    if (n === ROUTE_SUBJECTS.length && !listed.has(name)) {
      problems.push(`${name}: 5 科目そろっているのに build/data/university-slugs.json に無い`);
    }
  }

  if (problems.length) {
    console.error('大学別ページを生成できない:');
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  return out;
}

/* ============================================================
   ルートから「主な参考書」を拾う
   ============================================================ */

/**
 * その志望レベルのルートで最初に使う本を、トラックを横断して拾う。
 *
 * トラックの先頭から順に 1 冊ずつ取る（総当たりではなく持ち回り）。
 * 文系だけ・日本史だけが並ぶのを避けて、どの選択でも 1 冊は目に入るようにする。
 *
 * **トラック名を必ず添える。** 社会は日本史と世界史の両方に「実況中継①」があり、
 * 理科は地学まで並ぶ。トラック名が無いと、同じ書名が 2 行続いたり、
 * 自分が選ばない科目の本が理由なく混ざっているように見える。
 *
 * **ルート上の枠（志望校の過去問）は入れない。** 特定の商品ではないうえ、
 * このページには大学名の入った過去問の節を別に置いてある。
 */
function mainBooks(d, tierId) {
  const node = d.routes[tierId] || {};
  const tracks = Object.keys(node)
    .filter(k => !NON_TRACK.has(k) && node[k])
    .sort((a, b) => trackRank(a) - trackRank(b));

  const seqs = tracks.map(k => ({ track: k, steps: node[k].omni || node[k].quick || [] }));
  const bookById = new Map(d.books.map(b => [b.id, b]));
  const picked = [];
  const used = new Set();

  for (let i = 0; picked.length < MAX_BOOKS_PER_SUBJECT && i < 12; i++) {
    for (const seq of seqs) {
      if (picked.length >= MAX_BOOKS_PER_SUBJECT) break;
      const step = seq.steps[i];
      if (!step || used.has(step.id)) continue;
      const b = bookById.get(step.id);
      if (!b || isPlaceholder(b)) continue;
      used.add(step.id);
      picked.push({ book: b, role: step.role || '', track: seq.track });
    }
  }
  return { books: picked, tracks };
}

/** その志望レベルのルートが収録している総冊数（重複を除く） */
function tierBookCount(d, tierId) {
  const node = d.routes[tierId] || {};
  const ids = new Set();
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (!v) continue;
    if (NON_TRACK.has(k)) {
      if (Array.isArray(v)) v.forEach(s => ids.add(s.id));
      else for (const kk of Object.keys(v)) if (Array.isArray(v[kk])) v[kk].forEach(s => ids.add(s.id));
      continue;
    }
    for (const p of ['omni', 'quick']) (v[p] || []).forEach(s => ids.add(s.id));
  }
  return ids.size;
}

/* ============================================================
   購入導線（過去問）
   ============================================================ */

/**
 * 過去問（赤本）の導線。
 *
 * **特定の商品へ直リンクしない。** 何年度版を買うか、どの学部の冊子かは
 * 受験する人にしか決められない（`build/lib/record-type.mjs` の経緯を参照。
 * ルート上の「志望校の過去問」枠に東大の赤本の ISBN が入っていた誤りを直した）。
 * ここでは大学名を検索語に入れた検索結果へ送る。書籍ページの枠と違って、
 * このページは大学が確定しているので**検索語に大学名を入れられる**。
 */
function kakomonLinks(name, config) {
  const az = placeholderSearchUrl('赤本 過去問', name);
  const azUrl = config.amazonTag ? `${az}&tag=${config.amazonTag}` : az;

  let rkUrl = '';
  if (config.rakutenId) {
    const dest = `https://search.rakuten.co.jp/search/mall/${name} 赤本/`;
    const e = encodeURIComponent(dest);
    rkUrl = `https://hb.afl.rakuten.co.jp/hgc/${config.rakutenId}/?pc=${e}&m=${e}`;
  }
  return { azUrl, rkUrl };
}

/* ============================================================
   1 校ぶんのページ
   ============================================================ */

function renderUniversity(uni, all, config) {
  const { slug, name, perSubject } = uni;
  const url = `${ORIGIN}/univ/${slug}/`;
  const tier = perSubject[0].tier;
  const kind = perSubject[0].u.ty || '';

  /* 更新日は「読者に見える中身が変わった日」。大学のデータと台帳の slug が
     材料で、サイト全体の再生成では動かない（build/lib/updated.mjs の方針） */
  const updated = recordDate(`univ/${slug}`, {
    slug, name,
    subjects: perSubject.map(p => ({ dir: p.sub.dir, t: p.u.t, h: p.u.h, no: p.u.no, fx: p.u.fx })),
  });

  const sections = perSubject.map(p => {
    const d = data[p.sub.dir];
    const { books, tracks } = mainBooks(d, p.u.t);
    const total = tierBookCount(d, p.u.t);
    const routeUrl = `/${p.sub.dir}/routes/${p.u.t}/`;
    const fx = Array.isArray(p.u.fx) ? p.u.fx : [];

    return `    <section class="block usec" id="sub-${p.sub.dir}" style="--sc:${p.sub.color}">
      <div class="eyebrow">${esc(p.sub.en)}</div>
      <h2 class="sec">${esc(name)}の${esc(p.sub.ja)}</h2>
      <dl class="ufacts">
        <div><dt>出題の形式</dt><dd>${esc(p.u.no || '公表されている情報から特定できていません。募集要項で確認してください。')}</dd></div>
        <div><dt>目標の目安</dt><dd>偏差値 ${esc(String(p.u.h))} 前後${fx.length ? `／${fx.map(esc).join('・')}` : ''}</dd></div>
      </dl>
      ${books.length ? `<h3 class="usec__h3">この志望レベルのルートで最初に使う本</h3>
      <ul class="ubooks">
${books.map(b => {
    const tl = tracks.length > 1 ? (TRACK_LABELS[b.track] || b.track) : '';
    return `        <li><a href="/${p.sub.dir}/books/${b.book.id}/"><b>${esc(b.book.name)}</b><span>${tl ? `${esc(tl)}／` : ''}${esc(b.role)}${b.role ? '／' : ''}難易度 ${b.book.diff}</span></a></li>`;
  }).join('\n')}
      </ul>` : ''}
      <p class="usec__more"><a href="${routeUrl}">${esc(tier.name)}の${esc(p.sub.ja)}参考書ルート（全${total}冊）を見る</a>${tracks.length > 1 ? `<span class="usec__tracks">${tracks.map(t => esc(TRACK_LABELS[t] || t)).join('・')}別に用意しています</span>` : ''}</p>
    </section>`;
  }).join('\n\n');

  // 同じ志望レベルの他大学（内部リンク。多すぎると読めないので 24 校で切る）
  const siblings = all.filter(x => x.tier === uni.tier && x.slug !== slug).slice(0, 24);

  const { azUrl, rkUrl } = kakomonLinks(name, config);

  const hs = perSubject.map(p => p.u.h).filter(h => typeof h === 'number');
  const hardest = perSubject.slice().sort((a, b) => (b.u.h || 0) - (a.u.h || 0))[0];

  const title = clip(`${name}の参考書ルート｜全科目の出題傾向と対策 - ルート大全`, 60);
  const desc = clip(`${name}（${tier.sub}）の入試対策。英語・国語・数学・理科・社会それぞれの出題形式と、`
    + `目標偏差値、そこへ届くまでに使う参考書の順番をまとめています。`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '志望校から探す', url: '/univ/', absUrl: `${ORIGIN}/univ/` },
    { name, url, absUrl: url },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: `${name}の参考書ルート`,
        description: desc,
        inLanguage: 'ja',
        author: { '@type': 'Organization', name: 'ルート大全 編集部' },
        publisher: { '@type': 'Organization', name: 'ルート大全 編集部' },
        mainEntityOfPage: url,
        about: { '@type': 'CollegeOrUniversity', name },
      },
      {
        '@type': 'WebPage',
        dateModified: updated,
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
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:${tier.color || '#5B4E9E'}}
.uhead{display:flex;flex-wrap:wrap;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:20px;box-shadow:var(--sh-s)}
.uhead div{background:var(--surface);padding:15px 18px;flex:1 1 160px}
.uhead dt{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.05em}
.uhead dd{font-size:14px;color:var(--ink);font-weight:700;margin-top:5px;line-height:1.5}
.unav{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}
.unav a{background:var(--surface);border:1px solid var(--line);padding:10px 14px;font-size:12.5px;font-weight:700;color:var(--ink-2);transition:.15s;box-shadow:var(--sh-s)}
.unav a:hover{transform:translateY(-2px);box-shadow:var(--sh-m);border-color:var(--line-d)}
.usec{border-left:3px solid var(--sc)}
.ufacts{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:16px}
.ufacts div{background:var(--surface);padding:14px 17px}
.ufacts dt{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.05em}
.ufacts dd{font-size:13.5px;color:var(--ink);margin-top:6px;line-height:1.85}
.usec__h3{font-family:var(--serif);font-weight:800;font-size:14.5px;letter-spacing:.03em;margin-top:20px}
.ubooks{list-style:none;margin-top:11px;display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line)}
@media(min-width:720px){.ubooks{grid-template-columns:repeat(2,1fr)}}
.ubooks a{display:block;background:var(--surface);padding:12px 15px;transition:.15s}
.ubooks a:hover{background:var(--surface-2)}
.ubooks b{display:block;font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.5;text-decoration:underline;text-decoration-color:var(--line-d);text-underline-offset:3px}
.ubooks span{display:block;font-family:var(--mono);font-size:10.5px;color:var(--muted-2);margin-top:4px;letter-spacing:.03em}
.usec__more{margin-top:16px;font-size:13px;line-height:1.8}
.usec__more a{font-weight:700;color:var(--indigo);text-decoration:underline;text-underline-offset:3px;padding:4px 0;display:inline-block}
.usec__tracks{display:block;font-size:11.5px;color:var(--muted);margin-top:3px}
.uhensa{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--sh-s)}
.uhensa th,.uhensa td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left}
.uhensa th{font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.04em;background:var(--surface-2)}
.uhensa td{font-weight:700;color:var(--ink)}
.uhensa td.mono{font-family:var(--mono);font-weight:600;color:var(--ink-2)}
.uhensa tr:last-child th,.uhensa tr:last-child td{border-bottom:none}
.ubuy{background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--gold);padding:19px 21px;margin-top:18px}
.ubuy p{font-size:12.5px;color:var(--ink-2);line-height:1.85;margin-top:8px}
.ubuy__btns{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.ubuy__btns a{font-size:12.5px;font-weight:700;padding:11px 17px;border:1px solid var(--line-d);background:var(--surface);color:var(--ink);transition:.15s;box-shadow:var(--sh-s)}
.ubuy__btns a:hover{transform:translateY(-2px);box-shadow:var(--sh-m)}
.usibs{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.usibs a{font-size:12px;font-weight:700;color:var(--ink-2);background:var(--surface);border:1px solid var(--line);padding:6px 12px;box-shadow:var(--sh-s);transition:.15s}
.usibs a:hover{transform:translateY(-2px);box-shadow:var(--sh-m);color:var(--accent-deep)}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">University</div>
    <h1 class="sec" style="font-size:29px">${esc(name)}の参考書ルート</h1>
    <p class="sec-lead">${esc(name)}（${esc(kind)}／${esc(tier.sub)}）を目指すときに、英語・国語・数学・理科・社会でそれぞれ何が問われ、どの参考書をどの順で進めるかをまとめたページです。学部・入試方式によって使う科目と配点は変わるので、必ず募集要項と併せて確認してください。</p>
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
    <dl class="uhead">
      <div><dt>志望レベル</dt><dd>${esc(tier.name)}</dd></div>
      <div><dt>区分</dt><dd>${esc(kind || '—')}</dd></div>
      <div><dt>目標の目安</dt><dd>${hs.length ? `偏差値 ${Math.min(...hs)}〜${Math.max(...hs)}` : '—'}</dd></div>
      <div><dt>最も高い到達度が要る科目</dt><dd>${esc(hardest.sub.ja)}</dd></div>
    </dl>
    <div class="unav">
${perSubject.map(p => `      <a href="#sub-${p.sub.dir}">${esc(p.sub.ja)}</a>`).join('\n')}
    </div>
    ${shareBar({
      url,
      head: 'SHARE — このページを共有する',
      text: `【ルート大全】${name}の参考書ルート（全科目の出題傾向と使う参考書）`,
    })}
  </div>

  <section class="block">
    <div class="eyebrow">Target level</div>
    <h2 class="sec">科目ごとの目標</h2>
    <p class="sec-lead">${esc(name)}で科目ごとに必要になる到達度の目安です。同じ大学でも学部・方式で配点が変わるため、数字は「どの科目に時間を厚く配るか」を決めるための相対的な目安として使ってください。算出のしかたは<a href="/methodology/">データの作り方</a>に書いています。</p>
    <table class="uhensa">
      <tr><th scope="col">科目</th><th scope="col">目標偏差値</th><th scope="col">志望レベル</th></tr>
${perSubject.map(p => `      <tr><th scope="row">${esc(p.sub.ja)}</th><td class="mono">${esc(String(p.u.h))}</td><td class="mono">${esc(p.tier.name)}</td></tr>`).join('\n')}
    </table>
  </section>

${sections}

  <section class="block">
    <div class="eyebrow">Past exams</div>
    <h2 class="sec">${esc(name)}の過去問</h2>
    <div class="ubuy">
      <p>ルートの最後は過去問です。${esc(name)}は学部・入試方式によって収録内容の違う冊子が出ているため、当サイトでは特定の 1 冊を指定していません。志望学部と年度を確かめてから選んでください。</p>
      <div class="ubuy__btns">
        <a href="${esc(azUrl)}" target="_blank" rel="nofollow sponsored noopener noreferrer">Amazon で「${esc(name)} 赤本」を探す</a>
${rkUrl ? `        <a href="${esc(rkUrl)}" target="_blank" rel="nofollow sponsored noopener noreferrer">楽天ブックスで探す</a>` : ''}
      </div>
    </div>
  </section>

  ${siblings.length ? `<section class="block">
    <div class="eyebrow">Same level</div>
    <h2 class="sec">同じ志望レベルの大学</h2>
    <p class="sec-lead">${esc(tier.name)}として扱っている他の大学です。併願先を決めるとき、必要な参考書がどれだけ重なるかの目安になります。</p>
    <div class="usibs">
${siblings.map(s => `      <a href="/univ/${s.slug}/">${esc(s.name)}</a>`).join('\n')}
    </div>
  </section>` : ''}

  <div class="cta">
    <h2>現在地から逆算したいときは</h2>
    <p>ここに出しているのは${esc(name)}を目標にした標準的な並びです。いま解ける問題のレベルや残り時間に合わせて調整したい場合は、各科目の 3 分診断を使ってください。</p>
    <div class="cta__btns">
      <a class="p" href="/univ/">他の大学も見る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/">全科目のトップへ</a>
    </div>
  </div>${adUnit('bottom', '  ')}
</main>

${footer('', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   一覧ページ
   ============================================================ */

function renderIndex(all) {
  const url = `${ORIGIN}/univ/`;
  const updated = recordDate('univ/index', all.map(u => `${u.slug}:${u.tier}`).join(','));

  // 志望レベルごとにまとめる。tier の表示名は英語科目の定義から引く（5 科目で共通）
  const groups = data.english.tiers
    .slice()
    .sort((a, b) => tierRank(a) - tierRank(b))
    .map(def => ({ def, list: all.filter(u => u.tier === def.id) }))
    .filter(g => g.list.length);

  const title = '志望校から探す 参考書ルート｜大学160校の出題傾向 - ルート大全';
  const desc = clip(`大学ごとの入試の出題形式と、そこから逆算した参考書ルートの一覧。`
    + `${all.length}校について、英語・国語・数学・理科・社会それぞれの目標と使う参考書をまとめています。`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '志望校から探す', url, absUrl: url },
  ];

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
        name: '志望校別の参考書ルート',
        numberOfItems: all.length,
        itemListElement: all.map((u, i) => ({
          '@type': 'ListItem', position: i + 1, name: `${u.name}の参考書ルート`,
          url: `${ORIGIN}/univ/${u.slug}/`,
        })),
      },
    ],
  };

  const sections = groups.map(g => `  <section class="block">
    <div class="eyebrow">${esc(g.def.no ? `LEVEL ${g.def.no}` : 'LEVEL')}</div>
    <h2 class="sec">${esc(g.def.name)}<span class="ucount">${g.list.length}校</span></h2>
    <p class="sec-lead">${esc(g.def.sub)}／${esc(g.def.hensachi)}。<a href="/english/routes/${g.def.id}/">この志望レベルの英語ルート</a>を起点に、各大学のページで科目ごとの出題形式を確認できます。</p>
    <div class="ugrid">
${g.list.map(u => `      <a href="/univ/${u.slug}/">${esc(u.name)}</a>`).join('\n')}
    </div>
  </section>`).join('\n\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#5B4E9E}
.ucount{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:600;margin-left:10px}
.ugrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:16px;box-shadow:var(--sh-s)}
.ugrid a{background:var(--surface);padding:13px 15px;font-size:13px;font-weight:700;color:var(--ink);transition:.15s;line-height:1.5}
.ugrid a:hover{background:var(--surface-2);color:var(--accent-deep)}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Universities</div>
    <h1 class="sec" style="font-size:29px">志望校から探す 参考書ルート</h1>
    <p class="sec-lead">大学${all.length}校について、英語・国語・数学・理科・社会それぞれで何が問われるかと、そこへ届くまでに使う参考書の順番をまとめています。志望校が決まっている人はここから、まだ決まっていない人は<a href="/english/routes/">志望レベル別のルート</a>から見てください。</p>
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
  </div>

${sections}

  <div class="cta">
    <h2>志望校がまだ決まっていないときは</h2>
    <p>志望校ではなく現在の学力から組み立てることもできます。各科目の 3 分診断に答えると、いまの位置から始められる並びが出ます。</p>
    <div class="cta__btns">
      <a class="p" href="/">科目を選ぶ<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/search/">参考書を検索する</a>
    </div>
  </div>${adUnit('bottom', '  ')}
</main>

${footer('', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   実行
   ============================================================ */

const all = resolveUniversities();
const config = data.english.config || {};

const outRoot = path.join(ROOT, 'univ');
fs.mkdirSync(outRoot, { recursive: true });

for (const uni of all) {
  const dir = path.join(outRoot, uni.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), renderUniversity(uni, all, config));
}
fs.writeFileSync(path.join(outRoot, 'index.html'), renderIndex(all));

/* 台帳から外した大学のページが残らないようにする。
   残すと sitemap に載らないページが本番に居座り、check-site も気づけない */
const keep = new Set(all.map(u => u.slug));
for (const e of fs.readdirSync(outRoot, { withFileTypes: true })) {
  if (e.isDirectory() && !keep.has(e.name)) {
    fs.rmSync(path.join(outRoot, e.name), { recursive: true, force: true });
    console.log(`  – /univ/${e.name}/ を削除した（台帳に無い）`);
  }
}

console.log(`  ✓ 大学別ページ: ${all.length} 校 + 一覧`);

saveDates();
