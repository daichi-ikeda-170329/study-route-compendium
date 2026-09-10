/**
 * 科目トップの学習ガイド（data/subjects/<科目>/guides.json）を、1 本 1 ページの静的な記事にする道具。
 *
 * 2026-09-10 まで、ガイドの本文は科目トップの HTML に閉じたアコーディオンとして
 * 事前描画されていた（英語で 13 本、科目トップが 146KB）。JS が動く画面では同じ本文を
 * もう一度描き直すので二重に持っていたうえ、検索エンジンからは畳まれた本文に見えていた。
 * 本文の置き場を /<科目>/guides/basics/<nn>/ に移し、科目トップは見出しだけにする。
 */
import { SUBJECTS } from './extract.mjs';

/** 静的ページを初めて公開した日。記事の「公開」日に出す（更新日は中身のハッシュで別に決まる） */
export const GUIDES_PUBLISHED = '2026-09-10';

/** 1 本のパス。n は 0 始まりの並び順 */
export function guidePath(dir, n) {
  return `/${dir}/guides/basics/${String(n + 1).padStart(2, '0')}/`;
}

/** タグを落として 1 行の文にする（meta description 用） */
function plainText(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * guides.json の 1 本を、build/generate-articles.mjs の articlePage() が受け取る形にする。
 * 本文は `<h4>` ごとに節へ分け、最初の `<h4>` より前は「はじめに」の節にする。
 */
export function guideToArticle(dir, g, n) {
  const sub = SUBJECTS.find(s => s.dir === dir);
  const parts = String(g.b).split(/<h4>([\s\S]*?)<\/h4>/);
  const sections = [];
  const intro = parts[0].trim();
  if (intro) sections.push({ h2: 'はじめに', body: [{ html: intro }] });
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ h2: plainText(parts[i]), body: [{ html: parts[i + 1].trim() }] });
  }
  const full = `${g.t} - ${sub.full}`;
  return {
    slug: `basics/${String(n + 1).padStart(2, '0')}`,
    subject: dir,
    category: 'basics',
    title: [...full].length <= 60 ? full : g.t,
    h1: g.t,
    desc: `${g.s}。${plainText(intro)}`,
    lead: g.s,
    published: GUIDES_PUBLISHED,
    sections,
    ctaTitle: `${sub.ja}のルートに当てはめる`,
    ctaText: `この学習ガイドの考え方が自分の並びのどこに効くかは、${sub.full}のルート画面で確認できます。志望校と今の学力を選ぶだけです。`,
  };
}
