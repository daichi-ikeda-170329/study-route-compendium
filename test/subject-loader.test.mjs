/**
 * build/lib/load-subject-data.mjs の検査。
 *
 * ここは科目データの**唯一の読み書き口**なので、次の 4 つを固定する。
 *
 *   1. canonical ファイルへ書き出して読み直しても、中身が 1 バイトも変わらない
 *   2. ファイルが欠けていたら、黙って別の場所を読まずにその場で落ちる
 *   3. canonical データに関数を混ぜられない
 *   4. 科目 HTML へ落ちる経路が残っていない
 *
 * 4 が要。落とし先を残すと、移行が壊れても黙って通ってしまう。
 * しかもデータはもう HTML に無いので、落ちても救いにならない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { SUBJECTS } from '../build/lib/extract.mjs';
import {
  loadSubjectData, isMigrated, writeSubjectBooks, clearSubjectCache,
  serializeCanonical, CANONICAL_FILES,
} from '../build/lib/load-subject-data.mjs';
import { canonical } from '../build/lib/validate-subject-data.mjs';

/**
 * 値を比べるための正規形。キー順を揃えた JSON 文字列にする。
 * 見たいのは中身なので、オブジェクトの同一性や prototype は問わない。
 */
const norm = v => JSON.stringify(canonical(v));

/** コメントを落とす。説明文に書いた関数名が検査に引っかからないようにする */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** 実データを canonical ファイルとして書き出した一時ルートを作る */
function makeMigratedRoot(dirs = SUBJECTS.map(s => s.dir), skipFiles = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-loader-'));
  for (const dir of dirs) {
    const d = loadSubjectData(ROOT, dir);
    const dst = path.join(tmp, 'data', 'subjects', dir);
    fs.mkdirSync(dst, { recursive: true });
    const payload = {
      'books.json': { books: d.books },
      'universities.json': { universities: d.unis },
      'routes.json': { routes: d.routes, tiers: d.tiers },
      'guides.json': { guides: d.guides },
      'stages.json': { stages: d.stages },
      'config.json': { config: d.config },
    };
    for (const [f, o] of Object.entries(payload)) {
      if (skipFiles.includes(f)) continue;
      fs.writeFileSync(path.join(dst, f), serializeCanonical({ schemaVersion: 1, ...o }));
    }
  }
  return tmp;
}

