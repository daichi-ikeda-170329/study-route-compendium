/**
 * 学部別ページ（/univ/<slug>/<faculty-slug>/）を作るかどうかの判定（仕様書 4.5）。
 *
 * 対象は build/data/university-sources.json の faculties[] のうち `slug` を持つ行だけ。
 * 同じ slug の行（同じ学部の別方式）は 1 ページにまとめる。
 *
 * ## 薄いページを作らない
 *
 * 全校には作らない（薄くなるため）。**その学部だけに固有のテキストが 300 字未満なら作らない**。
 * 固有テキストに数えるのは、公式の資料から確かめて台帳に書いた学部の行（学部名・方式・科目・備考）と、
 * その学部の重点対策の形式名だけ。重点対策の説明文や定型文は他のページと共通なので数えない。
 * 足りない学部はビルドのログに理由を出して飛ばす（check-site の重複検査に引っかかる前に自分で止める）。
 */
import { ORIGIN, esc, clip } from './extract.mjs';
import { head, topBars, portalHeader, crumbs, footer, jsonLd, breadcrumbLd } from './parts.mjs';
import { displayName } from './booktitle.mjs';
import { placeholderSearchUrl } from './record-type.mjs';

/** 学部別ページに要る固有テキストの字数 */
export const FACULTY_MIN_UNIQUE = 300;

/**
 * 1 大学の faculties を slug ごとにまとめる。
 * @returns {{slug: string, name: string, rows: object[], focus: object}[]}
 */
export function facultyGroups(src) {
  const groups = new Map();
  for (const f of (src && src.faculties) || []) {
    if (!f.slug) continue;
    const g = groups.get(f.slug) || { slug: f.slug, name: f.name, rows: [], focus: {} };
    g.rows.push(f);
    for (const [dir, keys] of Object.entries(f.focus || {})) {
      g.focus[dir] = [...new Set([...(g.focus[dir] || []), ...keys])];
    }
    groups.set(f.slug, g);
  }
  return [...groups.values()];
}

/** その学部に固有のテキストの字数（空白を除く） */
export function uniqueLength(group) {
  const parts = [];
  for (const r of group.rows) parts.push(r.name, r.method, r.subjects, r.note || '');
  for (const keys of Object.values(group.focus || {})) parts.push(...keys);
  return [...parts.join('').replace(/\s+/g, '')].length;
}

/** ページを作るか。作らないなら理由を返す */
export function facultyVerdict(group) {
  const n = uniqueLength(group);
  return n >= FACULTY_MIN_UNIQUE
    ? { ok: true, n }
    : { ok: false, n, reason: `固有テキスト ${n} 字（${FACULTY_MIN_UNIQUE} 字未満）` };
}


/** その学部のページの URL（ルート相対） */
export function facultyPath(uniSlug, facultySlug) {
  return `/univ/${uniSlug}/${facultySlug}/`;
}

/**
 * 学部別ページ 1 枚。
 *
 * @param {object} o
 *   o.uni     { slug, name }（大学）
 *   o.group   facultyGroups の 1 要素
 *   o.src     university-sources.json のその大学（year・checked・url）
 *   o.subjects { english: loadSubjectData の戻り, ... }（focus.json と書名を引く）
 *   o.counts  フッターの科目別冊数
 *   o.amazonTag 過去問検索のアフィリエイト ID（無ければ付けない）
 */
