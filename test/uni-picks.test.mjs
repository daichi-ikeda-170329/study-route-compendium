/**
 * 大学別ページのおすすめ参考書（build/lib/uni-picks.mjs）の検査。
 *
 * 2026-09-10 まで候補がルートの本編・代替・並行枠だけだったため、早稲田のように
 * 自由英作文・超長文を問う大学でも英作文・超長文の本が選ばれなかった。
 * 出題形式別の重点対策（data/subjects/english/focus.json）を候補に入れて直した。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { recommendBooks, matchFeatures, availableTracks } = await import('../build/lib/uni-picks.mjs');
const { trackKeys } = await import('../build/lib/tracks.mjs');

/** generate-universities.mjs の pickBooks と同じ手順で呼ぶ */
function picks(dir, uniName, max = 6) {
  const d = loadSubjectData(ROOT, dir);
  const u = d.unis.find(x => x.n === uniName);
  assert.ok(u, `${dir}: ${uniName} が universities.json に無い`);
  const { keep } = availableTracks(dir, u, trackKeys(d.routes[u.t]));
  const text = [u.no, u.time, u.fix, u.med, u.bun, ...(u.fx || [])].filter(Boolean).join(' ');
  const features = matchFeatures(dir, text);
  return recommendBooks({ d, uni: u, tierId: u.t, tracks: keep, features, isMed: false, max });
}

test('早稲田のおすすめに英作文の本が入る', () => {
  const r = picks('english', '早稲田大学');
  assert.ok(r.some(x => x.book.stage === 'eisaku'), `英作文の本が無い: ${r.map(x => x.book.id).join(', ')}`);
});

test('早稲田のおすすめのうち少なくとも 1 冊が重点対策に由来する', () => {
  const r = picks('english', '早稲田大学');
  assert.ok(r.some(x => x.reasons.some(t => t.includes('対策として'))), '「〜対策として」の理由を持つ本が無い');
});

test('東大（fx: 要約・リスニング・英作文）のおすすめにリスニングの本が入る', () => {
  const r = picks('english', '東京大学');
  assert.ok(r.some(x => x.book.stage === 'listening'), `リスニングの本が無い: ${r.map(x => x.book.id).join(', ')}`);
});

test('ルートに載っていない重点対策の本は「重点:形式」を役割として持つ', () => {
  const r = picks('english', '早稲田大学');
  const focusOnly = r.filter(x => /^重点:/.test(x.role));
  assert.ok(focusOnly.length > 0, '重点:形式 の役割を持つ本が無い');
});

test('大学別ページの英語節に fx の重点対策の枠が出る', () => {
  const html = fs.readFileSync(path.join(ROOT, 'univ/waseda/index.html'), 'utf8');
  const en = html.slice(html.indexOf('id="sub-english"'), html.indexOf('id="sub-japanese"'));
  assert.match(en, /早稲田大学の出題形式に合わせた重点対策/);
  for (const k of ['超長文', '正誤', '語彙']) assert.match(en, new RegExp(`重点:${k}<`), `重点:${k} が無い`);
});

test('英語のルートページに 12 形式の重点対策の節がある（他科目には無い）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'english/routes/sokei/index.html'), 'utf8');
  const sec = html.slice(html.indexOf('id="focus"'), html.indexOf('</section>', html.indexOf('id="focus"')));
  assert.equal((sec.match(/<dt>/g) || []).length, 12);
  const ma = fs.readFileSync(path.join(ROOT, 'math/routes/march/index.html'), 'utf8');
  assert.doesNotMatch(ma, /id="focus"/);
});
