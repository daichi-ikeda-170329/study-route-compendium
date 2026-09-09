/**
 * 詳細検索の索引（v2）と絞り込みの規則を固定する。
 *
 * ## いちばん守りたいこと — 欠損を「該当なし」にしない
 *
 * 著者は全 1,390 冊のうち 7 割以上で分かっていない。刊行年が無い本もある。
 * **その項目で絞り込んでいないときは、分かっていない本も結果に含める。**
 * ここが崩れると、「著者で絞っていないのに、著者が判明している本しか出ない」
 * という、利用者から見て理由の分からない欠落が起きる。
 *
 * ## 既存の索引を膨らませない
 *
 * ヘッダー検索が使う `assets/js/book-index.js`（v1）はそのまま。
 * サイズの歯止めは `test/performance-budget.test.mjs` が持つ。
 * ここでは「v1 に絞り込み用の項目が入っていないこと」を見る。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';
import { SUBJECTS } from '../build/lib/extract.mjs';
import { loadSubjectData } from '../build/lib/load-subject-data.mjs';

const require = createRequire(import.meta.url);
const C = require(path.join(ROOT, 'assets/js/search-core.js'));

const INDEX_PATH = path.join(ROOT, 'assets/generated/search-facets.json');
const HAS_INDEX = fs.existsSync(INDEX_PATH);
const skip = HAS_INDEX ? undefined : { skip: '索引がまだ無い（npm run build を先に流す）' };
const index = HAS_INDEX ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) : null;

/* ============================================================
   索引そのもの
   ============================================================ */

test('索引に全 1,390 冊が 1 回ずつ入っている', skip, () => {
  let expected = 0;
  const ids = new Set();
  for (const s of SUBJECTS) {
    const d = loadSubjectData(ROOT, s.dir);
    expected += d.books.length;
    for (const b of d.books) ids.add(`${s.dir}:${b.id}`);
  }
  assert.equal(index.books.length, expected, `索引が ${index.books.length} 冊、実データが ${expected} 冊`);

  const seen = new Set();
  const dup = [];
  for (const b of index.books) {
    const key = `${index.subjects[b.s].id}:${b.id}`;
    if (seen.has(key)) dup.push(key);
    seen.add(key);
  }
  assert.deepEqual(dup, [], `索引に重複がある:\n${dup.slice(0, 10).join('\n')}`);
  assert.deepEqual([...seen].sort(), [...ids].sort(), '索引と実データの顔ぶれが違う');
});

test('schemaVersion は 3（v1 の索引と別物であることを明示する）', skip, () => {
  assert.equal(index.schemaVersion, 3);
});

/**
 * 2026-09-09 に「情報の確認状態」の絞り込みと結果カードのバッジを /search/ から
 * 外し、索引からも `vs` と `statusLabel` を落とした（v3）。収録のほとんどが同じ
 * 「一部情報を確認中」で、1 冊ごとの違いを伝えないまま画面と転送量を取っていた
 * （内訳は docs/data-quality.md）。
 *
 * 台帳（build/data/verification.json）は正本として残り、確かめた値だけを
 * 構造化データに出す出し分けも変えていない（test/verification.test.mjs が見る）。
 * ここで見るのは「画面向けの索引に持ち出していないこと」だけ。
 */
test('索引に確認状態を持ち出していない', skip, () => {
  assert.equal(index.statusLabel, undefined, '索引に statusLabel が残っている');
  const withVs = index.books.filter(b => 'vs' in b);
  assert.deepEqual(withVs.slice(0, 5).map(b => b.id), [],
    `${withVs.length} 冊に vs（確認状態）が残っている`);
});

test('分からない項目を 0 や空文字で埋めていない', skip, () => {
  const bad = [];
  for (const b of index.books) {
    if (b.pub === '') bad.push(`${b.id}: pub が空文字`);
    if (b.diff === 0) bad.push(`${b.id}: diff が 0`);
    if (b.year === 0) bad.push(`${b.id}: year が 0`);
    if (b.au && !Array.isArray(b.au)) bad.push(`${b.id}: au が配列でない`);
    if (b.diff === null && b.db !== null) bad.push(`${b.id}: 難易度が無いのに帯が付いている`);
    if (b.year === null && b.yb !== null) bad.push(`${b.id}: 刊行年が無いのに帯が付いている`);
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.join('\n'));
});

