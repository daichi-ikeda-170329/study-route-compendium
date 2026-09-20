/**
 * 新刊・評価準備中の一覧 /new/ の検査（仕様書 4.4）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { SUBJECTS } = await import('../build/lib/extract.mjs');
const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { isProvisional, loadNewBooks } = await import('../build/lib/newbooks.mjs');

const html = fs.readFileSync(path.join(ROOT, 'new/index.html'), 'utf8');

test('/new/ は build/data/new-books.json と各科目の provisional の本と一致する', () => {
  const approved = loadNewBooks(ROOT).map(b => `${b.subject}:${b.id}`).sort();
  const prov = SUBJECTS.flatMap(s => loadSubjectData(ROOT, s.dir).books.filter(isProvisional).map(b => `${s.dir}:${b.id}`)).sort();
  assert.deepEqual(prov, approved, 'provisional の本と new-books.json が食い違う');
  /* 評価待ちの一覧（.nlist--pending）だけを見る。同じページの下には
     「最新の刊行年に出た本」（.nlist--latest）も並ぶので、ページ全体から
     リンクを拾うと評価済みの本が混ざる */
  const pending = (html.match(/<ul class="nlist nlist--pending">[\s\S]*?<\/ul>/g) || []).join('');
  const listed = [...pending.matchAll(/<li><a href="\/([a-z]+)\/books\/([a-z0-9_-]+)\/">/g)].map(m => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(listed, prov);
  if (!prov.length) assert.match(html, /いま評価待ちの本はありません。/);
});

test('/new/ の「最新の刊行年」の一覧は、その年の評価済みの本と一致する', () => {
  /* 評価待ちが 0 冊の日が続くと、このページは 1 行だけになって何も渡せていなかった。
     下に「いちばん新しい刊行年の本」を並べている（build/generate-new.mjs）。
     並べる本は実データから決まるので、西暦も冊数もここでは固定しない */
  const books = SUBJECTS.flatMap(s => loadSubjectData(ROOT, s.dir).books
    .filter(b => b.year && !isProvisional(b)).map(b => ({ key: `${s.dir}:${b.id}`, year: Number(b.year) })));
  const latestYear = Math.max(...books.map(b => b.year));
  const expected = books.filter(b => b.year === latestYear).map(b => b.key).sort();

  const latest = (html.match(/<ul class="nlist nlist--latest">[\s\S]*?<\/ul>/g) || []).join('');
  const listed = [...latest.matchAll(/<li><a href="\/([a-z]+)\/books\/([a-z0-9_-]+)\/">/g)].map(m => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(listed, expected, `${latestYear} 年の本の一覧が実データと食い違う`);
  assert.match(html, new RegExp(`${expected.length} 冊が ${latestYear} 年の刊行です`));
});

test('/new/ は index で sitemap に載り、フッターとポータルから辿れる', () => {
  assert.doesNotMatch(html, /noindex/);
  assert.match(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/route-taizen\.com\/new\/<\/loc>/);
  const portal = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok((portal.match(/href="\/new\/"/g) || []).length >= 2, 'ポータルの本文とフッターから /new/ へのリンクが要る');
});

test('X の F 型（新刊速報）の本文末尾に /new/ の URL が入る', async () => {
  const { postF } = await import('../build/gen-x-posts.mjs');
  const en = SUBJECTS.find(s => s.dir === 'english');
  const p = postF({ id: 'x', name: 'テスト本', pub: '出版社', year: 2026, stage: 'tango' }, en, loadSubjectData(ROOT, 'english').stages);
  assert.ok(p, '本文が作れない');
  assert.match(p.text, /https:\/\/route-taizen\.com\/new\/\s*$/);
});
