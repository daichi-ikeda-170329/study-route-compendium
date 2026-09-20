/**
 * 書籍ページの「そのページでしか成り立たない文」の検査。
 *
 * 2026-09-20 に AdSense がサイトを「有用性の低いコンテンツ」で 2 度目の却下をした。
 * 当時の書籍ページ 1,390 枚は、本文の 78% がページをまたいで一致する定型文で、
 * 1 枚あたりの固有の散文は約 200 字しか無かった。対応として
 *
 *   - 関連書カードに「そのページの本との差分」を出す（build/lib/compare-note.mjs）
 *   - 想定学習時間を日数に割った「1 周の期間」を出す（build/lib/pace.mjs）
 *   - 全ページに並んでいた定型文を短くする
 *
 * を入れた。ここでは各モジュールの単体と、**全体の共通率が戻っていないこと**を見る。
 * 定型文をまた足すと共通率が上がるので、そのときはこのテストが落ちる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { compareNote, cardNote } = await import('../build/lib/compare-note.mjs');
const { pacePlan, totalHours } = await import('../build/lib/pace.mjs');
const { SUBJECTS } = await import('../build/lib/extract.mjs');
const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');

/* ============================================================
   関連書カードの差分（compare-note.mjs）
   ============================================================ */

const BASE = { id: 'a', name: 'A', diff: 7, h: 100, desc: '基準の本。二文目は出さない。' };

test('難易度の差は段数で出る', () => {
  assert.match(compareNote(BASE, { diff: 7, h: 100 }), /^この本と同じ難易度/);
  assert.match(compareNote(BASE, { diff: 9, h: 100 }), /^この本より 2 つ上の難易度/);
  assert.match(compareNote(BASE, { diff: 4, h: 100 }), /^この本より 3 つ下の難易度/);
});

test('想定時間の差は時間で出る。近いときは「ほぼ同じ」', () => {
  assert.match(compareNote(BASE, { diff: 7, h: 160 }), /60h 多くかかる/);
  assert.match(compareNote(BASE, { diff: 7, h: 40 }), /60h 短く終わる/);
  assert.match(compareNote(BASE, { diff: 7, h: 110 }), /想定時間はほぼ同じ/);
});

test('難易度を持たない本（評価準備中）には差分を書かない', () => {
  assert.equal(compareNote(BASE, { name: 'B', h: 50 }), null);
  assert.equal(compareNote({ name: 'A', h: 50 }, { diff: 5, h: 50 }), null);
});

test('カードの文は「差分 + 相手の概要の 1 文目」で、概要の 2 文目以降は複製しない', () => {
  const note = cardNote(BASE, { diff: 8, h: 100, desc: '一文目です。二文目です。三文目です。' });
  assert.match(note, /^この本より 1 つ上の難易度で、想定時間はほぼ同じ。一文目です。$/);
});

test('差分を出せない相手でも、概要の 1 文目は残る', () => {
  assert.equal(cardNote(BASE, { desc: '概要だけ。あとは出さない。' }), '概要だけ。');
});

/* ============================================================
   1 周の期間（pace.mjs）
   ============================================================ */

test('総時間として読める hours だけを対象にする', () => {
  assert.deepEqual(totalHours({ hours: '100〜140h' }), [100, 140]);
  assert.equal(totalHours({ hours: '随時参照' }), null);
  assert.equal(totalHours({ hours: '通年並行' }), null);
  assert.equal(totalHours({ hours: '各巻20〜30h' }), null, '巻ごとの時間に 1 周の日数は出せない');
  assert.equal(totalHours({ hours: '毎日30分×3〜4か月' }), null);
  assert.equal(totalHours({}), null);
});

test('スペック表に出ている想定学習時間そのものは繰り返さない（docs/style-guide.md）', () => {
  const p = pacePlan({ hours: '100〜140h' });
  assert.doesNotMatch(p.sentence, /100〜140/, '表にある数字を文章で言い直さない');
  assert.match(p.sentence, /1 周できる計算です。$/);
});

test('期間は日数の大きさに合わせて 日・週間・か月 で書き分ける', () => {
  assert.match(pacePlan({ hours: '100〜140h' }).sentence, /1 日 1 時間なら 3〜5 か月/);
  assert.match(pacePlan({ hours: '20〜30h' }).sentence, /1 日 1 時間なら 3〜4 週間/);
  assert.match(pacePlan({ hours: '5〜8h' }).sentence, /1 日 30 分なら 10〜16 日/);
});

test('重い本ほど「1 日何時間」の刻みを多く出す', () => {
  assert.equal(pacePlan({ hours: '100〜140h' }).rows.length, 3);
  assert.equal(pacePlan({ hours: '20〜30h' }).rows.length, 2);
  assert.equal(pacePlan({ hours: '5〜8h' }).rows.length, 2);
});

test('1 周の期間を出せない本には節ごと出さない', () => {
  const noPace = SUBJECTS.flatMap(s => loadSubjectData(ROOT, s.dir).books
    .filter(b => !totalHours(b)).map(b => ({ dir: s.dir, id: b.id })));
  assert.ok(noPace.length, '総時間で書いていない本が 1 冊も無いなら、この検査は意味を失っている');
  for (const b of noPace.slice(0, 20)) {
    const html = fs.readFileSync(path.join(ROOT, b.dir, 'books', b.id, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /1 周にかかる期間の目安/, `${b.dir}/${b.id}: 日数に割れない本に期間を出している`);
  }
});

/* ============================================================
   共通率の回帰（定型文をまた足していないか）
   ============================================================ */

/** <main> の中の、12 字以上の文 */
function sentences(file) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return (m ? m[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\n|。/).map(s => s.trim()).filter(s => s.length >= 12);
}

test('書籍ページ本文の共通率が、AdSense に却下された当時（78%）まで戻っていない', () => {
  const files = SUBJECTS.flatMap(s => loadSubjectData(ROOT, s.dir).books
    .map(b => path.join(ROOT, s.dir, 'books', b.id, 'index.html')))
    .filter(f => fs.existsSync(f));
  assert.ok(files.length > 1000, `書籍ページが ${files.length} 枚しか無い。生成してから流す`);

  const freq = new Map();
  for (const f of files) for (const s of new Set(sentences(f))) freq.set(s, (freq.get(s) || 0) + 1);

  let own = 0, all = 0;
  for (const f of files) {
    for (const s of sentences(f)) { all += s.length; if (freq.get(s) <= 2) own += s.length; }
  }
  const ratio = own / all;
  /* 2026-09-21 の実測は 25.2%（却下当時は 21.9%）。20% を割ったら、
     どこかに定型文を足している。build/lib/compare-note.mjs の経緯を読むこと */
  assert.ok(ratio >= 0.20,
    `固有率が ${(ratio * 100).toFixed(1)}% に落ちている（却下当時 21.9%／対応後 25.2%）。全ページに同じ文を足していないか確かめる`);
});