export function renderFacultyPage(o) {
  const { uni, group, src, subjects, counts } = o;
  const url = `${ORIGIN}${facultyPath(uni.slug, group.slug)}`;
  const title = clip(`${uni.name} ${group.name}の入試と参考書の重点 - ルート大全`, 60);
  const desc = clip(`${uni.name}${group.name}の入試方式・科目と、出題形式に合わせた重点対策の参考書。${src.year}年度の公式の公表資料から確かめた内容です。`, 120);
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '志望校から探す', url: '/univ/', absUrl: `${ORIGIN}/univ/` },
    { name: uni.name, url: `/univ/${uni.slug}/`, absUrl: `${ORIGIN}/univ/${uni.slug}/` },
    { name: group.name, url: facultyPath(uni.slug, group.slug), absUrl: url },
  ];
  const q = `${uni.name} ${group.name}`;
  const az = placeholderSearchUrl('赤本 過去問', q);
  const azUrl = o.amazonTag ? `${az}&tag=${o.amazonTag}` : az;

  const focusHtml = Object.entries(group.focus || {}).map(([dir, keys]) => {
    const d = subjects[dir];
    const focus = (d && d.focus) || {};
    const rows = keys.map(k => ({ k, f: focus[k] })).filter(x => x.f);
    if (!rows.length) return '';
    const link = (id) => {
      const b = d.books.find(x => x.id === id);
      return b ? `<a href="/${dir}/books/${b.id}/">${esc(displayName(b, dir))}</a>` : '';
    };
    return `    <section class="block">
      <div class="eyebrow">Focus</div>
      <h2 class="sec">${esc(group.name)}の出題形式に合わせた重点対策</h2>
      <dl class="ffocus">
${rows.map(({ k, f }) => `        <div><dt>${esc(k)}</dt><dd>${link(f.id)}<span>${esc(f.note)}</span>${(f.alts || []).length ? `<span>代わりに使える本：${f.alts.map(link).filter(Boolean).join('、')}</span>` : ''}</dd></div>`).join('\n')}
      </dl>
    </section>`;
  }).filter(Boolean).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` }, breadcrumb: { '@id': `${url}#breadcrumb` },
        about: { '@type': 'CollegeOrUniversity', name: uni.name } },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp/univ/${uni.slug}.png` })}
<style>
:root{--sc:#5B4E9E}
.ftable{overflow-x:auto;margin-top:16px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--sh-s)}
.ftable table{border-collapse:collapse;width:100%;min-width:520px;font-size:13px}
.ftable th,.ftable td{padding:11px 14px;border-bottom:1px solid var(--line-2);text-align:left;vertical-align:top;line-height:1.7}
.ftable thead th{background:var(--surface-2);font-size:11px;color:var(--muted);white-space:nowrap}
.ftable tr:last-child td{border-bottom:none}
.ffocus{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:14px}
.ffocus>div{background:var(--surface);padding:12px 16px}
.ffocus dt{font-size:12px;font-weight:800;color:var(--sc)}
.ffocus dd{font-size:13px;margin-top:4px;line-height:1.75}
.ffocus dd>a{font-weight:700;color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.ffocus dd span{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
.ffocus dd span a{color:var(--indigo);font-weight:700}
.fsrc{font-size:11.5px;color:var(--muted);margin-top:8px}
.fsrc a,.fnav a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.fnav{margin-top:14px;font-size:13px;display:flex;flex-wrap:wrap;gap:8px 18px}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Faculty</div>
    <h1 class="sec" style="font-size:27px">${esc(uni.name)} ${esc(group.name)}</h1>
    <p class="fsrc">出典: ${esc(uni.name)}の${src.year}年度入試の公表資料（${esc(src.checked)} 確認） <a rel="nofollow noopener noreferrer" target="_blank" href="${esc(src.url)}">公式サイト</a></p>
    <div class="ftable" tabindex="0" role="region" aria-label="${esc(group.name)}の入試方式と科目の表（横にスクロールできます）">
      <table>
        <thead><tr><th scope="col">方式</th><th scope="col">科目</th><th scope="col">備考</th></tr></thead>
        <tbody>
${group.rows.map(r => `          <tr><td>${esc(r.method)}</td><td>${esc(r.subjects)}</td><td>${esc(r.note || '')}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>
    <p class="fnav"><a href="/univ/${uni.slug}/">${esc(uni.name)}の全科目の出題と参考書へ</a><a href="${esc(azUrl)}" target="_blank" rel="nofollow sponsored noopener noreferrer">Amazon で「${esc(q)} 赤本」を探す</a></p>
  </div>

${focusHtml}
</main>

${footer('', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}
