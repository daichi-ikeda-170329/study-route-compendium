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

/* ---------- 本編が同じトラックをまとめる（タスク 1.2） ---------- */

const { groupTracks } = await import('../build/lib/tracks.mjs');

const seq = (note = '型を作る') => ({
  omni: [{ id: 'a', role: '文法', lvl: 1, note, alts: ['x', 'y'] }, { id: 'b', role: '長文', lvl: 2 }],
  quick: [{ id: 'a', role: '文法', lvl: 1 }],
});

test('groupTracks: 本編が同じなら 1 グループ', () => {
  const g = groupTracks({ bun: seq(), ri: seq(), para: { bun: [{ id: 'p' }], ri: [{ id: 'p' }] } });
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].keys, ['bun', 'ri']);
  assert.equal(g[0].para.length, 1, 'para も同じなら 1 つにまとめる');
  assert.deepEqual(g[0].para[0].keys, ['bun', 'ri']);
});

test('groupTracks: キーの並び順が違うだけなら同じとみなす', () => {
  const a = seq();
  const b = { quick: seq().quick, omni: seq().omni.map(s => Object.fromEntries(Object.entries(s).reverse())) };
  assert.equal(groupTracks({ bun: a, ri: b }).length, 1);
});

test('groupTracks: note が 1 文字違えば 2 グループ', () => {
  const g = groupTracks({ bun: seq('型を作る'), ri: seq('型を作れ') });
  assert.equal(g.length, 2);
  assert.deepEqual(g.map(x => x.keys), [['bun'], ['ri']]);
});

test('groupTracks: alts の順序違いも別グループ（保守的に）', () => {
  const b = seq();
  b.omni[0].alts = ['y', 'x'];
  assert.equal(groupTracks({ bun: seq(), ri: b }).length, 2);
});

test('groupTracks: para だけ違うときは本編を 1 グループにし、para はトラック別に持つ', () => {
  // 仕様書は para の違いも別グループとしていたが、実データでは本編が同じ段階でも
  // para は全段階で違っていたため、本編だけで判定する（2026-09-10 運営者判断）
  const g = groupTracks({ bun: seq(), ri: seq(), para: { bun: [{ id: 'p', note: '熟語で差をつける' }], ri: [{ id: 'p', note: '熟語・語法で差をつける' }] } });
  assert.equal(g.length, 1);
  assert.equal(g[0].para.length, 2);
  assert.deepEqual(g[0].para.map(x => x.keys), [['bun'], ['ri']]);
});

test('groupTracks: para が全トラック共通の配列でも扱える', () => {
  const g = groupTracks({ gendai: seq('a'), kobun: seq('b'), para: [{ id: 'p' }] });
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].para[0].list, [{ id: 'p' }]);
});

test('groupTracks: only で使うトラックを絞れる', () => {
  const g = groupTracks({ bun: seq('a'), ri: seq('b') }, ['ri']);
  assert.deepEqual(g.map(x => x.keys), [['ri']]);
});

const countSections = (rel) => (read(rel).match(/<section class="block" id="track-[a-z]+">/g) || []).length;

test('本編が同じ段階はルート本編を 1 回だけ出す', () => {
  assert.equal(countSections('english/routes/sokei/index.html'), 1);
  assert.match(read('english/routes/sokei/index.html'), /id="track-common"/);
  assert.match(read('english/routes/sokei/index.html'), /国公立二次型（記述）・私立個別型（マーク）共通のルート/);
  assert.equal(countSections('math/routes/kyote/index.html'), 1);
  assert.match(read('math/routes/kyote/index.html'), /本編の並びは文系・理系で違いはありません/);
});

test('本編が違う段階はトラックごとの節のまま', () => {
  assert.equal(countSections('english/routes/march/index.html'), 2);
  assert.equal(countSections('math/routes/march/index.html'), 2);
});
