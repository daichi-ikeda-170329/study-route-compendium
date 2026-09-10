/**
 * 書籍ページの「同じ役割・同じレベルの参考書」「この本のあとに進む参考書」の選び方
 * （build/lib/book-links.mjs）の検査。
 *
 * 2026-09-10 まで難易度の昇順だけで並べていたため、The Rules 4（早慶・旧帝・東大京大向け）の
 * 次に「阪大の英語20カ年」「私立医大の英語」が先頭に来ていた。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { pickAlternatives, pickNext, linkScore, laterInRoutes, LINK_SCORE } = await import('../build/lib/book-links.mjs');
const { sharesTag, tagParts } = await import('../build/lib/unitags.mjs');

function next(dir, id) {
  const d = loadSubjectData(ROOT, dir);
  const b = d.books.find(x => x.id === id);
  assert.ok(b, `${dir}/${id} が無い`);
  const alts = pickAlternatives(b, d.books);
  return { b, d, alts, next: pickNext(b, d.books, alts, dir, d.routes) };
}

test('tagParts は括弧書きを外して「・」で分ける', () => {
  assert.deepEqual(tagParts('東大・京大'), ['東大', '京大']);
  assert.deepEqual(tagParts('早慶（文系）'), ['早慶']);
});

test('The Rules 4 の「あとに進む」先頭 3 冊に早慶・東大の過去問が入る', () => {
  const { b, next: n } = next('english', 'rules4');
  const top3 = n.list.slice(0, 3).map(x => x.id);
  assert.ok(['waseda-eigo', 'keio-eigo', 'todai25'].some(id => top3.includes(id)),
    `先頭 3 冊: ${top3.join(', ')}`);
  assert.ok(sharesTag(b, n.list[0]) || n.list.slice(0, 3).some(x => sharesTag(b, x)), 'unis の重なる本が先頭に無い');
});

test('同じ役割の上位と次の段階の本は、それぞれスコアの高い順', () => {
  for (const [dir, id] of [['english', 'rules4'], ['english', 'sistan'], ['math', 'ao']]) {
    const { b, d, next: n } = next(dir, id);
    const later = laterInRoutes(b.id, d.routes);
    const same = n.list.filter(x => x.stage === b.stage);
    const other = n.list.filter(x => x.stage !== b.stage);
    for (const part of [same, other]) {
      for (let i = 1; i < part.length; i++) {
        assert.ok(linkScore(b, part[i - 1], later) >= linkScore(b, part[i], later),
          `${dir}/${id}: ${part[i - 1].id} より ${part[i].id} のスコアが高い`);
      }
    }
  }
});

test('ルート上の枠（志望校の過去問）は減点される', () => {
  const b = { id: 'x', unis: [], bunri: 'both' };
  assert.equal(linkScore(b, { id: 'p', recordType: 'routePlaceholder' }, new Set()), LINK_SCORE.placeholder);
});

test('laterInRoutes は同じルートの後ろの段だけを返す', () => {
  const routes = { t: { bun: { omni: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], quick: [{ id: 'b' }, { id: 'd' }] }, para: { bun: [{ id: 'z' }] } } };
  assert.deepEqual([...laterInRoutes('b', routes)].sort(), ['c', 'd']);
  assert.deepEqual([...laterInRoutes('z', routes)], [], '並行枠はルートの段として数えない');
});

test('横の選択肢は unis の重なる本を先に置く', () => {
  const { b, alts } = next('english', 'rules4');
  const firstNoTag = alts.findIndex(x => !sharesTag(b, x));
  if (firstNoTag >= 0) {
    assert.ok(alts.slice(firstNoTag).every(x => !sharesTag(b, x)), 'タグの重ならない本のあとに重なる本がある');
  }
});

test('書籍ページの「あとに進む」にも同じ並びが出る', () => {
  const html = fs.readFileSync(path.join(ROOT, 'english/books/rules4/index.html'), 'utf8');
  const i = html.indexOf('この本のあとに進む');
  assert.ok(i > 0, '「この本のあとに進む」節が無い');
  const ids = [...html.slice(i).matchAll(/<a class="bcard" href="\/english\/books\/([a-z0-9-]+)\/"/g)].slice(0, 3).map(m => m[1]);
  assert.ok(['waseda-eigo', 'keio-eigo', 'todai25'].some(id => ids.includes(id)), `ページの先頭 3 冊: ${ids.join(', ')}`);
});

test('書籍ページの見出しは 基本情報 → 状態を記録する → どんな人に向いているか の順（仕様書 2.5）', () => {
  for (const rel of ['english/books/rules4/index.html', 'math/books/ao/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const h2 = [...html.matchAll(/<h2 class="sec">([^<]*)<\/h2>/g)].map(m => m[1]);
    assert.deepEqual(h2.slice(0, 3), ['基本情報', 'この参考書の状態を記録する', 'どんな人に向いているか'], `${rel}: ${h2.join(' / ')}`);
  }
});

test('2 冊比較ページは noindex で sitemap に載らず、書籍ページの横の選択肢から比較へ辿れる（仕様書 4.2）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'compare/index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.match(html, /window\.RT_COMPARE_ASSETS=/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), /\/compare\//);
  const book = fs.readFileSync(path.join(ROOT, 'english/books/rules4/index.html'), 'utf8');
  assert.match(book, /<a class="bcmp__go" href="\/compare\/\?a=english:rules4&amp;b=english:[a-z0-9-]+">この本と比較<\/a>/);
});
