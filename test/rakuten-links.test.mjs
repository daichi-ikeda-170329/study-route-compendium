import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rakutenURL } = require('../assets/js/subject-common.js');

test('図鑑の楽天リンクは月刊誌を雑誌ジャンルへ、ISBNがある本を書籍ジャンルへ送る', () => {
  for (const [book, genre, query] of [
    [{ name: '月刊 大学への数学', official: '大学への数学(東京出版・月刊誌)', style: '月刊演習' }, '007', '大学への数学'],
    [{ name: '化学 上級問題精講', isbn13: '9784010355343', style: '問題集' }, '001', '9784010355343'],
  ]) {
    const dest = new URL(new URL(rakutenURL(book, 'test-id')).searchParams.get('pc'));
    assert.equal(dest.hostname, 'books.rakuten.co.jp');
    assert.equal(dest.searchParams.get('g'), genre);
    assert.equal(dest.searchParams.get('sitem'), query);
  }
});
