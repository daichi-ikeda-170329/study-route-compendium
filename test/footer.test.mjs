/**
 * フッターのリンクが 1 か所（build/lib/parts.mjs の FOOTER_LINKS）から出ていることを検査する。
 * 2026-09-10 まで手書き HTML には「詳細検索」「学習の記録」が無く、/progress/ にはトップから
 * 辿れなかった（仕様書 2.4）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { FOOTER_LINKS } = await import('../build/lib/parts.mjs');
const { TARGETS, applyToSource } = await import('../build/apply-footer.mjs');

test('FOOTER_LINKS に詳細検索と学習の記録がある', () => {
  const hrefs = FOOTER_LINKS.site.map(l => l.href);
  assert.ok(hrefs.includes('/search/'));
  assert.ok(hrefs.includes('/progress/'));
  assert.equal(FOOTER_LINKS.legal.length, 6, '信頼性ページは 6 つ');
});

test('手書き HTML 9 枚のフッターは FOOTER_LINKS と一致している', () => {
  assert.equal(TARGETS.length, 9);
  for (const t of TARGETS) {
    const src = fs.readFileSync(path.join(ROOT, t.rel), 'utf8');
    assert.equal(applyToSource(src, t.item), src, `${t.rel}: node build/apply-footer.mjs を流す`);
    for (const l of [...FOOTER_LINKS.site, ...FOOTER_LINKS.legal]) {
      assert.ok(src.includes(`href="${l.href}"`), `${t.rel}: ${l.href} へのリンクが無い`);
    }
  }
});

test('トップの使い方節から学習の記録へ辿れる', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const how = html.slice(html.indexOf('id="howto"'), html.indexOf('</section>', html.indexOf('id="howto"')));
  assert.match(how, /<a href="\/progress\/">学習の記録<\/a>に残せます（この端末の中だけ・登録不要）/);
});

test('/progress/ は noindex のまま', () => {
  const html = fs.readFileSync(path.join(ROOT, 'progress/index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="[^"]*noindex/);
});
