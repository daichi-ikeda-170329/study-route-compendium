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
  const listed = [...html.matchAll(/<li><a href="\/([a-z]+)\/books\/([a-z0-9_-]+)\/">/g)].map(m => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(listed, prov);
  if (!prov.length) assert.match(html, /いま評価待ちの本はありません。/);
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
