/**
 * 確認状態（verification）の検査。
 *
 * 「（要確認）」という文字列を本文に混ぜて管理していると、集計も検査もできず、
 * 書き換えたときに消えたことにも気づけない。状態をデータとして持つようにしたので、
 * ここでは **その状態が嘘をついていないか** を見る。
 *
 * とくに、出典 URL と確認日を持たないものを verified と名乗らせない。
 * verified と「現物を確認した」を同じ意味にしない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SUBJECTS } from '../build/lib/extract.mjs';
import { loadSubjectData } from '../build/lib/load-subject-data.mjs';
import { isPlaceholder } from '../build/lib/record-type.mjs';
import {
  verificationOf, loadVerification, verifiedFieldIsWellFormed,
  STATUSES, STATUS_LABEL, FACT_FIELDS, UNVERIFIED_MARK, verificationRows,
} from '../build/lib/verification.mjs';
import { ROOT } from './helpers.mjs';

const DATA = SUBJECTS.map(s => ({ sub: s, ...loadSubjectData(ROOT, s.dir) }));
const ALL = DATA.flatMap(d => d.books.map(b => ({ b, dir: d.sub.dir })));
const LEDGER = loadVerification();

test('台帳の状態は許可された 4 つだけ', () => {
  const bad = [];
  for (const [k, r] of Object.entries(LEDGER.records)) {
    if (!STATUSES.includes(r.status)) bad.push(`${k}: ${r.status}`);
    for (const [f, v] of Object.entries(r.fields || {})) {
      if (!STATUSES.includes(v.status)) bad.push(`${k}.${f}: ${v.status}`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), [], bad.join('\n'));
});

test('verified を名乗る項目は、出典 URL と確認日の両方を持つ', () => {
  const bad = [];
  for (const [k, r] of Object.entries(LEDGER.records)) {
    for (const [f, v] of Object.entries(r.fields || {})) {
      if (!verifiedFieldIsWellFormed(v)) bad.push(`${k}.${f}`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), [], `出典か確認日が無いのに verified:\n${bad.slice(0, 20).join('\n')}`);
});

test('出典 URL は https だけ', () => {
  const bad = [];
  for (const [k, r] of Object.entries(LEDGER.records)) {
    for (const [f, v] of Object.entries(r.fields || {})) {
      if (v.sourceUrl && !/^https:\/\//.test(v.sourceUrl)) bad.push(`${k}.${f}: ${v.sourceUrl}`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('本文に「要確認 / 未確認 / 不明」がある項目を verified にしていない', () => {
  const bad = [];
  for (const { b, dir } of ALL) {
    const v = verificationOf(dir, b);
    for (const f of FACT_FIELDS) {
      const raw = b[f];
      if (raw && UNVERIFIED_MARK.test(String(raw)) && v.fields[f].status === 'verified') {
        bad.push(`${dir}:${b.id}.${f}`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('現物確認は 1 件も自動で立っていない（運営者が明示したときだけ）', () => {
  const on = ALL.filter(({ b, dir }) => verificationOf(dir, b).physicalReview);
  assert.equal(on.length, 0,
    `現物確認していないのに physicalReview が立っている: ${on.map(x => `${x.dir}:${x.b.id}`).join(', ')}`);
});

test('ルート上の枠は確認の対象外として扱う', () => {
  for (const { b, dir } of ALL) {
    if (!isPlaceholder(b)) continue;
    const v = verificationOf(dir, b);
    assert.equal(v.status, 'notApplicable', `${dir}:${b.id} が notApplicable でない`);
  }
});

test('すべてのレコードが 4 つの状態のどれかに入る', () => {
  const counts = { verified: 0, partial: 0, unverified: 0, notApplicable: 0 };
  for (const { b, dir } of ALL) counts[verificationOf(dir, b).status]++;
  assert.equal(Object.values(counts).reduce((a, x) => a + x, 0), ALL.length);
  assert.ok(counts.verified > 0, 'verified が 1 件も無い。照合が動いていない');
  assert.ok(counts.notApplicable > 0, '枠が notApplicable になっていない');
});

test('表示用の行は、確かめた項目と推定を分けて書く', () => {
  const b = ALL.find(x => verificationOf(x.dir, x.b).status !== 'notApplicable');
  const rows = verificationRows(verificationOf(b.dir, b.b));
  const keys = rows.map(r => r[0]);
  assert.ok(keys.includes('現物確認'), '現物確認の行が無い');
  assert.ok(keys.includes('難易度・到達目安・想定学習時間'), '推定の行が無い');
  const est = rows.find(r => r[0] === '難易度・到達目安・想定学習時間');
  assert.match(est[1], /推定/, '推定を推定と書いていない');
  const phys = rows.find(r => r[0] === '現物確認');
  assert.match(phys[1], /未登録/, '現物確認していないのに確認済みと書いている');
});

test('状態のラベルは色に頼らず文字で読める', () => {
  for (const s of STATUSES) {
    assert.ok(STATUS_LABEL[s] && STATUS_LABEL[s].length > 0, `${s} のラベルが無い`);
  }
});

/**
 * 2026-09-05 に「この情報の確かめ方」ブロックを書籍ページから外した。
 * 1,390 枚すべてに同じ定型文と「確認中」の並びが出ており、AdSense に
 * 有用性の低いコンテンツとして扱われたためである。
 *
 * 台帳（verification.json）と、それを使った構造化データの出し分けは残す。
 * **確かめていない ISBN を出さない**という下の検査が本体で、
 * 画面に出す・出さないはその手段でしかない。
 */
test('確認状況ブロックを書籍ページに出さない', () => {
  const files = [];
  for (const s of SUBJECTS) {
    const dir = path.join(ROOT, s.dir, 'books');
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) files.push(path.join(dir, d.name, 'index.html'));
    }
  }
  assert.ok(files.length > 1000, `書籍ページが ${files.length} 枚しかない`);
  const found = files.filter(f => fs.readFileSync(f, 'utf8').includes('この情報の確かめ方'));
  assert.equal(found.length, 0, `確認状況ブロックが復活しているページ: ${found.slice(0, 5).join(', ')}`);
});

/**
 * 難易度の定義表（degreeTable）も同じ理由で書籍ページから外し、1 行の
 * degreeLine に置き換えた。表の全文は /methodology/ が正本。
 */
test('難易度の定義表を書籍ページに出さない', () => {
  const files = [];
  for (const s of SUBJECTS) {
    const dir = path.join(ROOT, s.dir, 'books');
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) files.push(path.join(dir, d.name, 'index.html'));
    }
  }
  const found = files.filter(f => fs.readFileSync(f, 'utf8').includes('難易度 10 段階の意味と、役割との違い'));
  assert.equal(found.length, 0, `定義表が復活しているページ: ${found.slice(0, 5).join(', ')}`);
});

test('確かめていない ISBN を Book の構造化データに出さない', () => {
  const bad = [];
  for (const { b, dir } of ALL) {
    if (isPlaceholder(b) || !b.isbn13) continue;
    const v = verificationOf(dir, b);
    if (v.fields.isbn13.status === 'verified') continue;
    const file = path.join(ROOT, dir, 'books', b.id, 'index.html');
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const ld = /"@type": "Book"[\s\S]*?\n\s{6}\}/.exec(src);
    if (ld && ld[0].includes(`"isbn"`)) bad.push(`${dir}:${b.id}`);
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.join('\n'));
});
