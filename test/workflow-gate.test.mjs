// Actions の公開契約を実ファイルで確認する。GitHub上の実行/公開は行わない。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const pages=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const quality=fs.readFileSync(new URL('../.github/workflows/test.yml',import.meta.url),'utf8');
function job(text,name){const match=text.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:|$(?![\\s\\S]))`,'m'));assert.ok(match,`${name} job exists`);return match[1];}
test('deploy は同じworkflowのbuildとqualityの成功を待つ',()=>{
  const deploy=job(pages,'deploy');assert.match(deploy,/needs:\s*\[build, quality\]/);
  assert.match(job(pages,'quality'),/uses: \.\/\.github\/workflows\/test\.yml/);
  assert.doesNotMatch(job(pages,'quality'),/continue-on-error:\s*true/);
  assert.doesNotMatch(deploy.split('steps:')[0],/always\(|continue-on-error:\s*true/);
});
test('quality はworkflow_callで同じSHAのunitと全7画面projectを検査',()=>{
  assert.match(quality,/^  workflow_call:/m);assert.doesNotMatch(quality,/^  (push|pull_request):/m);
  for(const name of ['test','e2e']){const j=job(quality,name);assert.match(j,/uses: actions\/checkout@/);assert.doesNotMatch(j,/continue-on-error:\s*true|ref:\s*(main|master)/);}
  assert.match(job(quality,'test'),/run: npm test/);assert.match(job(quality,'test'),/run: npm run check:site/);
  assert.match(job(quality,'e2e'),/--project=desktop-1366 --project=tablet-768 --project=mobile-375 --project=narrow-320/);
  assert.match(job(quality,'e2e'),/run: npm run test:cross-browser/);
});
test('PRの検査待ちはmainの公開待ちを取り消さない',()=>{
  const concurrency=pages.match(/^concurrency:\n((?:[ \t]+.*\n)+)/m)?.[1];
  assert.ok(concurrency,'workflow concurrency exists');
  const group=concurrency.match(/^\s+group:\s*(.+)$/m)?.[1];
  assert.ok(group,'workflow concurrency group exists');
  const groupFor=ref=>group.replaceAll('${{ github.ref }}',ref);
  assert.notEqual(groupFor('refs/heads/main'),groupFor('refs/pull/42/merge'));
  assert.notEqual(groupFor('refs/pull/42/merge'),groupFor('refs/pull/43/merge'));
  assert.match(concurrency,/cancel-in-progress:\s*false/);
});