test('著者が分かっていない本が、素直に空配列で入っている', skip, () => {
  const unknown = index.books.filter(b => !b.au.length).length;
  assert.ok(unknown > 0, '著者不明の本が 0 件。埋めてしまっていないか確かめる');
  assert.ok(unknown < index.books.length, '全件が著者不明。authors.json を読めていない');
});

test('ヘッダー検索の索引（v1）に絞り込み用の項目が入っていない', () => {
  const v1 = fs.readFileSync(path.join(ROOT, 'assets/js/book-index.js'), 'utf8');
  assert.match(v1, /"v":1/, 'v1 の版が変わっている');
  for (const key of ['"diffBands"', '"yearBands"', '"authors"', '"publishers"']) {
    assert.ok(!v1.includes(key), `v1 に ${key} が入っている。絞り込み用の項目は詳細検索の索引へ入れる`);
  }
});

/* ============================================================
   絞り込みの規則
   ============================================================ */

/** 小さな索引を組み立てる。実データに依存せず規則だけを見る */
function tinyIndex() {
  return {
    schemaVersion: 3,
    subjects: [{ id: 'math', label: '数学' }, { id: 'english', label: '英語' }],
    diffBands: [{ id: 'basic', label: '基礎' }, { id: 'adv', label: '応用' }],
    yearBands: [{ id: 'y2024', label: '2024年以降' }],
    publishers: ['旺文社'],
    authors: ['関正生'],
    books: [
      { s: 0, id: 'full', n: '全部そろっている本', pub: '旺文社', au: ['関正生'], stage: 'core', diff: 3, db: 'basic', year: 2024, yb: 'y2024', hen: [40, 55], ser: null, rt: 'book' },
      { s: 0, id: 'noauthor', n: '著者が分からない本', pub: '旺文社', au: [], stage: 'core', diff: 7, db: 'adv', year: 2024, yb: 'y2024', hen: null, ser: null, rt: 'book' },
      { s: 1, id: 'nodiff', n: '難易度が無い本', pub: null, au: [], stage: null, diff: null, db: null, year: null, yb: null, hen: null, ser: null, rt: 'book' },
    ],
  };
}

test('何も絞らなければ全部出る（欠損も含む）', () => {
  const r = C.filterBooks(tinyIndex(), C.emptyQuery());
  assert.equal(r.books.length, 3);
});

test('著者で絞っていないときに、著者不明の本を落とさない', () => {
  const idx = tinyIndex();
  const r = C.filterBooks(idx, { publishers: ['旺文社'] });
  assert.deepEqual(r.books.map(b => b.id), ['full', 'noauthor'],
    '出版社で絞っただけなのに、著者不明の本が消えた');
});

test('著者で絞ると、その著者の本だけになる', () => {
  const r = C.filterBooks(tinyIndex(), { authors: ['関正生'] });
  assert.deepEqual(r.books.map(b => b.id), ['full']);
});

test('「著者が分かっていない」だけを選べる', () => {
  const r = C.filterBooks(tinyIndex(), { authors: [C.UNKNOWN] });
  assert.deepEqual(r.books.map(b => b.id), ['noauthor', 'nodiff']);
});

test('「不明」と実在の値を同時に選べる', () => {
  const r = C.filterBooks(tinyIndex(), { authors: ['関正生', C.UNKNOWN] });
  assert.deepEqual(r.books.map(b => b.id), ['full', 'noauthor', 'nodiff']);
});

test('出版社が不明の本を「不明」で選べる', () => {
  const r = C.filterBooks(tinyIndex(), { publishers: [C.UNKNOWN] });
  assert.deepEqual(r.books.map(b => b.id), ['nodiff']);
});

test('難易度が無い本を「不明・確認中」で選べる', () => {
  const r = C.filterBooks(tinyIndex(), { diffBands: [C.UNKNOWN] });
  assert.deepEqual(r.books.map(b => b.id), ['nodiff']);
  const adv = C.filterBooks(tinyIndex(), { diffBands: ['adv'] });
  assert.deepEqual(adv.books.map(b => b.id), ['noauthor']);
});

