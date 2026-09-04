/**
 * 年度コピーが build/data/site-meta.json の 1 か所から出ていることを検査する。
 *
 * 公開 HTML に「2026年度入試対応」のような古い年度が残っていないこと、
 * 事実に反する「完全対応」を名乗っていないこと、そして **年度設定を変えれば
 * 対象コピーが追従すること**（置換規則が生きていること）を見る。
 * 刊行年・年度版書名・更新履歴は事実なので対象外。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { ADMISSION_YEAR, ADMISSION_LABEL, STALE_YEAR_PATTERNS } from '../build/lib/site-meta.mjs';
import { HAND_WRITTEN, applyToSource, findStaleYearCopy } from '../build/apply-site-meta.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'data', 'changelog']);
function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('公開 HTML に古い年度の「入試対応」表記が残っていない', () => {
  const bad = [];
  for (const file of htmlFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const s of findStaleYearCopy(src)) {
      if (!s.includes(String(ADMISSION_YEAR))) bad.push(`${path.relative(ROOT, file)}: ${s}`);
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 20).join('\n'));
});

test('年度への「完全対応」を名乗っていない（全件確認し終えた事実が無いため）', () => {
  // 「◯◯と完全対応」は別冊どうしの対応関係を指す書名・紹介文の語なので対象外。
  // ここが見張るのは、サイト自身が年度・新課程への網羅を断定する表現だけ
  const CLAIM = /(?:20\d\d年度(?:入試)?(?:に|へ)?完全対応|新課程(?:に|へ)?完全対応|全科目完全対応|完全網羅)/;
  const bad = [];
  for (const file of htmlFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const m = CLAIM.exec(src);
    if (m) bad.push(`${path.relative(ROOT, file)}: ${m[0]}`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('手書き HTML の年度コピーが site-meta.json と一致している', () => {
  const bad = [];
  for (const rel of HAND_WRITTEN) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (applyToSource(src).out !== src) bad.push(rel);
  }
  assert.deepEqual(bad, [], `node build/apply-site-meta.mjs を流す:\n${bad.join('\n')}`);
});

test('年度を上げると対象コピーが追従する（置換規則が生きている）', () => {
  // 現行 HTML の年度を 1 つ古く戻した状態を作り、置換規則が現行値へ戻せるか見る
  const rel = 'index.html';
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const older = src.split(String(ADMISSION_YEAR)).join(String(ADMISSION_YEAR - 1));
  const { out } = applyToSource(older);
  assert.ok(out.includes(ADMISSION_LABEL), '古い年度から現行のラベルへ戻せない。規則が外れている');
  assert.ok(!/20\d\d年度入試対応/.test(out), '「◯◯年度入試対応」が残っている');
});

test('検出パターンは書名・刊行年を巻き込まない', () => {
  const safe = '2026年度版／浜島書店（2026 年）と 2026年度本試験を収めた実戦問題集';
  const hits = [];
  for (const re of STALE_YEAR_PATTERNS) for (const m of safe.matchAll(re)) hits.push(m[0]);
  assert.deepEqual(hits, [], `書名・刊行年を誤検出している: ${hits.join(', ')}`);
});
