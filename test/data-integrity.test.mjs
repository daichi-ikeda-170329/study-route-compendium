/**
 * 全科目の BOOKS を横断して、公開してはいけない状態のデータを落とす。
 *
 * ISBN は「形式が合っている」だけでは足りない。チェックディジット、ISBN-10 と
 * ISBN-13 の相互一致、そして **科目をまたいだ重複**まで見る。2026-09 まで、
 * 英語・数学・理科の「志望校の過去問」枠が東京大学の赤本の ISBN
 * 9784325273943 を共有していた。どの科目からたどっても同じ 1 冊の商品ページへ
 * 飛ぶので、志望校が東大でない利用者には誤誘導になる。形式検査だけでは
 * この誤りは出てこない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractSubject, SUBJECTS } from '../build/lib/extract.mjs';
import { isPlaceholder, recordType } from '../build/lib/record-type.mjs';
import { ROOT } from './helpers.mjs';

const DATA = SUBJECTS.map(s => ({ sub: s, ...extractSubject(ROOT, s.dir) }));
const ALL = DATA.flatMap(d => d.books.map(b => ({ b, dir: d.sub.dir })));

/** ISBN-13 のチェックディジット（EAN-13 と同じ） */
function isbn13Valid(v) {
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(v[12]);
}

/** ISBN-10 のチェックディジット（末尾は X を取りうる） */
function isbn10Valid(v) {
  if (!/^\d{9}[\dX]$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(v[i]) * (10 - i);
  sum += v[9] === 'X' ? 10 : Number(v[9]);
  return sum % 11 === 0;
}

/** ISBN-10 から ISBN-13 を作る（978 プレフィックス） */
function to13(v10) {
  const core = `978${v10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + String((10 - (sum % 10)) % 10);
}

test('ISBN-13 のチェックディジットが合っている', () => {
  const bad = ALL.filter(({ b }) => b.isbn13 && !isbn13Valid(String(b.isbn13)))
    .map(({ b, dir }) => `${dir}:${b.id} = ${b.isbn13}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ISBN-10 のチェックディジットが合っている', () => {
  const bad = ALL.filter(({ b }) => b.isbn10 && !isbn10Valid(String(b.isbn10)))
    .map(({ b, dir }) => `${dir}:${b.id} = ${b.isbn10}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ISBN-10 と ISBN-13 が同じ本を指している', () => {
  const bad = ALL
    .filter(({ b }) => b.isbn10 && b.isbn13 && to13(String(b.isbn10)) !== String(b.isbn13))
    .map(({ b, dir }) => `${dir}:${b.id} — isbn10 ${b.isbn10} → ${to13(String(b.isbn10))} だが isbn13 は ${b.isbn13}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('同じ ISBN を 2 つ以上のレコードが使っていない', () => {
  const seen = new Map();
  for (const { b, dir } of ALL) {
    if (!b.isbn13) continue;
    const key = String(b.isbn13);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(`${dir}:${b.id}（${b.name}）`);
  }
  const dup = [...seen.entries()].filter(([, v]) => v.length > 1)
    .map(([k, v]) => `${k}: ${v.join(' / ')}`);
  assert.deepEqual(dup, [],
    `ISBN が重複している。同一書籍を意図して重ねるなら、正式書名・出版社・刊行年の一致を確かめたうえで理由を書く:\n${dup.join('\n')}`);
});

test('recordType は book か routePlaceholder のどちらかだけ', () => {
  const bad = ALL.map(({ b, dir }) => ({ t: recordType(b), b, dir }))
    .filter(x => !['book', 'routePlaceholder'].includes(x.t))
    .map(x => `${x.dir}:${x.b.id} = ${x.t}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ルート上の枠は ISBN・ASIN・単一年版を持たない', () => {
  const bad = [];
  for (const { b, dir } of ALL) {
    if (!isPlaceholder(b)) continue;
    for (const k of ['isbn13', 'isbn10', 'asin', 'year', 'cover']) {
      if (b[k]) bad.push(`${dir}:${b.id} に ${k} がある（枠は特定の商品ではない）`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ルート上の枠は少なくとも 1 件あり、ルートから参照されている', () => {
  const ph = ALL.filter(({ b }) => isPlaceholder(b));
  assert.ok(ph.length > 0, '枠が 1 件も無い。recordType の分岐が死んでいないか確かめる');
});

test('全書籍 id が科目内で一意で、URL に使える文字だけを持つ', () => {
  for (const d of DATA) {
    // BOOKS は vm 上で作られた配列なので、realm をまたぐと deepStrictEqual が
    // 同じ [] どうしでも落ちる。ここで現 realm の配列へ移す
    const ids = [...d.books].map(b => b.id);
    assert.equal(new Set(ids).size, ids.length, `${d.sub.dir}: id が重複している`);
    const bad = ids.filter(id => !/^[a-z0-9][a-z0-9_-]*$/i.test(id));
    assert.deepEqual(bad, [], `${d.sub.dir}: URL に使えない id — ${bad.join(', ')}`);
  }
});

test('ルート・代替・診断が参照する書籍 id がすべて実在する', () => {
  const bad = [];
  for (const d of DATA) {
    const known = new Set(d.books.map(b => b.id));
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      if (typeof node.id === 'string' && !known.has(node.id)) bad.push(`${d.sub.dir}: ルートが未知の id「${node.id}」を参照`);
      for (const a of node.alts || []) if (!known.has(a)) bad.push(`${d.sub.dir}: 代替が未知の id「${a}」を参照`);
      for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(d.routes);
    for (const b of d.books) for (const a of b.alts || []) {
      if (!known.has(a)) bad.push(`${d.sub.dir}:${b.id} の alts が未知の id「${a}」を参照`);
    }
  }
  assert.deepEqual([...new Set(bad)], [], [...new Set(bad)].join('\n'));
});

/* ============================================================
   模試の偏差値換算

   進研 -12・駿台全国 +10 のような一律の加減算は、科目・母集団・回次で大きく
   変わるため、実在しない精度を作り出す。到達目安と直接比べるのは全統記述だけ。
   ============================================================ */

test('模試の選択肢に固定の換算値が残っていない', () => {
  const bad = [];
  for (const s of SUBJECTS) {
    if (s.catalogOnly) continue;
    const src = fs.readFileSync(path.join(ROOT, s.dir, 'index.html'), 'utf8');
    const sel = /<select id="moshiSel"[\s\S]*?<\/select>/.exec(src);
    assert.ok(sel, `${s.dir}: moshiSel が見つからない`);
    for (const m of sel[0].matchAll(/<option value="(-?\d+)"/g)) {
      bad.push(`${s.dir}: option value="${m[1]}"（固定換算値）`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('偏差値に模試ごとの数値を足し引きしていない', () => {
  const bad = [];
  for (const s of SUBJECTS) {
    if (s.catalogOnly) continue;
    const src = fs.readFileSync(path.join(ROOT, s.dir, 'index.html'), 'utf8');
    if (/hen\s*\+\s*\(?\+?S\.moshi/.test(src) || /S\.hen\s*\+\s*S\.moshi/.test(src)) {
      bad.push(`${s.dir}: 偏差値に S.moshi を足している`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('比べてよい模試は全統記述だけで、ほかは comparable:false', () => {
  for (const s of SUBJECTS) {
    if (s.catalogOnly) continue;
    const src = fs.readFileSync(path.join(ROOT, s.dir, 'index.html'), 'utf8');
    const tbl = /const MOSHI = \{[\s\S]*?\n\};/.exec(src);
    assert.ok(tbl, `${s.dir}: MOSHI テーブルが無い`);
    const yes = [...tbl[0].matchAll(/(\w+):\s*\{[^}]*comparable:true/g)].map(m => m[1]);
    assert.deepEqual(yes, ['zento'], `${s.dir}: 比べてよい模試が ${yes.join(', ')} になっている`);
  }
});

test('公開表示に「全統換算」が残っていない', () => {
  const SKIP = new Set(['.git', 'node_modules', 'dist', 'data']);
  const bad = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html') && /全統換算/.test(fs.readFileSync(p, 'utf8'))) {
        bad.push(path.relative(ROOT, p));
      }
    }
  })(ROOT);
  assert.deepEqual(bad, [], bad.join('\n'));
});
