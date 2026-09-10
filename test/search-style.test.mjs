/**
 * ヘッダー検索ボックスの CSS が、描画をブロックする形で全ページへ届いているかのテスト。
 *
 *   node --test test/search-style.test.mjs
 *
 * この CSS を JS から差し込んでいたとき、ヘッダーが 1 行から 2 行へ組み直されて
 * 本文が 35px 下へずれ、CLS 0.2126（全体の 98%）を出していた。
 * 経緯は build/apply-search-style.mjs の冒頭に書いてある。
 *
 * ここで固定するのは 3 つ。
 *   1. 検索ボックスを持つページは、必ず CSS を先に受け取る（<link> かインライン）
 *   2. 配った中身が search.js の STYLE と 1 文字も違わない
 *   3. 版面を決める規則（折り返しと高さ）が中身に含まれている
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { block, HAND_WRITTEN, SUBJECT_CSS } from '../build/apply-search-style.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCK = block();

/** リポジトリ直下の HTML を全部拾う（dist/ と node_modules/ は見ない） */
function allHtml(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist'
      || e.name === 'build' || e.name === 'test-results') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) allHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const PAGES = allHtml().filter(p => fs.readFileSync(p, 'utf8').includes('id="rtSearch"'));

test('検索ボックスを置いたページが 1 枚以上ある（検査が空回りしていない）', () => {
  assert.ok(PAGES.length > 100, `${PAGES.length} 枚しか見つからない`);
});

test('検索ボックスを持つページは、CSS を描画前に受け取っている', () => {
  const bad = [];
  for (const p of PAGES) {
    const src = fs.readFileSync(p, 'utf8');
    const linked = src.includes('rel="stylesheet" href="/assets/site.css"');
    const inlined = src.includes(BLOCK);
    // 科目トップは自分の CSS を描画ブロックの <link> で読む。その中に配布物が入っていればよい
    const own = src.match(/rel="stylesheet" href="\/(assets\/css\/subject-[a-z]+\.css)\?v=[0-9a-f]+"/);
    const viaOwn = own && fs.readFileSync(path.join(ROOT, own[1]), 'utf8').includes(BLOCK);
    if (!linked && !inlined && !viaOwn) bad.push(path.relative(ROOT, p));
  }
  assert.deepEqual(bad, [], `CSS が JS 頼みのページが残っている:\n  ${bad.join('\n  ')}`);
});

test('配った CSS が search.js の STYLE と一致している', () => {
  const targets = ['assets/site.css', ...SUBJECT_CSS, ...HAND_WRITTEN];
  const bad = [];
  for (const rel of targets) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!src.includes(BLOCK)) bad.push(rel);
  }
  assert.deepEqual(bad, [], `node build/apply-search-style.mjs を流す:\n  ${bad.join('\n  ')}`);
});

test('site.css は検索ボックスの CSS を二重に持たない', () => {
  const css = fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8');
  const n = css.split('.rt-search__more{').length - 1;
  assert.equal(n, 1, `.rt-search__more の定義が ${n} 個ある（マーカー区間の 1 個だけのはず）`);
});

test('版面を決める規則が配布物に入っている', () => {
  // この 3 行が抜けると、CSS が届く前後でヘッダーの行数と高さが変わる
  for (const rule of ['.app-header__in{flex-wrap:wrap}', '.rt-search{position:relative;flex:1 1 100%', '.rt-search__in{display:flex']) {
    assert.ok(BLOCK.includes(rule), `${rule} が配布物に無い`);
  }
});

test('CSS が届いていることを JS 側が判定できる', () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/search.js'), 'utf8');
  assert.ok(BLOCK.includes(':root{--rt-search-css:1}'), '配布物に判定用の宣言が無い');
  assert.ok(js.includes('--rt-search-css'), 'search.js が判定用の宣言を読んでいない');
  assert.ok(js.includes('styleAlreadyDelivered'), 'search.js に二重差し込みの歯止めが無い');
});
