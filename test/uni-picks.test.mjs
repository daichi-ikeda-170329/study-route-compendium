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

/* ---------- トラック別・シリーズ・並び順（タスク 1.5） ---------- */

const { seriesKey, STAGE_GROUPS } = await import('../build/lib/uni-picks.mjs');

test('seriesKey: 巻・分冊・分野の違いを落とす', () => {
  assert.equal(seriesKey('物理のエッセンス 熱・電磁気・原子'), seriesKey('物理のエッセンス 力学・波動'));
  assert.equal(seriesKey('名問の森 力学・熱・波動I'), seriesKey('名問の森 波動II・電磁気・原子'));
  assert.equal(seriesKey('実況中継①'), seriesKey('実況中継③'));
  assert.equal(seriesKey('浜島清利 物理講義の実況中継(1)'), seriesKey('浜島清利 物理講義の実況中継(2)'));
  assert.equal(seriesKey('The Rules 1'), seriesKey('The Rules 4'));
});

test('seriesKey: 別の本を表す数字・語は残す', () => {
  assert.notEqual(seriesKey('ターゲット1400'), seriesKey('ターゲット1900'));
  assert.notEqual(seriesKey('入門英文解釈の技術70'), seriesKey('基礎英文解釈の技術100'));
  assert.match(seriesKey('速読英単語 上級編'), /上級/, '上級編の「上」は巻表記ではない');
  assert.match(seriesKey('中学英語をもう一度ひとつひとつわかりやすく'), /^中学/, '書名の途中の「中」を落とさない');
});

test('同じシリーズからはルート上で先に来る 1 冊だけを出す', () => {
  for (const name of ['早稲田大学', '東京大学', '大阪大学']) {
    for (const dir of ['science', 'social', 'english', 'math', 'japanese']) {
      const r = picks(dir, name, 12);
      const keys = r.map(x => seriesKey(x.book.name));
      assert.equal(new Set(keys).size, keys.length, `${name} ${dir}: 同じシリーズが 2 冊ある: ${r.map(x => x.book.name).join(' / ')}`);
    }
  }
});

test('STAGE_GROUPS の段は実在する', () => {
  for (const [dir, map] of Object.entries(STAGE_GROUPS)) {
    const stages = loadSubjectData(ROOT, dir).stages;
    for (const st of Object.keys(map)) assert.ok(stages[st], `${dir}: STAGE_GROUPS の「${st}」が stages.json に無い`);
  }
});

test('早稲田の数学は文系・理系、理科は物理・化学・生物（学部・入試方式による）に分かれる', () => {
  const html = fs.readFileSync(path.join(ROOT, 'univ/waseda/index.html'), 'utf8');
  const sec = (dir, next) => html.slice(html.indexOf(`id="sub-${dir}"`), html.indexOf(`id="sub-${next}"`));
  const heads = (h) => [...h.matchAll(/<h4 class="ubooks__h">(.*?)<\/h4>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(heads(sec('math', 'science')), ['文系', '理系']);
  assert.deepEqual(heads(sec('science', 'social')), ['物理', '化学', '生物 — 学部・入試方式による']);
  assert.deepEqual(heads(sec('english', 'japanese')), [], '英語は本編が共通なので 1 リスト');
  // 物理で「エッセンスの熱編」だけが単独で出ない
  const phys = sec('science', 'social').split('<h4')[1];
  assert.ok(!/熱・電磁気・原子/.test(phys) || /力学・波動/.test(phys), '物理のエッセンス 熱編だけが出ている');
});

test('並び順の説明はスコアの決め方を書く', () => {
  const html = fs.readFileSync(path.join(ROOT, 'univ/waseda/index.html'), 'utf8');
  assert.match(html, /並び順は、その大学の出題の特徴に当てはまった数と、ルート上の位置で決めています/);
  assert.doesNotMatch(html, /並び順はおすすめの度合いで/);
});

/* ---------- 大学ページの重複（タスク 2.6） ---------- */

test('大学ページに同じ文が 2 回出ず、「最も高い到達度が要る科目」を出さない', () => {
  const html = fs.readFileSync(path.join(ROOT, 'univ/waseda/index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const seen = new Set();
  for (const m of html.matchAll(/<(p|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    for (const piece of m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(/(?<=。)/)) {
      // 句点の有無では区別しない（節末の補足の <span> は句点で終わらない）
      const t = piece.trim().replace(/。$/, '');
      if (t.length < 20) continue;
      assert.ok(!seen.has(t), `同じ文が 2 回ある: ${t}`);
      seen.add(t);
    }
  }
  assert.doesNotMatch(html, /最も高い到達度が要る科目/);
  // 「出題される分野」に書いた「〜は学部・入試方式によって扱いが変わります」を節末で繰り返さない
  assert.match(html, /<span class="usec__tracks">物理・化学・生物別に用意しています<\/span>/);
  assert.match(html, /個別試験（二次）の国語<\/dt><dd>課されます。<a class="unote__go" href="#sub-japanese">/);
});
