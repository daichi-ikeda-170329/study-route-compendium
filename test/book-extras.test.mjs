/**
 * 書籍ページの本文を厚くする任意項目（books.json の pages / media / toc / howto / finish / editions）と、
 * 「この本の前に置く本」の検査（仕様書 3.1）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { validateSubjectData, MEDIA_VALUES, HOWTO_PHASES } = await import('../build/lib/validate-subject-data.mjs');
const { pickPrev } = await import('../build/lib/book-links.mjs');

const en = loadSubjectData(ROOT, 'english');
const withBook = (patch) => ({ ...en, books: en.books.map(b => (b.id === 'rules4' ? { ...b, ...patch } : b)) });

test('toc に文字列を入れると形の検証で落ちる', () => {
  const p = validateSubjectData('english', withBook({ toc: '第1章 ルール' }));
  assert.ok(p.some(x => /rules4\.toc: array のはずが string/.test(x)), p.join('\n'));
});

test('media・howto・editions は決まった値と形だけを通す', () => {
  assert.ok(validateSubjectData('english', withBook({ media: ['CD'] })).some(x => /media/.test(x)));
  assert.ok(validateSubjectData('english', withBook({ howto: [{ phase: '4周目', do: 'x' }] })).some(x => /phase/.test(x)));
  assert.ok(validateSubjectData('english', withBook({ editions: [{ year: '2021', note: '初版' }] })).some(x => /editions/.test(x)));
  assert.ok(validateSubjectData('english', withBook({ toc: Array(13).fill('章') })).some(x => /13 項目/.test(x)));
  assert.deepEqual(validateSubjectData('english', withBook({
    media: [MEDIA_VALUES[0]], toc: ['第1章'], howto: [{ phase: HOWTO_PHASES[0], do: '読む' }],
    finish: '終わり', editions: [{ year: 2021, note: '初版' }], pages: 200,
  })), [], '正しい形なら問題なし');
});

test('The Rules 4 の「この本の前に置く本」に rules3 か yatte700 が出る', () => {
  const prev = pickPrev(en.books.find(b => b.id === 'rules4'), en.books, en.routes, en.tiers).map(x => x.book.id);
  assert.ok(prev.includes('rules3') || prev.includes('yatte700'), prev.join(', '));
  const html = fs.readFileSync(path.join(ROOT, 'english/books/rules4/index.html'), 'utf8');
  assert.match(html, /<h2 class="sec">この本の前に置く本<\/h2>/);
  assert.match(html, /href="\/english\/books\/(rules3|yatte700)\/"/);
});

test('ルートに載っていない本には「この本の前に置く本」を出さない', () => {
  const inRoute = new Set();
  for (const node of Object.values(en.routes)) for (const [k, v] of Object.entries(node)) {
    if (!v || Array.isArray(v) || k === 'para' || k === 'final') continue;
    for (const p of ['omni', 'quick']) (v[p] || []).forEach(s => inRoute.add(s.id));
  }
  const outside = en.books.find(b => !inRoute.has(b.id) && b.recordType !== 'routePlaceholder');
  assert.ok(outside, 'ルート外の本が見つからない');
  assert.deepEqual(pickPrev(outside, en.books, en.routes, en.tiers), []);
  const html = fs.readFileSync(path.join(ROOT, `english/books/${outside.id}/index.html`), 'utf8');
  assert.doesNotMatch(html, /この本の前に置く本/);
});

test('任意項目を持つ本には新しい節が出て、持たない本には出ない', () => {
  for (const [dir, id] of [['english', 'rules4'], ['english', 'sistan'], ['english', 'porepore'], ['math', 'ao']]) {
    const b = loadSubjectData(ROOT, dir).books.find(x => x.id === id);
    const html = fs.readFileSync(path.join(ROOT, `${dir}/books/${id}/index.html`), 'utf8');
    if (b.toc) assert.match(html, /<h2 class="sec">構成<\/h2>/, `${id}: 構成が無い`);
    if (b.howto) assert.match(html, /<h2 class="sec">使い方の手順<\/h2>/, `${id}: 使い方の手順が無い`);
    if (b.finish) assert.match(html, /<h2 class="sec">終わりの基準<\/h2>/, `${id}: 終わりの基準が無い`);
    if (b.editions) assert.match(html, /<h2 class="sec">改訂の履歴<\/h2>/, `${id}: 改訂の履歴が無い`);
    if (typeof b.pages === 'number') assert.match(html, /<dt>ページ数<\/dt>/, `${id}: ページ数が無い`);
    if (b.toc && b.howto) assert.doesNotMatch(html, /には \d+ 冊を収録しています/, `${id}: 定型の位置づけ文が残っている`);
  }
  const plain = en.books.find(b => !b.toc && !b.howto && !b.finish && !b.editions && b.pages === undefined && !b.media && !b.provisional);
  const html = fs.readFileSync(path.join(ROOT, `english/books/${plain.id}/index.html`), 'utf8');
  for (const h of ['構成', '使い方の手順', '終わりの基準', '改訂の履歴']) assert.doesNotMatch(html, new RegExp(`<h2 class="sec">${h}</h2>`));
  assert.doesNotMatch(html, /<dt>ページ数<\/dt>|<dt>付属<\/dt>/);
});
