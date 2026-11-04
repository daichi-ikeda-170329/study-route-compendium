/**
 * 書籍ページの「このページの目次」（build/lib/book-toc.mjs）。
 * 見出しに id が振られ、札が短い呼び名で並ぶこと、節が少ないページには出さないこと、
 * 目次が更新日の材料に入らないこと（足しただけで 1,432 冊の日付が進まない）を確かめる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addSectionNav } from '../build/lib/book-toc.mjs';
import { mainText } from '../build/lib/updated.mjs';

const page = (titles) => `<main><article><div class="bk-hero">x</div>\n    ${titles.map(t => `<section class="block"><h2 class="sec">${t}</h2><p>本文</p></section>`).join('\n')}</article></main>`;

test('節が 4 つ以上なら、id 付きの見出しと短い呼び名の札が並ぶ', () => {
  const out = addSectionNav(page(['基本情報', 'どんな人に向いているか', '使い方の手順', '購入する']));
  assert.match(out, /<h2 class="sec" id="s-1">基本情報<\/h2>/);
  assert.match(out, /<h2 class="sec" id="s-4">購入する<\/h2>/);
  assert.match(out, /<nav class="bk-secnav" aria-label="このページの目次"><a href="#s-1">基本情報<\/a><a href="#s-2">向いている人<\/a><a href="#s-3">使い方<\/a><a href="#s-4">購入<\/a><\/nav>/);
  assert.ok(out.indexOf('bk-secnav') < out.indexOf('<section class="block">'), '目次は最初の節より前');
});

test('節が 3 つ以下なら目次は出さない', () => {
  const out = addSectionNav(page(['基本情報', '購入する']));
  assert.doesNotMatch(out, /bk-secnav/);
});

test('目次を足しても更新日の材料（<main> の文字）は変わらない', () => {
  const src = page(['基本情報', 'どんな人に向いているか', '使い方の手順', '購入する']);
  assert.equal(mainText(addSectionNav(src)), mainText(src));
});