test('canonical ファイルへ書き出して読み直しても中身が変わらない', () => {
  // 書式（serializeCanonical）と読み口（loadSubjectData）が食い違うと、
  // apply-book-text / apply-new-books が書き戻すたびに中身が少しずつ壊れる
  const tmp = makeMigratedRoot();
  try {
    for (const s of SUBJECTS) {
      clearSubjectCache();
      const original = loadSubjectData(ROOT, s.dir, { fresh: true });
      clearSubjectCache();
      const roundTrip = loadSubjectData(tmp, s.dir, { fresh: true });
      if (norm(roundTrip) !== norm(original)) {
        // 落ちたときに「どこが」を読めるようにする
        assert.deepEqual(JSON.parse(norm(roundTrip)), JSON.parse(norm(original)),
          `${s.dir}: 書き出して読み直すと中身が変わる`);
        assert.fail(`${s.dir}: 書き出して読み直すと中身が変わる（正規形が一致しない）`);
      }
      assert.deepEqual(Object.keys(roundTrip).sort(), Object.keys(original).sort(), `${s.dir}: 戻り値のキーが違う`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearSubjectCache();
  }
});

test('isMigrated は books.json の有無で決まる', () => {
  const tmp = makeMigratedRoot(['math']);
  try {
    assert.equal(isMigrated(tmp, 'math'), true);
    assert.equal(isMigrated(tmp, 'science'), false, '書き出していない科目が移行済みになっている');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('7 科目すべてが data/subjects/ から読まれている', () => {
  for (const s of SUBJECTS) {
    assert.equal(isMigrated(ROOT, s.dir), true, `${s.dir}: data/subjects/${s.dir}/ が無い`);
  }
});

test('科目 HTML にデータ定数が残っていない', () => {
  const left = [];
  for (const s of SUBJECTS) {
    const html = fs.readFileSync(path.join(ROOT, s.dir, 'index.html'), 'utf8');
    for (const name of ['BOOKS', 'ROUTES', 'UNIS', 'UNI_RAW', 'GUIDES', 'TIERS', 'STAGES']) {
      if (new RegExp(`^const ${name}\\s*=`, 'm').test(html)) left.push(`${s.dir}: const ${name}`);
    }
  }
  assert.deepEqual(left, [], `科目 HTML にデータが残っている:\n${left.join('\n')}`);
});

test('科目データの読み口に、科目 HTML へのフォールバックが残っていない', () => {
  // 落とし先を残すと、移行が壊れても黙って古い HTML を読んで通ってしまう。
  // しかもデータはもう HTML に無いので、落ちても救いにならない
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'build/lib/load-subject-data.mjs'), 'utf8'));
  const legacy = 'extract' + 'Subject';
  assert.ok(!src.includes(legacy), `ローダーが ${legacy}() へ落ちる経路を持っている`);
  assert.ok(!/index\.html/.test(src), 'ローダーが科目 HTML を読んでいる');
});

test('canonical ファイルが欠けていたら、その場で落ちる', () => {
  // books.json はあるが routes.json が無い状態。ここで黙って別の場所を読みに行くと、
  // 「移したつもりで移っていない」に気づけないまま生成が通ってしまう。
  // 2026-09-05 に科目 HTML へのフォールバックを削除したので、落ちるのが正しい
  const tmp = makeMigratedRoot(['math'], ['routes.json']);
  try {
    clearSubjectCache();
    assert.throws(() => loadSubjectData(tmp, 'math', { fresh: true }), /足りない.*routes\.json/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearSubjectCache();
  }
});

test('schemaVersion が違えば落ちる', () => {
  const tmp = makeMigratedRoot(['math']);
  try {
    const p = path.join(tmp, 'data', 'subjects', 'math', 'books.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    fs.writeFileSync(p, JSON.stringify({ ...raw, schemaVersion: 2 }));
    clearSubjectCache();
    assert.throws(() => loadSubjectData(tmp, 'math', { fresh: true }), /schemaVersion/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearSubjectCache();
  }
});

test('writeSubjectBooks は移行済み科目にだけ書き、読み直すと反映されている', () => {
  const tmp = makeMigratedRoot(['math']);
  try {
    clearSubjectCache();
    const before = loadSubjectData(tmp, 'math', { fresh: true }).books;
    const next = before.map((b, i) => (i === 0 ? { ...b, desc: 'テスト用の説明文' } : b));

    assert.equal(writeSubjectBooks(tmp, 'math', next), true);
    const after = loadSubjectData(tmp, 'math', { fresh: true }).books;
    assert.equal(after.length, before.length, '冊数が変わっている');
    assert.equal(after[0].desc, 'テスト用の説明文');
    assert.deepEqual(after.map(b => b.id), before.map(b => b.id), '並び順か id が変わっている');

    // 未移行科目には書かない（false を返し、呼び出し側が HTML を書く）
    assert.equal(writeSubjectBooks(tmp, 'science', []), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearSubjectCache();
  }
});

test('canonical データに関数を混ぜられない', () => {
  const tmp = makeMigratedRoot(['math']);
  try {
    clearSubjectCache();
    const books = loadSubjectData(tmp, 'math', { fresh: true }).books.map(b => ({ ...b }));
    books[0].cond = () => true;
    assert.throws(() => writeSubjectBooks(tmp, 'math', books), /関数/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearSubjectCache();
  }
});

test('canonical の書式は、1 レコード 1 行で差分が読める', () => {
  const text = serializeCanonical({ schemaVersion: 1, books: [{ id: 'a', name: 'あ' }, { id: 'b', name: 'い' }] });
  const lines = text.trimEnd().split('\n');
  assert.ok(lines.some(l => l.trim() === '{"id":"a","name":"あ"},'), `1 レコード 1 行になっていない:\n${text}`);
  assert.deepEqual(JSON.parse(text), { schemaVersion: 1, books: [{ id: 'a', name: 'あ' }, { id: 'b', name: 'い' }] });
});

test('canonical のファイル一覧が読み込み側と揃っている', () => {
  assert.deepEqual(CANONICAL_FILES.map(f => f.file).sort(), [
    'books.json', 'config.json', 'guides.json', 'routes.json', 'stages.json', 'universities.json',
  ]);
});

test('科目データの読み口が 1 本だけになっている', () => {
  // 検査語をそのまま書くとこのファイル自身が引っかかるので、組み立てて使う
  const re = new RegExp('\\b' + 'extract' + 'Subject\\s*\\(');
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.cache', 'node_modules', 'data', 'content', 'ogp'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.mjs')) continue;
      const rel = path.relative(ROOT, p);
      if (rel === 'build/lib/extract.mjs' || rel === 'build/lib/load-subject-data.mjs') continue;
      const src = stripComments(fs.readFileSync(p, 'utf8'));
      if (re.test(src)) bad.push(rel);
    }
  };
  walk(path.join(ROOT, 'build'));
  walk(path.join(ROOT, 'test'));
  assert.deepEqual(bad, [],
    `科目データの読み口は build/lib/load-subject-data.mjs の 1 本だけにする:\n${bad.join('\n')}`);
});
