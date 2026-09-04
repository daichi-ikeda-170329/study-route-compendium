/**
 * build/check-production.mjs 自体の検査。
 *
 * この検査は **公開サイトへは出ない。** localhost に 2 つの配信元を立て、
 * 「リポジトリ直下をそのまま配信している状態」と「dist/ だけを配信している状態」を
 * 作って、検査スクリプトがそれを見分けられるかだけを見る。
 *
 * ここを固定しておかないと、check-production.mjs が「常に通る」検査に劣化しても
 * 気づけない。実際に守りたいのは「本番から build/ や package.json が取れる状態に
 * 戻ったら気づける」ことなので、**旧構成で落ちること**が本体の検査になる。
 *
 * 終了コードの意味（check-production.mjs の先頭コメントと同じ）
 *   0 … 一致  /  1 … 食い違い（直す対象）  /  2 … 未検査（届かなかった）
 *
 * dist/ が無ければ飛ばす（先に npm run build を流す）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

const DIST = path.join(ROOT, 'dist');
const HAS_DIST = fs.existsSync(path.join(DIST, 'index.html'));
const skip = HAS_DIST ? undefined : { skip: 'dist/ がまだ無い（npm run build を先に流す）' };

/** 配信サーバーを立てて、応答するようになるまで待つ */
async function serve(port, dir) {
  const p = spawn(process.execPath, [path.join(ROOT, 'build', 'serve.mjs'), String(port), dir], {
    cwd: ROOT, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
      return p;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  p.kill();
  throw new Error(`http://127.0.0.1:${port}/ が立ち上がらなかった`);
}

function runCheck(url) {
  return spawnSync(process.execPath, [
    path.join(ROOT, 'build', 'check-production.mjs'), `--url=${url}`, '--timeout=5000',
  ], { cwd: ROOT, encoding: 'utf8' });
}

test('dist/ だけを配信していれば通る（終了コード 0）', skip, async (t) => {
  const port = 4351;
  const srv = await serve(port, 'dist');
  t.after(() => srv.kill());
  const r = runCheck(`http://127.0.0.1:${port}`);
  assert.equal(r.status, 0, `落ちた:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /不一致 0/);
});

test('リポジトリ直下を配信していたら落ちる（終了コード 1）', skip, async (t) => {
  const port = 4352;
  const srv = await serve(port, '.');
  t.after(() => srv.kill());
  const r = runCheck(`http://127.0.0.1:${port}`);
  assert.equal(r.status, 1, `旧構成なのに落ちなかった:\n${r.stdout}\n${r.stderr}`);
  // 何を根拠に落としたのかまで固定する。「たまたま落ちた」では守りにならない
  assert.match(r.stdout, /\/package\.json が 404（dist\/ 配信の証拠） — HTTP 200/);
  assert.match(r.stdout, /\/build\/all\.mjs が 404（dist\/ 配信の証拠） — HTTP 200/);
  assert.match(r.stdout, /\/README\.md が 404（dist\/ 配信の証拠） — HTTP 200/);
});

test('届かなければ「未検査」で終わる（終了コード 2。成功と偽らない）', async () => {
  // 誰も待っていないポート
  const r = runCheck('http://127.0.0.1:4399');
  assert.equal(r.status, 2, `未検査になっていない:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /未実施/);
});

test('検査項目が site-meta.json と count-state.json を正本にしている', () => {
  const src = fs.readFileSync(path.join(ROOT, 'build', 'check-production.mjs'), 'utf8');
  assert.match(src, /build\/data\/site-meta\.json/, '年度ラベルの正本を読んでいない');
  assert.match(src, /build\/data\/count-state\.json/, '冊数の正本を読んでいない');

  // 数値やラベルを直接書いたら、正本が動いたときに検査が嘘をつく。
  // 期待値はこのテストにも書かず、正本から組み立てる（このファイル自体が
  // build/apply-count.mjs の sweep() に「実データに無い冊数」として拾われないため）。
  const counts = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/count-state.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/site-meta.json'), 'utf8'));
  for (const n of [counts.total, ...Object.values(counts.subjects)]) {
    for (const v of [String(n), Number(n).toLocaleString('en-US')]) {
      assert.ok(!src.includes(v + meta.countUnitLabel), `冊数 ${v} をハードコードしている`);
    }
  }
  assert.ok(!src.includes(meta.admissionLabel), '年度ラベルをハードコードしている');
  assert.ok(!src.includes(meta.admissionLabelShort), '年度ラベル（短）をハードコードしている');
});
