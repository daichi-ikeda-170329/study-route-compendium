/**
 * 科目トップ（単一 HTML の SPA）が、狭い画面で崩れる書き方に戻っていないかを見張る。
 *
 *   node --test test/mobile-layout.test.mjs
 *
 * 2026-09-03 に情報・小論文で実際に起きた崩れを再発させないために置いた。
 * 原因は 2 つあり、どちらも「見た目を要素の種類や個数に結びつけた」ことだった。
 *
 *   1. タブバーの項目を .tabbar button だけで整えていた。情報・小論文は 5 項目のうち
 *      2 つを別ページへの <a> にしているので、その 2 つだけ素の青リンク＋巨大な
 *      アイコンで出ていた。デスクトップのナビも同じ理由で崩れていた。
 *   2. .tabbar の列数を repeat(5,1fr) と決め打ちしていた。項目が 4 つの科目では
 *      5 列目が空いたまま残り、バー全体が左に寄っていた。
 *
 * どちらもブラウザで開かないと気づけない類なので、ここでは HTML と CSS の
 * 噛み合わせを静的に確かめる。見た目そのものではなく「崩れる書き方」を落とす。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from '../build/lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 押せる項目として扱う要素。ここに挙げたものは同じ見た目にそろっていないといけない */
const INTERACTIVE = new Set(['a', 'button']);

/** 中身が空でも閉じタグを書かない要素。子要素の深さを数えるときに読み飛ばす */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect',
  'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use']);

const read = (dir) => fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');

/** <style> の中身をつなげて返す。コメントは落とす */
function styleSheet(src) {
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1]).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * CSS を { selector, decls } の並びにほどく。
 * 宣言ブロックに { } を含まない形だけを拾うので、@media の前置きは自然に読み飛ばされる。
 */
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), decls: m[2].trim() }));
}

/** class="..." に cls を持つ最初の要素の、開始タグと中身を返す */
function element(src, cls) {
  const open = new RegExp(`<([a-z]+)([^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*)>`, 'i');
  const m = open.exec(src);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  let i = m.index + m[0].length;
  let depth = 1;
  const inner = [];
  const tagRe = /<(\/?)([a-z][a-z0-9]*)([^>]*)>/gi;
  tagRe.lastIndex = i;
  let t;
  while ((t = tagRe.exec(src))) {
    const [whole, slash, name, attrs] = t;
    const lower = name.toLowerCase();
    if (slash) {
      if (lower === tag) { depth -= 1; if (depth === 0) break; }
      continue;
    }
    if (depth === 1) inner.push(lower);          // 直接の子だけ拾う
    if (lower === tag) depth += 1;
    else if (!VOID.has(lower) && !attrs.trim().endsWith('/')) {
      // 子孫の入れ子は深さに影響しない（同名タグだけ数えれば足りる）
    }
  }
  return { tag, children: inner };
}

/** セレクタが `.cls` に紐づくとき、その中で名指ししている要素名を返す */
function tagsNamedUnder(selector, cls) {
  const out = new Set();
  for (const part of selector.split(',')) {
    const s = part.trim();
    if (!s.startsWith(`.${cls}`)) continue;
    const rest = s.slice(cls.length + 1);
    if (rest && !/^[\s>]/.test(rest) && !rest.startsWith(':')) continue;  // .tabbar-foo は別物
    for (const token of rest.split(/[\s>]+/)) {
      const name = token.replace(/[:.[].*$/, '');
      if (INTERACTIVE.has(name)) out.add(name);
    }
  }
  return out;
}

const dirs = SUBJECTS.map((s) => s.dir);

for (const dir of dirs) {
  const src = read(dir);
  const css = styleSheet(src);
  const parsed = rules(css);

  for (const cls of ['tabbar', 'nav-desktop']) {
    test(`${dir}: .${cls} は button と a を同じ規則で整えている`, () => {
      const el = element(src, cls);
      assert.ok(el, `.${cls} が見つからない`);
      const items = [...new Set(el.children.filter((t) => INTERACTIVE.has(t)))].sort();
      assert.ok(items.length > 0, `.${cls} に押せる項目が無い`);

      // 要素名を名指しする規則は、実際に使われている項目をすべて挙げていないといけない。
      // .tabbar button だけを書くと、<a> の項目が素のまま取り残される。
      for (const rule of parsed) {
        const named = tagsNamedUnder(rule.selector, cls);
        if (named.size === 0) continue;            // .tabbar>* のように要素名を使わない書き方は素通し
        const missing = items.filter((t) => !named.has(t));
        assert.deepEqual(missing, [],
          `「${rule.selector}」が ${missing.join(' / ')} を取りこぼす`
          + `（.${cls} の項目は ${items.join(' / ')}）`);
      }
    });
  }

  test(`${dir}: .tabbar の列数を決め打ちしていない`, () => {
    const bar = parsed.filter((r) => r.selector === '.tabbar');
    assert.ok(bar.length > 0, '.tabbar の規則が無い');
    const decls = bar.map((r) => r.decls).join(';');
    assert.ok(!/grid-template-columns\s*:\s*repeat\(\s*\d/.test(decls),
      '.tabbar が grid-template-columns:repeat(N,…) で列数を固定している。'
      + '項目数はページごとに違うので grid-auto-columns で並べた数だけ列を作ること');
    assert.match(decls, /grid-auto-columns/,
      '.tabbar は grid-auto-columns で項目数に追従させること');
  });

  test(`${dir}: リンクと画像の既定値を打ち消している`, () => {
    // a の色と下線を打ち消しておかないと、クラスを付け忘れたリンクが青＋下線で出る
    const reset = parsed.find((r) => r.selector === 'a');
    assert.ok(reset, 'a{} のリセットが無い');
    assert.match(reset.decls, /text-decoration\s*:\s*none/);
    assert.match(reset.decls, /color\s*:\s*inherit/);

    // 親より広い画像は狭い画面で横にはみ出す
    const img = parsed.find((r) => r.selector === 'img');
    assert.ok(img, 'img{} のリセットが無い');
    assert.match(img.decls, /max-width\s*:\s*100%/);
  });

  test(`${dir}: グリッドの子が min-content で枠を押し広げない`, () => {
    if (!/\.opt-fields\b/.test(css)) return;   // 診断フォームを持たない科目は対象外
    const guard = parsed.find((r) => r.selector === '.opt-fields>*');
    assert.ok(guard, '.opt-fields>* の規則が無い');
    assert.match(guard.decls, /min-width\s*:\s*0/,
      '.opt-fields の子に min-width:0 が要る。'
      + '<select> は最長の選択肢の幅を持つので、320px 幅では枠を押し広げてはみ出す');
  });
}
