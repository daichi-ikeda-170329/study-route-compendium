/**
 * 条文（docs/style-guide.md）と検査の実装（build/lib/words.mjs）を突き合わせるテスト。
 *
 *   node --test test/style-guide.test.mjs
 *
 * スタイルガイド 2 節は「機械で検出する。片方だけ増やさない」と書いている。それでも
 * 2026-09 の点検で、条文にあって実装に無い語（王者・絶対・神）が見つかった。条文と
 * 実装のどちらを直しても、もう片方を忘れるとここで落ちる。
 *
 * 「神」だけは部分一致では検出できない（神戸大・神経・昼神が実在する）ので、
 * BANNED_NOT_CHECKED として条文にも実装にも理由つきで残す。除外そのものが
 * 消えたり増えたりしないよう、この一覧も突き合わせの対象に入れる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BANNED_WORDS, BANNED_NOT_CHECKED, BANNED_ALLOW } from '../build/lib/words.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = fs.readFileSync(path.join(ROOT, 'docs', 'style-guide.md'), 'utf8');

/** 条文の「### 禁止（誇張・情緒）」の直後にある、読点区切りの語の並びを読む */
function bannedInGuide() {
  const m = GUIDE.match(/### 禁止（誇張・情緒）\n\n([^\n]+)\n/);
  assert.ok(m, 'style-guide.md の「### 禁止（誇張・情緒）」と語の並びが見つからない');
  return m[1].split('、').map(w => w.trim()).filter(Boolean);
}

test('条文の禁止語と実装の語リストが一致する', () => {
  const guide = bannedInGuide();
  const impl = [...BANNED_WORDS, ...BANNED_NOT_CHECKED];
  const missing = guide.filter(w => !impl.includes(w));
  const extra = impl.filter(w => !guide.includes(w));
  assert.deepEqual(missing, [], `条文にあって build/lib/words.mjs に無い語: ${missing.join('、')}`);
  assert.deepEqual(extra, [], `build/lib/words.mjs にあって条文に無い語: ${extra.join('、')}`);
});

test('機械で見ない語は、条文にも理由つきで書いてある', () => {
  for (const w of BANNED_NOT_CHECKED) {
    assert.ok(
      GUIDE.includes(`「${w}」だけは機械で検出しない`),
      `${w} を BANNED_NOT_CHECKED に入れたなら、条文にも除外の理由を書く`,
    );
  }
  assert.ok(GUIDE.includes('BANNED_NOT_CHECKED'), '条文が BANNED_NOT_CHECKED を指していない');
});

test('禁止語の除外は、語の一部として実在するものに限る', () => {
  // 「神」以外を機械検査から外すときは、まずここを直す判断が要る。
  // 部分一致で誤検出が出ない語を黙って除外すると、地の文の誇張が素通りする
  assert.deepEqual(BANNED_NOT_CHECKED, ['神']);
});

test('BANNED_ALLOW は、収録している書名に載らないものだけを持つ', async () => {
  const { SUBJECTS } = await import('../build/lib/extract.mjs');
  const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
  const names = new Set();
  for (const s of SUBJECTS) {
    for (const b of loadSubjectData(ROOT, s.dir).books) {
      if (b.name) names.add(String(b.name));
      if (b.official) names.add(String(b.official));
    }
  }
  for (const allow of BANNED_ALLOW) {
    // 書名に含まれているなら BOOKS から自動で集まるので、手で足す必要はない
    const covered = [...names].some(n => n.includes(allow));
    assert.ok(!covered, `${allow} は書名から自動で集まるので BANNED_ALLOW に要らない`);
    // 逃げ道にしないため、除外してよいのは禁止語を含む固有名詞だけ
    assert.ok(
      BANNED_WORDS.some(w => allow.includes(w)),
      `${allow} は禁止語を含まないので BANNED_ALLOW に置く理由が無い`,
    );
  }
});
