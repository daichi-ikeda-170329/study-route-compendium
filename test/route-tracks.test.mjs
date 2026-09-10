/**
 * 志望校別ルートページ（/<科目>/routes/<tier>/）のトラックの扱いを検査する。
 *
 * 英語の bun / ri は「国公立二次型（記述）」「私立個別型（マーク）」で、文系・理系ではない。
 * 2026-09-10 まで静的ページだけが bun=文系・ri=理系 の対応表を持っていて、
 * 英語のルートページに「文系のルート」「理系のルート」と出ていた。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { trackLabel, trackKeys } = await import('../build/lib/tracks.mjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const routePages = (dir) => fs.readdirSync(path.join(ROOT, dir, 'routes'), { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => `${dir}/routes/${e.name}/index.html`);

/* ---------- 表示名の解決 ---------- */

test('trackLabel は config.trackLabels → SUB_LABELS → キーの順で引く', () => {
  const en = loadSubjectData(ROOT, 'english');
  const ma = loadSubjectData(ROOT, 'math');
  const ja = loadSubjectData(ROOT, 'japanese');
  assert.equal(trackLabel(en, 'bun'), '国公立二次型（記述）');
  assert.equal(trackLabel(en, 'ri', 'short'), '私立個別型');
  assert.equal(trackLabel(ma, 'bun'), '文系');
  assert.equal(trackLabel(ma, 'ri'), '理系');
  // 国語は trackLabels を持たない。分野名に落ちる
  assert.equal(trackLabel(ja, 'kobun'), '古文');
  assert.equal(trackLabel(ja, 'kanbun', 'short'), '漢文');
  assert.equal(trackLabel(ja, 'zzz'), 'zzz');
  assert.equal(trackLabel(ja, 'kobun', 'lead'), '', 'lead は定義が無ければ空');
});

test('trackKeys は para / final / basic を除いて TRACK_ORDER で並べる', () => {
  assert.deepEqual(trackKeys({ ri: {}, para: [], bun: {}, final: [] }), ['bun', 'ri']);
  assert.deepEqual(trackKeys({ kanbun: {}, gendai: {}, kobun: {}, basic: {} }), ['gendai', 'kobun', 'kanbun']);
  assert.deepEqual(trackKeys({ bun: {}, ri: null }), ['bun'], '値の無いトラックは数えない');
});

/* ---------- 生成ページ ---------- */

test('英語のルートページに「文系のルート」「理系のルート」を出さない', () => {
  const pages = routePages('english');
  assert.ok(pages.length >= 9, `英語のルートページが ${pages.length} 枚しかない`);
  for (const rel of pages) {
    const html = read(rel);
    assert.doesNotMatch(html, /文系のルート|理系のルート/, `${rel} に文系・理系の見出しがある`);
    assert.doesNotMatch(html, /文系・理系別/, `${rel} のリード文が文系・理系別になっている`);
  }
});

test('数学のルートページは文系・理系の見出しのまま', () => {
  const html = read('math/routes/march/index.html');
  assert.match(html, /<h2 class="sec">文系のルート<\/h2>/);
  assert.match(html, /<h2 class="sec">理系のルート<\/h2>/);
});

test('大学別ページの英語節もトラック名を文系・理系と書かない', () => {
  const html = read('univ/waseda/index.html');
  const en = html.slice(html.indexOf('id="sub-english"'), html.indexOf('id="sub-japanese"'));
  assert.ok(en.length > 0, '英語節が見つからない');
  assert.doesNotMatch(en, /文系|理系/, '英語節に文系・理系が出ている');
});
