/**
 * 解析イベントの契約（docs/analytics-events.md）と実装（assets/js/analytics.js）を
 * 突き合わせる。片方だけ増やすとここで落ちる。
 *
 * あわせて「受験情報が外へ出る道が残っていないか」を静的に見る。
 * gtag をその場で呼ぶ書き方が 1 か所でも戻ると、allowlist は素通りされる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';

const require = createRequire(import.meta.url);
const A = require(path.join(ROOT, 'assets/js/analytics.js'));
const DOC = fs.readFileSync(path.join(ROOT, 'docs', 'analytics-events.md'), 'utf8');

const SKIP = new Set(['.git', 'node_modules', 'dist', 'test-results', 'playwright-report']);
function files(exts, dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(exts, p, out);
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

test('契約に書いたイベントと実装の allowlist が一致する', () => {
  const inDoc = new Set([...DOC.matchAll(/`([a-z_]+)`(?=[^|]*\|)/g)].map(m => m[1])
    .filter(n => /^[a-z]+(_[a-z]+)+$/.test(n)));
  const impl = Object.keys(A.EVENTS);
  const missing = impl.filter(n => !inDoc.has(n));
  assert.deepEqual(missing, [], `実装にあって docs/analytics-events.md に無いイベント: ${missing.join(', ')}`);
});

test('allowlist に無いイベントは送れない', () => {
  for (const n of ['secret', 'page_view_with_hensachi', 'route_save_cloud', '']) {
    assert.equal(A.sanitize(n, {}).ok, false, `${n} が通ってしまう`);
  }
});

test('許可していないパラメータは落ちる', () => {
  const r = A.sanitize('affiliate_click', {
    subject_id: 'math', book_id: 'ao', store: 'amazon',
    university: '東京大学', faculty: '医学部', hensachi: 62,
    done: ['ao', 'kisomon'], query: '?rv=1&r=t.top.ri', answers: { tier: 'top' },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.params).sort(), ['book_id', 'store', 'subject_id']);
  for (const k of ['university', 'faculty', 'hensachi', 'done', 'query', 'answers']) {
    assert.ok(r.dropped.includes(`param:${k}`), `${k} が落ちていない`);
  }
});

test('値の形が違えばそのパラメータは落ちる', () => {
  assert.deepEqual(A.sanitize('book_open', { subject_id: 'unknown', book_id: 'ao' }).params, { book_id: 'ao' });
  assert.deepEqual(A.sanitize('affiliate_click', { subject_id: 'math', store: 'mercari' }).params, { subject_id: 'math' });
  assert.deepEqual(A.sanitize('route_save', { subject_id: 'math', storage: 'cloud' }).params, { subject_id: 'math' });
  // 自由入力を book_id へ入れても通らない
  assert.deepEqual(A.sanitize('book_open', { subject_id: 'math', book_id: '東京大学 医学部' }).params, { subject_id: 'math' });
});

test('大学名・偏差値・回答を送る名前のパラメータが、そもそも定義されていない', () => {
  const banned = /univ|uni_|faculty|gakubu|hensachi|score|moshi|answer|ans_|done|query|hash|storage_value/i;
  const bad = [];
  for (const [ev, params] of Object.entries(A.EVENTS)) {
    for (const p of params) if (banned.test(p) && p !== 'storage') bad.push(`${ev}.${p}`);
  }
  assert.deepEqual(bad, [], bad.join(', '));
});

test('gtag をその場で呼ぶ書き方が残っていない（送信口はひとつ）', () => {
  const bad = [];
  for (const f of files(['.html', '.js'])) {
    const rel = path.relative(ROOT, f);
    // 送信口そのものと、GA4 の初期化（config）だけは gtag を呼んでよい
    if (rel === 'assets/js/analytics.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/gtag\(\s*["']event["']/g)) {
      bad.push(`${rel}: ${src.slice(Math.max(0, m.index - 30), m.index + 60).replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `allowlist を通さない送信:\n${bad.slice(0, 10).join('\n')}`);
});

test('外部リンクには noopener と noreferrer が付いている', () => {
  const bad = [];
  let total = 0;
  for (const f of files(['.html'])) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      total++;
      const rel = (/rel="([^"]*)"/.exec(m[0]) || [])[1] || '';
      if (!/noopener/.test(rel) || !/noreferrer/.test(rel)) {
        bad.push(`${path.relative(ROOT, f)}: ${m[0].slice(0, 110)}`);
      }
    }
  }
  assert.ok(total > 1000, `target="_blank" が ${total} 件しか見つからない`);
  assert.deepEqual(bad.slice(0, 5), [], bad.slice(0, 5).join('\n'));
});

test('アフィリエイトのリンクには sponsored が付いている', () => {
  const bad = [];
  for (const f of files(['.html'])) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<a\b[^>]*href="(https:\/\/(?:www\.amazon\.co\.jp|hb\.afl\.rakuten\.co\.jp)[^"]*)"[^>]*>/g)) {
      const hasTag = /[?&]tag=/.test(m[1]) || /hb\.afl\.rakuten/.test(m[1]);
      if (!hasTag) continue;
      const rel = (/rel="([^"]*)"/.exec(m[0]) || [])[1] || '';
      if (!/sponsored/.test(rel)) bad.push(`${path.relative(ROOT, f)}: ${m[0].slice(0, 110)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], bad.slice(0, 5).join('\n'));
});

test('インラインの onclick に利用者の入力を埋め込んでいない', () => {
  // 保存項目の id を onclick へ入れると、id の中身次第で属性を抜け出せる。
  // 既存の share.test.mjs が同じ趣旨を見ているので、ここでは生成ページ側を見る
  const bad = [];
  for (const f of files(['.html'])) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/onclick="[^"]*(?:value|innerHTML|localStorage|location\.(?:search|hash))[^"]*"/g)) {
      bad.push(`${path.relative(ROOT, f)}: ${m[0].slice(0, 90)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], bad.slice(0, 5).join('\n'));
});

test('javascript: の URL が無い', () => {
  const bad = [];
  for (const f of files(['.html', '.js'])) {
    const src = fs.readFileSync(f, 'utf8');
    if (/(?:href|src)\s*=\s*["']javascript:/i.test(src)) bad.push(path.relative(ROOT, f));
  }
  assert.deepEqual(bad, [], bad.join(', '));
});

test('外部の書影に referrerpolicy が付いている（ページ URL を渡さない）', () => {
  const bad = [];
  for (const f of files(['.html']).slice(0, 400)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<img\b[^>]*src="https:\/\/[^"]*"[^>]*>/g)) {
      if (!/referrerpolicy=/.test(m[0])) bad.push(`${path.relative(ROOT, f)}: ${m[0].slice(0, 100)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], bad.slice(0, 5).join('\n'));
});
