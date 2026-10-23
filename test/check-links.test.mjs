import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

test('--internal は外部通信を一度も行わず公開 HTML を検査する', () => {
  const result = spawnSync(process.execPath, [
    '--import', 'data:text/javascript,globalThis.fetch=()=>{process.exit(99)}',
    'build/check-links.mjs', '--internal',
  ], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    // CI の unit 段階では OGP 画像をまだ生成しない。通常のサイト検査と同じ台帳を使う。
    env: { ...process.env, RT_OGP_FROM_LEDGER: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  assert.match(result.stdout, /検査を通過した/);
  assert.doesNotMatch(result.stdout, /書影:|Amazon の商品ページ:/);
});
