/**
 * build/submit-indexnow.mjs の差分送信の検査。
 *
 * デプロイのたびに全 URL を送ると Bing が「IndexNow is in batch mode」と判定するので、
 * CI は push で変わったページだけを送る。ここでは git の差分から URL を求める部分だけを見る
 * （送信はしない）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { urlsFromChangedFiles } from '../build/submit-indexnow.mjs';

const O = 'https://route-taizen.com';
const sitemap = [`${O}/`, `${O}/english/`, `${O}/math/books/aochart/`, `${O}/new/`];

test('変更・追加したページの index.html を URL に直す', () => {
  const diff = ['M\tindex.html', 'M\tenglish/index.html', 'A\tmath/books/aochart/index.html'].join('\n');
  assert.deepEqual(urlsFromChangedFiles(diff, sitemap, O), [`${O}/`, `${O}/english/`, `${O}/math/books/aochart/`]);
});

test('ページ以外の変更と sitemap に無いページは送らない', () => {
  const diff = ['M\t404.html', 'M\tassets/css/site.css', 'M\tsitemap.xml', 'M\tdata/subjects/math/books.json', 'M\tdist/index.html'].join('\n');
  assert.deepEqual(urlsFromChangedFiles(diff, sitemap, O), []);
});

test('削除したページは sitemap に無くても送る', () => {
  assert.deepEqual(urlsFromChangedFiles('D\tmath/books/old/index.html\n', sitemap, O), [`${O}/math/books/old/`]);
});

test('リネームは旧 URL を削除、新 URL を追加として扱う', () => {
  assert.deepEqual(
    urlsFromChangedFiles('R100\tguides/old/index.html\tnew/index.html', sitemap, O),
    [`${O}/guides/old/`, `${O}/new/`],
  );
});
