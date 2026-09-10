/**
 * README が実装と合っていることの検査（改修仕様書 5.1）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('README に廃止した仕組みの記述が残っていない', () => {
  assert.doesNotMatch(readme, /extractSubject|BOOKS 配列|手で編集する.*SPA/);
});

test('README の npm コマンドはすべて package.json の scripts にある', () => {
  const builtin = new Set(['ci', 'install', 'test']);
  const cmds = [...readme.matchAll(/npm (run )?([a-z][a-z0-9:-]*)/g)].map(m => (m[1] ? m[2] : m[2]));
  for (const c of cmds) {
    if (builtin.has(c) && !(c === 'test' && !pkg.scripts.test)) continue;
    assert.ok(pkg.scripts[c], `README の「npm run ${c}」が package.json に無い`);
  }
});

test('README は 300 行以内で、案内している docs が実在する', () => {
  assert.ok(readme.split('\n').length <= 300, `README が ${readme.split('\n').length} 行`);
  for (const m of readme.matchAll(/`(docs\/[a-z0-9-]+\.md)`/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${m[1]} が無い`);
  }
});
