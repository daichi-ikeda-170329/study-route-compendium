/**
 * KPI の取込機構の検査。
 *
 * ## 守りたいこと
 *
 *   1. **個人が特定できる列を含む CSV は、まるごと取り込まない。**
 *      1 列でも混ざったら落とす。部分的に取り込むと、混ざったことに気づけない。
 *   2. **読めなかった値を 0 で埋めない。** null のままにする。
 *   3. **雛形を「計測した」と読めない形にする。** 値はすべて null。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { parseCsv, readFile } from '../build/import-kpi.mjs';

const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/kpi-schema.json'), 'utf8'));

/* ============================================================
   CSV の読み取り
   ============================================================ */

test('引用符と改行を含む CSV を読める', () => {
  const rows = parseCsv('a,b\n"1,000","改行\nあり"\n');
  assert.deepEqual(rows, [['a', 'b'], ['1,000', '改行\nあり']]);
});

test('BOM 付きの CSV を読める（管理画面の書き出しに多い）', () => {
  const rows = parseCsv('﻿Clicks,Impressions\n10,20\n');
  assert.equal(rows[0][0], 'Clicks');
});

/* ============================================================
   個人が特定できる列
   ============================================================ */

test('検索クエリの列がある CSV を、まるごと落とす', () => {
  const r = readFile('sc.csv', 'Query,Clicks,Impressions\n参考書 ルート,12,340\n');
  assert.equal(r.ok, false);
  assert.match(r.reason, /個人が特定できる列/);
  assert.match(r.reason, /query/);
});

test('拒否する列が schema と実装で一致している', () => {
  // 一覧の正本は build/data/kpi-schema.json。実装がここを読んでいることを見る
  const src = fs.readFileSync(path.join(ROOT, 'build/import-kpi.mjs'), 'utf8');
  assert.match(src, /SCHEMA\.rejectColumns/, 'schema の rejectColumns を読んでいない');
  for (const need of ['client id', 'ip', 'query', '検索クエリ', '緯度', 'idfa']) {
    assert.ok(SCHEMA.rejectColumns.some(c => c.toLowerCase() === need.toLowerCase()),
      `rejectColumns に ${need} が無い`);
  }
});

test('個人が特定できる列は、ほかの列が正しくても落とす（部分的に取り込まない）', () => {
  const r = readFile('x.csv', 'Clicks,Impressions,Client ID\n100,2000,abc-123\n');
  assert.equal(r.ok, false, '正しい列があると通してしまっている');
});

test('市区町村と緯度経度も落とす', () => {
  for (const col of ['City', '市区町村', 'Latitude', '緯度']) {
    const r = readFile('x.csv', `${col},Sessions\nどこか,100\n`);
    assert.equal(r.ok, false, `${col} を通してしまっている`);
  }
});

/* ============================================================
   値の検査
   ============================================================ */

test('正しい集計 CSV を読める', () => {
  const r = readFile('sc.csv', 'Clicks,Impressions,CTR,Position\n1234,56789,0.0217,18.4\n');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'searchConsole');
  assert.deepEqual(r.values, { clicks: 1234, impressions: 56789, ctr: 0.0217, position: 18.4 });
});

test('日本語の見出しでも読める', () => {
  const r = readFile('sc.csv', 'クリック数,表示回数,クリック率,平均掲載順位\n10,200,0.05,12.3\n');
  assert.equal(r.ok, true);
  assert.equal(r.values.clicks, 10);
  assert.equal(r.values.position, 12.3);
});

test('カンマ区切りの数字と通貨記号を読める', () => {
  const r = readFile('ad.csv', 'Page views,Estimated earnings\n"12,345","¥1,234"\n');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'adsense');
  assert.equal(r.values.pageViews, 12345);
  assert.equal(r.values.estimatedEarnings, 1234);
});

test('範囲を外れた値は null にする（0 で埋めない・推測で直さない）', () => {
  const r = readFile('sc.csv', 'Clicks,Impressions,CTR,Position\n-5,100,1.8,0.2\n');
  assert.equal(r.ok, true);
  assert.equal(r.values.clicks, null, '負数を取り込んだ');
  assert.equal(r.values.ctr, null, '1 を超える割合を取り込んだ');
  assert.equal(r.values.position, null, '1 未満の掲載順位を取り込んだ');
  assert.equal(r.values.impressions, 100, '正しい値まで落としている');
  assert.ok(r.problems.length >= 3, '落とした理由が残っていない');
});

test('整数であるべき所に小数が来たら null にする', () => {
  const r = readFile('ga.csv', 'Sessions,Engagement rate\n123.4,0.5\n');
  assert.equal(r.values.sessions, null);
  assert.equal(r.values.engagementRate, 0.5);
});

test('1 つの列に値が複数行あるときは合計せず null にする', () => {
  const r = readFile('sc.csv', 'Clicks,Impressions\n10,100\n20,200\n');
  assert.equal(r.values.clicks, null, '勝手に合計している');
  assert.ok(r.problems.some(p => /合計値の CSV/.test(p)));
});

test('空の値は null（0 にしない）', () => {
  const r = readFile('sc.csv', 'Clicks,Impressions\n,100\n');
  assert.equal(r.values.clicks, null);
});

test('どのサービスか分からない CSV は取り込まない', () => {
  const r = readFile('x.csv', 'なにか,べつのなにか\n1,2\n');
  assert.equal(r.ok, false);
  assert.match(r.reason, /判別できない/);
});

/* ============================================================
   雛形
   ============================================================ */

test('基準値の雛形が、すべて null で置かれている', () => {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/kpi-baseline.json'), 'utf8'));
  const values = Object.values(b.sources).flatMap(s => Object.values(s));
  assert.ok(values.length > 0);
  assert.deepEqual([...new Set(values)], [null],
    '雛形に実数が入っている。取り込んでいない値を書かない');
  assert.equal(b.period.start, null);
  assert.equal(b.period.end, null);
  assert.equal(b.collectedAt, null);
});

test('例のファイルが「実数ではない」と書いてある', () => {
  const e = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/kpi-baseline.example.json'), 'utf8'));
  assert.ok(e.notes.some(n => n.includes('実数ではない')), '例だと分かる断りが無い');
  const values = Object.values(e.sources).flatMap(s => Object.values(s));
  assert.deepEqual([...new Set(values)], [null]);
});

test('生の CSV の置き場所が .gitignore に入っている', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gi, /^private\/$/m, 'private/ が .gitignore に無い。生の CSV が入りうる');
});

test('KPI の出力が公開物へ出ない', async () => {
  const { FORBIDDEN_PATH } = await import('../build/build-public.mjs');
  for (const rel of ['docs/kpi-baseline.json', 'docs/kpi-baseline.md', 'private/kpi-input/x.csv']) {
    assert.ok(FORBIDDEN_PATH.some(re => re.test(rel)), `${rel} が dist/ へ出うる`);
  }
});
