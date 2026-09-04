/**
 * 公開物（dist/）の検査。
 *
 * 2026-09 の時点では GitHub Pages がリポジトリ直下をそのまま配信していたため、
 * 本番から build/・test/・data/_backup/・package.json を取得できた。生成の仕組みや
 * 検証中のメモが、意図せず公開されている状態だった。ここでは
 * 「公開してよいものだけが入っているか」と「入っているものが壊れていないか」を見る。
 *
 * dist/ が無ければ検査を飛ばす（先に node build/build-public.mjs を流す）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { listDist, auditDist, FORBIDDEN_PATH } from '../build/build-public.mjs';

const DIST = path.join(ROOT, 'dist');
const HAS_DIST = fs.existsSync(DIST) && listDist().length > 0;
const skip = HAS_DIST ? undefined : { skip: 'dist/ がまだ無い（node build/build-public.mjs を先に流す）' };

test('公開してはいけないパスと秘密情報が dist/ に無い', skip, () => {
  const problems = auditDist();
  assert.deepEqual(problems.slice(0, 20), [], problems.join('\n'));
});

test('開発用のディレクトリが 1 つも入っていない', skip, () => {
  const files = listDist();
  const bad = files.filter(f => FORBIDDEN_PATH.some(re => re.test(f)));
  assert.deepEqual(bad, [], bad.join('\n'));
  for (const d of ['build', 'test', 'e2e', 'docs', 'data', 'node_modules', '.github']) {
    assert.equal(fs.existsSync(path.join(DIST, d)), false, `dist/${d}/ が入っている`);
  }
  for (const f of ['package.json', 'package-lock.json', 'README.md', 'playwright.config.mjs']) {
    assert.equal(fs.existsSync(path.join(DIST, f)), false, `dist/${f} が入っている`);
  }
});

test('公開に必要なものはそろっている', skip, () => {
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'CNAME', 'favicon.svg', 'ads.txt']) {
    assert.ok(fs.existsSync(path.join(DIST, f)), `dist/${f} が無い`);
  }
  const html = listDist().filter(f => f.endsWith('.html'));
  assert.ok(html.length > 1400, `HTML が ${html.length} 枚しかない`);
  assert.ok(fs.existsSync(path.join(DIST, 'assets', 'site.css')), 'CSS が無い');
  assert.ok(fs.existsSync(path.join(DIST, 'assets', 'js', 'analytics.js')), 'analytics.js が無い');
});

test('dist/ の中で内部リンクとアセット参照が解決する', skip, () => {
  const all = new Set(listDist().map(f => `/${f}`));
  const bad = new Set();
  for (const f of listDist().filter(f => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const m of src.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      let u = m[1];
      // テンプレートリテラルはリンクではない（科目トップのインライン JS）
      if (u.includes('${')) continue;
      if (u.endsWith('/')) u += 'index.html';
      if (!all.has(u)) bad.add(`${f} → ${u}`);
    }
  }
  assert.deepEqual([...bad].slice(0, 10), [], [...bad].slice(0, 10).join('\n'));
});

test('sitemap に載せた URL が公開物に存在する', skip, () => {
  const xml = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length > 1000, `sitemap の URL が ${locs.length} 件しかない`);
  const all = new Set(listDist().map(f => `/${f}`));
  const missing = [];
  for (const loc of locs) {
    const u = new URL(loc);
    let p = u.pathname;
    if (p.endsWith('/')) p += 'index.html';
    if (!all.has(p)) missing.push(loc);
  }
  assert.deepEqual(missing.slice(0, 10), [], missing.slice(0, 10).join('\n'));
});

test('sitemap に noindex のページを載せていない', skip, () => {
  const xml = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const bad = [];
  for (const loc of locs) {
    let p = new URL(loc).pathname;
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(DIST, p.slice(1));
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (/<meta[^>]*name="robots"[^>]*noindex/i.test(src)) bad.push(loc);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('canonical は絶対 URL で、想定のドメインを指す', skip, () => {
  const bad = [];
  // 404 はエラーページなので canonical を持たない（noindex であることを別に見る）
  for (const f of listDist().filter(f => f.endsWith('.html') && f !== '404.html').slice(0, 400)) {
    const src = fs.readFileSync(path.join(DIST, f), 'utf8');
    const m = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(src);
    if (!m) { bad.push(`${f}: canonical が無い`); continue; }
    if (!m[1].startsWith('https://route-taizen.com/')) bad.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.slice(0, 10).join('\n'));
});

test('title と h1 が空のページが無い', skip, () => {
  const bad = [];
  for (const f of listDist().filter(f => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(DIST, f), 'utf8');
    const t = /<title>([^<]*)<\/title>/.exec(src);
    if (!t || !t[1].trim()) bad.push(`${f}: title`);
    if (!/<h1[\s>]/.test(src)) bad.push(`${f}: h1`);
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.slice(0, 10).join('\n'));
});

test('JSON-LD が JSON として妥当', skip, () => {
  const bad = [];
  for (const f of listDist().filter(f => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch (e) { bad.push(`${f}: ${e.message.slice(0, 60)}`); }
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.slice(0, 10).join('\n'));
});

test('JSON-LD に null や空値、未確認の推測値を出していない', skip, () => {
  const bad = [];
  for (const f of listDist().filter(f => f.endsWith('.html')).slice(0, 500)) {
    const src = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let j; try { j = JSON.parse(m[1]); } catch { continue; }
      const walk = (n, p) => {
        if (n === null) { bad.push(`${f}: ${p} が null`); return; }
        if (Array.isArray(n)) { n.forEach((x, i) => walk(x, `${p}[${i}]`)); return; }
        if (n && typeof n === 'object') { for (const [k, v] of Object.entries(n)) walk(v, `${p}.${k}`); return; }
        if (n === '') bad.push(`${f}: ${p} が空文字`);
      };
      walk(j, 'ld');
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.slice(0, 10).join('\n'));
});

test('404 ページは noindex で、sitemap にも載っていない', skip, () => {
  const src = fs.readFileSync(path.join(DIST, '404.html'), 'utf8');
  assert.match(src, /<meta[^>]*name="robots"[^>]*noindex/i, '404 が noindex になっていない');
  const xml = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  assert.ok(!xml.includes('/404'), '404 が sitemap に載っている');
});

test('robots.txt が sitemap を指し、noindex の代用をしていない', skip, () => {
  const txt = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
  assert.match(txt, /Sitemap:\s*https:\/\/route-taizen\.com\/sitemap\.xml/i, 'sitemap の場所が書かれていない');
  assert.ok(!/Noindex:/i.test(txt), 'robots.txt で noindex の代用をしている');
});
