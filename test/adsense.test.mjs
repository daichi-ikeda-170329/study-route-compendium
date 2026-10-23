import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { adsenseLoader, ADSENSE_SERVING, adUnit } from '../build/lib/ads.mjs';

test('確認のみの状態ではメタタグを残し、広告スクリプトを配信しない', () => {
  const markup = adsenseLoader(false);
  assert.match(markup, /<meta name="google-adsense-account"/);
  assert.doesNotMatch(markup, /<script|adsbygoogle/);
});

test('承認後の配信を有効にするとローダーとメタタグの両方を出す', () => {
  const markup = adsenseLoader(true);
  assert.match(markup, /<meta name="google-adsense-account"/);
  assert.match(markup, /<script async src="https:\/\/pagead2\.googlesyndication\.com/);
});

test('手書きページも生成ページも同じ広告配信設定を使う', () => {
  for (const relative of ['index.html', '404.html', ...['english', 'japanese', 'math', 'science', 'social', 'joho', 'shoron'].map(s => `${s}/index.html`), 'science/books/jokyu-seiko/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(html, /<meta name="google-adsense-account"/);
    assert.equal(/adsbygoogle\.js\?client=/.test(html), ADSENSE_SERVING, relative);
  }
  if (!ADSENSE_SERVING) assert.equal(adUnit('inArticle'), '');
});

test('運用 CLI は全 7 科目で確認のみ・配信・解除を切り替え、同じ操作でタグを増やさない', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-adsense-'));
  const subjects = ['english', 'japanese', 'math', 'science', 'social', 'joho', 'shoron'];
  const htmlFiles = ['index.html', '404.html', ...subjects.map(s => `${s}/index.html`)];
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.writeFileSync(path.join(temp, file), value);
  };
  const read = file => fs.readFileSync(path.join(temp, file), 'utf8');
  const run = (...args) => spawnSync(process.execPath, [path.join(temp, 'build/apply-adsense.mjs'), ...args], { encoding: 'utf8' });
  const id = 'ca-pub-1234567890123456';
  try {
    for (const file of ['build/apply-adsense.mjs', 'build/lib/ads.mjs']) write(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
    for (const file of htmlFiles) write(file, '<head>\n<!-- Google アナリティクス 4 -->\n</head>\n');
    for (const s of subjects) write(`data/subjects/${s}/config.json`, '{"config":{"adsenseId":""}}');
    for (const args of [[id, '--verify-only'], [id], [id]]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
      for (const file of htmlFiles) {
        assert.equal((read(file).match(/name="google-adsense-account"/g) || []).length, 1, file);
        assert.equal((read(file).match(/adsbygoogle\.js/g) || []).length, args.includes('--verify-only') ? 0 : 1, file);
      }
      for (const s of subjects) assert.equal(JSON.parse(read(`data/subjects/${s}/config.json`)).config.adsenseId, id);
    }
    assert.equal(run('--off').status, 0);
    for (const file of htmlFiles) assert.doesNotMatch(read(file), /google-adsense-account|adsbygoogle\.js/);
    for (const s of subjects) assert.equal(JSON.parse(read(`data/subjects/${s}/config.json`)).config.adsenseId, '');
    assert.equal(fs.existsSync(path.join(temp, 'ads.txt')), false);
    const before = read('build/lib/ads.mjs');
    assert.equal(run('ca-pub-invalid').status, 1);
    assert.equal(read('build/lib/ads.mjs'), before);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
