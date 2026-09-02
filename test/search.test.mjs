/**
 * 全ページ共通の参考書検索のテスト。
 *
 *   node --test test/search.test.mjs
 *
 * 索引（assets/js/book-index.js）は build/generate-search.mjs が作る生成物なので、
 * 直す前に必ず流し直すこと。ここでは「生成物と検索の噛み合わせ」を確かめる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from '../build/lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* search.js は素のブラウザ向けスクリプト。document が無い環境では DOM に触らない */
const RTSearch = require(path.join(ROOT, 'assets/js/search.js'));
const INDEX = (() => {
  const g = { window: null };
  g.window = g;
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/book-index.js'), 'utf8');
  new Function('window', src)(g);
  return g.RT_BOOK_INDEX;
})();

const { normalize } = RTSearch;

/** search.js の search() と同じ突き合わせ。索引そのものを入力にする */
const HAY = INDEX.books.map((b) => `${normalize(b[2])} ${normalize(b[3])} ${b[5]}`);
function find(q) {
  const terms = String(q).split(/[\s　]+/).map(normalize).filter(Boolean);
  if (!terms.length) return [];
  const head = [];
  const rest = [];
  INDEX.books.forEach((b, i) => {
    if (!terms.every((t) => HAY[i].includes(t))) return;
    (normalize(b[2]).indexOf(terms[0]) === 0 ? head : rest).push(b);
  });
  return head.concat(rest);
}
const names = (q) => find(q).map((b) => `${INDEX.subjects[b[0]][0]}:${b[1]}`);

/* ============================================================
   索引そのもの
   ============================================================ */

test('索引に全科目ぶんの全書籍が入っている', () => {
  assert.equal(INDEX.v, 1);
  assert.equal(INDEX.subjects.length, SUBJECTS.length);
  const perSubject = {};
  for (const b of INDEX.books) perSubject[INDEX.subjects[b[0]][0]] = (perSubject[INDEX.subjects[b[0]][0]] || 0) + 1;
  for (const [dir] of INDEX.subjects) assert.ok(perSubject[dir] > 0, `${dir} の本が 1 冊も無い`);
  assert.ok(INDEX.books.length > 1000, `冊数が少なすぎる: ${INDEX.books.length}`);
});

test('索引の id は科目の中で一意で、URL に使える形をしている', () => {
  const seen = new Set();
  for (const b of INDEX.books) {
    const key = `${b[0]}:${b[1]}`;
    assert.ok(!seen.has(key), `id が重複している: ${key}`);
    seen.add(key);
    assert.match(b[1], /^[a-z0-9][a-z0-9_-]*$/i, `URL に使えない id: ${b[1]}`);
  }
});

test('索引の追加語は正規化済みで持たれている', () => {
  for (const b of INDEX.books) {
    for (const term of b[5].split(' ')) {
      if (!term) continue;
      assert.equal(normalize(term), term, `${b[1]} の追加語が正規化されていない: ${term}`);
    }
  }
});

/* ============================================================
   正規化
   ============================================================ */

test('書き方の違いが同じ形に落ちる', () => {
  const same = [
    ['ポレポレ', 'ぽれぽれ'],
    ['Next Stage', 'nextstage'],
    ['Next Stage', 'NEXT　STAGE'],
    ['ＬＥＡＰ', 'leap'],
    ['1対1対応の演習', '1対1対応の演習 '],
  ];
  for (const [a, b] of same) assert.equal(normalize(a), normalize(b), `${a} と ${b} が別の形になった`);
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
});

/* ============================================================
   引けること
   ============================================================ */

test('書名そのままで引ける', () => {
  assert.ok(names('ポレポレ').includes('english:porepore'));
  assert.ok(names('青チャート').includes('math:ao'));
  assert.ok(names('物理のエッセンス').includes('science:essence-rikigaku'));
});

test('あだ名で引ける', () => {
  const cases = [
    ['ネクステ', 'english:nextstage'],
    ['シス単', 'english:sistan'],
    ['速単', 'english:sokutan-hisshu'],
    ['やておき700', 'english:yatte700'],
    ['青チャ', 'math:ao'],
    ['フォーカスゴールド', 'math:fg'],
    ['一対一', 'math:taio11'],
    ['標問', 'math:hyomon'],
    ['重問', 'science:juyo-mondaishu'],
    ['はじてい', 'japanese:tomii-bunpo'],
    ['ヴィンテージ', 'english:vintage'],
  ];
  for (const [q, id] of cases) {
    assert.ok(names(q).includes(id), `「${q}」で ${id} が出てこない`);
  }
});

test('ひらがな・半角全角の違いを吸収する', () => {
  assert.ok(names('ぽれぽれ').includes('english:porepore'));
  assert.ok(names('ねくすて').includes('english:nextstage'));
  assert.ok(names('ＬＥＡＰ').includes('english:leap'));
  assert.ok(names('nextstage').includes('english:nextstage'));
});

test('空白区切りは絞り込みになる（すべての語を含む本だけ出る）', () => {
  const both = names('ターゲット 1900');
  assert.ok(both.includes('english:target1900'));
  assert.ok(!both.includes('english:target1200'), '絞り込めていない');
});

test('該当しない入力では何も返さない', () => {
  assert.equal(find('').length, 0);
  assert.equal(find('　 ').length, 0);
  assert.equal(find('zzzzこんな本はない').length, 0);
});

/* ============================================================
   あだ名辞書
   ============================================================ */

test('aliases.json のすべての key が実在する書籍を指している', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/aliases.json'), 'utf8'));
  const ids = new Set(INDEX.books.map((b) => `${INDEX.subjects[b[0]][0]}:${b[1]}`));
  for (const key of Object.keys(raw.aliases)) {
    assert.ok(ids.has(key), `aliases.json が存在しない書籍を指している: ${key}`);
  }
});

test('aliases.json に載せたあだ名は、その本を実際に引ける', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/aliases.json'), 'utf8'));
  for (const [key, list] of Object.entries(raw.aliases)) {
    for (const alias of list) {
      assert.ok(names(alias).includes(key), `「${alias}」で ${key} が出てこない（索引を作り直したか確認する）`);
    }
  }
});