test('科目・出版社・難易度・刊行年を組み合わせられる', () => {
  const idx = tinyIndex();
  assert.deepEqual(
    C.filterBooks(idx, { subjects: ['math'], diffBands: ['basic'] }).books.map(b => b.id),
    ['full']);
  assert.deepEqual(
    C.filterBooks(idx, { subjects: ['math'], diffBands: ['adv'], yearBands: ['y2024'] }).books.map(b => b.id),
    ['noauthor']);
  assert.deepEqual(
    C.filterBooks(idx, { subjects: ['math'], publishers: ['旺文社'], authors: ['関正生'] }).books.map(b => b.id),
    ['full']);
  assert.deepEqual(
    C.filterBooks(idx, { subjects: ['english'], publishers: ['旺文社'] }).books.map(b => b.id),
    [], '両方に合う本が無いのに結果が出た');
});

/* 知らないキーを渡しても結果が変わらないこと。statuses は v3 で消したので、
   古いブックマークや外部からの呼び出しで残っていても素通りする */
test('知らない絞り込みキーは無視する', () => {
  const idx = tinyIndex();
  assert.deepEqual(
    C.filterBooks(idx, { statuses: ['verified'] }).books.map(b => b.id),
    ['full', 'noauthor', 'nodiff'], '消したはずの statuses が効いている');
});

test('検索語は書名・出版社・著者に当たり、全角と大小の違いを吸収する', () => {
  const idx = tinyIndex();
  assert.deepEqual(C.filterBooks(idx, { q: '旺文社' }).books.map(b => b.id), ['full', 'noauthor']);
  assert.deepEqual(C.filterBooks(idx, { q: '関正生' }).books.map(b => b.id), ['full']);
  assert.deepEqual(C.filterBooks(idx, { q: '難易度' }).books.map(b => b.id), ['nodiff']);
  assert.equal(C.norm('ＡＢＣ'), 'abc');
  assert.equal(C.norm('英文法 ポラリス・1'), '英文法ポラリス1');
});

test('欠損の件数を結果と一緒に返す（「無い」と「分からない」を分ける）', () => {
  const r = C.filterBooks(tinyIndex(), C.emptyQuery());
  assert.equal(r.unknownCounts.authors, 2);
  assert.equal(r.unknownCounts.publishers, 1);
  assert.equal(r.unknownCounts.diffBands, 1);
  assert.equal(r.unknownCounts.yearBands, 1);
});

/* ============================================================
   並べ替え
   ============================================================ */

test('並べ替えは決定的で、欠損は末尾へ行く', () => {
  const idx = tinyIndex();
  const all = idx.books;
  assert.deepEqual(C.sortBooks(all, 'diff').map(b => b.id), ['full', 'noauthor', 'nodiff'],
    '難易度順で、難易度が無い本が末尾に来ていない');
  assert.deepEqual(C.sortBooks(all, 'year').map(b => b.id).slice(-1), ['nodiff'],
    '刊行年順で、刊行年が無い本が末尾に来ていない');
  // 同じ入力なら同じ順
  assert.deepEqual(C.sortBooks(all, 'name').map(b => b.id), C.sortBooks(all, 'name').map(b => b.id));
});

/* ============================================================
   実データでの通し
   ============================================================ */

test('実データでも、絞らなければ全冊が出る', skip, () => {
  const r = C.filterBooks(index, C.emptyQuery());
  assert.equal(r.books.length, index.books.length);
});

test('実データで、科目の絞り込みが冊数と合う', skip, () => {
  for (const s of SUBJECTS) {
    const want = loadSubjectData(ROOT, s.dir).books.length;
    const got = C.filterBooks(index, { subjects: [s.dir] }).books.length;
    assert.equal(got, want, `${s.dir}: 索引 ${got} 冊 / 実データ ${want} 冊`);
  }
});

test('実データで、同名の本をシリーズ・出版社・巻で見分けられる', skip, () => {
  // 同じ書名が複数ある本は、出版社・著者・分野・刊行年・シリーズのどれかで違いが出るはず
  const byName = new Map();
  for (const b of index.books) {
    const k = b.n;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(b);
  }
  const indistinguishable = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const keys = new Set(list.map(b => JSON.stringify([
      index.subjects[b.s].id, b.pub, (b.au || []).join('・'), b.sub, b.year, b.ser,
    ])));
    if (keys.size !== list.length) indistinguishable.push(`${name}（${list.length} 件）`);
  }
  assert.deepEqual(indistinguishable.slice(0, 10), [],
    `画面で見分けられない同名の本がある:\n${indistinguishable.join('\n')}`);
});
