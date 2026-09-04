/**
 * 検索まわりの整合性。
 *
 * 目的は順位を上げることではなく、**受験生が必要な情報へたどり着けること**。
 * ここでは「載せると言っているものと、実際に載るものが食い違っていないか」を見る。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { extractSubject, SUBJECTS, ORIGIN } from '../build/lib/extract.mjs';
import { bookIndexable } from '../build/lib/indexing.mjs';

const SKIP = new Set(['.git', 'node_modules', 'dist', 'data', 'test-results', 'playwright-report', 'e2e', 'build', 'test', 'docs']);
function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const HTML = htmlFiles();
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

test('index 対象のページはすべて自己参照 canonical を持つ', () => {
  const bad = [];
  for (const f of HTML) {
    if (rel(f) === '404.html') continue;
    const src = fs.readFileSync(f, 'utf8');
    if (/<meta[^>]*name="robots"[^>]*noindex/i.test(src)) continue;
    const m = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(src);
    if (!m) { bad.push(`${rel(f)}: canonical が無い`); continue; }
    const want = `${ORIGIN}/${rel(f).replace(/index\.html$/, '')}`;
    if (m[1] !== want) bad.push(`${rel(f)}: canonical が ${m[1]}（${want} のはず）`);
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.slice(0, 10).join('\n'));
});

test('sitemap と noindex が食い違わない', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  const bad = [];
  for (const f of HTML) {
    const src = fs.readFileSync(f, 'utf8');
    const noindex = /<meta[^>]*name="robots"[^>]*noindex/i.test(src);
    const url = `${ORIGIN}/${rel(f).replace(/index\.html$/, '')}`;
    if (noindex && locs.has(url)) bad.push(`${rel(f)}: noindex なのに sitemap にある`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('sitemap の URL はすべて実在するページを指す', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const bad = locs.filter(loc => {
    let p = new URL(loc).pathname;
    if (p.endsWith('/')) p += 'index.html';
    return !fs.existsSync(path.join(ROOT, p.slice(1)));
  });
  assert.deepEqual(bad.slice(0, 10), [], bad.slice(0, 10).join('\n'));
});

test('title がページごとに固有である（重大な重複が無い）', () => {
  const seen = new Map();
  for (const f of HTML) {
    const m = /<title>([^<]*)<\/title>/.exec(fs.readFileSync(f, 'utf8'));
    if (!m) continue;
    const t = m[1].trim();
    if (!seen.has(t)) seen.set(t, []);
    seen.get(t).push(rel(f));
  }
  const dup = [...seen.entries()].filter(([, v]) => v.length > 1)
    .map(([t, v]) => `「${t}」: ${v.slice(0, 4).join(', ')}`);
  assert.deepEqual(dup.slice(0, 10), [], dup.slice(0, 10).join('\n'));
});

test('meta description が空でなく、ページごとに固有である', () => {
  const seen = new Map();
  const missing = [];
  for (const f of HTML) {
    const m = /<meta[^>]*name="description"[^>]*content="([^"]*)"/.exec(fs.readFileSync(f, 'utf8'));
    if (!m || !m[1].trim()) { missing.push(rel(f)); continue; }
    const d = m[1].trim();
    if (!seen.has(d)) seen.set(d, []);
    seen.get(d).push(rel(f));
  }
  assert.deepEqual(missing.slice(0, 5), [], `description が無い: ${missing.slice(0, 5).join(', ')}`);
  const dup = [...seen.entries()].filter(([, v]) => v.length > 1)
    .map(([d, v]) => `「${d.slice(0, 30)}…」: ${v.slice(0, 4).join(', ')}`);
  assert.deepEqual(dup.slice(0, 10), [], dup.slice(0, 10).join('\n'));
});

test('meta keywords を増強していない（検索順位に使われないため）', () => {
  const bad = HTML.filter(f => /<meta[^>]*name="keywords"/i.test(fs.readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(bad, [], bad.join(', '));
});

test('sitemap を priority と changefreq で細かく調整していない', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.ok(!/<priority>/.test(xml), 'priority が残っている（順位施策として調整しない）');
  assert.ok(!/<changefreq>/.test(xml), 'changefreq が残っている');
});

test('robots.txt が noindex の代用をしていない', () => {
  const txt = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.ok(!/^Noindex:/im.test(txt), 'robots.txt で noindex の代用をしている');
  assert.match(txt, /Sitemap:/i, 'sitemap の場所が書かれていない');
});

test('index 判定は「評価準備中」だけを外す（未確認だけを理由に外さない）', () => {
  let noindex = 0, total = 0;
  for (const s of SUBJECTS) {
    for (const b of extractSubject(ROOT, s.dir).books) {
      total++;
      if (!bookIndexable(b).indexable) noindex++;
    }
  }
  assert.ok(total > 1000);
  // 未確認は 257 件あるが、それを理由に外してはいない
  assert.ok(noindex < total * 0.05, `noindex が ${noindex}/${total} 件と多すぎる。既存の流入 URL を一律に外していないか確かめる`);
});

test('パンくずの構造化データが全書籍ページにある', () => {
  const books = HTML.filter(f => /\/books\/[^/]+\/index\.html$/.test(rel(f)));
  assert.ok(books.length > 1000, `書籍ページが ${books.length} 枚しかない`);
  const bad = books.filter(f => !/"@type": "BreadcrumbList"/.test(fs.readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(bad.slice(0, 5), [], bad.slice(0, 5).join(', '));
});

test('FAQ の構造化データが、画面に出ている FAQ と一致する', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const visible = [...src.matchAll(/<summary>([^<]+)<\/summary>/g)].map(m => m[1].trim());
  const ld = [...src.matchAll(/"@type": "Question",\s*\n?\s*"name": "([^"]+)"/g)].map(m => m[1].trim());
  assert.ok(visible.length > 3, `画面の FAQ が ${visible.length} 件`);
  assert.deepEqual(ld, visible, '構造化データの FAQ が画面と食い違っている');
});
