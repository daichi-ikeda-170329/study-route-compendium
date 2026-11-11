/**
 * 「この本を取り上げた解説記事」の逆引き。
 *
 * 記事 → 書籍のリンクは本文のブロック（books / bookTable / versus / rankTable / awards）と
 * 文中の [[id|表示名]] から出るが、書籍 → 記事の向きが無かった（2026-11-11 の監査。
 * 書籍 1,432 枚のうち、個別の記事へリンクを持つページは 0 枚だった）。
 * 記事の本文（build/content/articles.mjs）だけから求めるので、生成の順序に依存しない。
 */
import { ARTICLES } from '../content/articles.mjs';

let cache = null;

function build() {
  const map = new Map();
  for (const a of ARTICLES) {
    const href = a.subject ? `/${a.subject}/guides/${a.slug}/` : `/guides/${a.slug}/`;
    const title = a.h1 || a.title;
    const seen = new Set();
    const add = (dir, id) => {
      if (!dir || typeof id !== 'string') return;
      const key = `${dir}/${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ href, title, published: a.published || '' });
    };
    const walk = (v) => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(/\[\[([a-z0-9-]+)\|/g)) add(a.subject, m[1]);
        return;
      }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!v || typeof v !== 'object') return;
      const dir = v.dir || a.subject;
      for (const k of ['books', 'bookTable', 'versus']) {
        if (Array.isArray(v[k])) v[k].forEach(id => add(dir, id));
      }
      if (Array.isArray(v.rankTable)) v.rankTable.forEach(r => add(r.dir || a.subject, r.id));
      if (Array.isArray(v.awards)) v.awards.forEach(r => add(r.dir || a.subject, r.id));
      Object.values(v).forEach(walk);
    };
    walk([a.lead, a.sections]);
  }
  return map;
}

/** その本を取り上げている記事。新しい順に最大 max 本 */
export function articlesForBook(dir, id, max = 4) {
  if (!cache) cache = build();
  const list = cache.get(`${dir}/${id}`) || [];
  return [...list].sort((x, y) => (x.published < y.published ? 1 : x.published > y.published ? -1 : 0)).slice(0, max);
}
