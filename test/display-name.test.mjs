/**
 * 読者に見せる書名（build/lib/booktitle.mjs の displayName）の検査。
 *
 * 2026-09-10 まで、title / h1 だけが正式名称を使い、カード・ルートの行・大学別ページの
 * おすすめは編集上の内部略称（「関東難関私大」「実況中継①」）をそのまま出していた。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from './helpers.mjs';

const { SUBJECTS } = await import('../build/lib/extract.mjs');
const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { displayName, isShorthand, DISPLAY_MAX } = await import('../build/lib/booktitle.mjs');
const { clientBooks } = await import('../build/lib/subject-assets.mjs');

const book = (dir, id) => loadSubjectData(ROOT, dir).books.find(b => b.id === id);

test('分野名を落とした略称は正式名称で出す（関東難関私大）', () => {
  assert.equal(displayName(book('social', 'kanto-nankan-shidai-sekaishi'), 'social'), '関東難関私大世界史問題集');
});

test('同じ科目に同名の本がある略称は、区別できる名前で出す（実況中継①）', () => {
  const nihon = displayName(book('social', 'jikkyo-nihonshi-1'), 'social');
  const sekai = displayName(book('social', 'jikkyo-sekaishi-1'), 'social');
  assert.notEqual(nihon, sekai);
  assert.doesNotMatch(nihon, /^実況中継①$/);
  assert.match(nihon, /日本史/);
  assert.match(sekai, /世界史/);
});

test('版表記だけが違う本は略称とみなさない', () => {
  const t = book('english', 'target1900');
  assert.ok(t, 'target1900 が無い');
  assert.equal(isShorthand(t, 'english'), false);
  assert.equal(displayName(t, 'english'), t.name);
});

test('科目の中で表示名が重ならず、正式名称に差し替えた名前は上限の長さに収まる', () => {
  for (const s of SUBJECTS) {
    const seen = new Map();
    for (const b of loadSubjectData(ROOT, s.dir).books) {
      const dn = displayName(b, s.dir);
      assert.ok(dn, `${s.dir}/${b.id}: 表示名が空`);
      if (seen.has(dn)) assert.fail(`${s.dir}: 「${dn}」が ${seen.get(dn)} と ${b.id} で重なる`);
      seen.set(dn, b.id);
      if (dn !== b.name && !dn.startsWith(b.name)) {
        assert.ok([...dn].length <= DISPLAY_MAX, `${s.dir}/${b.id}: 「${dn}」が ${DISPLAY_MAX} 字を超える`);
      }
    }
  }
});

test('科目を渡さなくても、読み込んだ本なら同じ表示名になる（書影の枠から呼ばれるため）', () => {
  const b = book('social', 'jikkyo-sekaishi-2');
  assert.equal(displayName(b), displayName(b, 'social'));
});

test('配信する BOOKS には、表示名が違う本にだけ dn を載せる', () => {
  const d = loadSubjectData(ROOT, 'social');
  const out = clientBooks(d);
  const j = out.find(b => b.id === 'jikkyo-nihonshi-1');
  assert.equal(j.dn, displayName(book('social', 'jikkyo-nihonshi-1'), 'social'));
  const plain = out.find(b => displayName(b, 'social') === b.name);
  assert.equal(plain.dn, undefined, '表示名が name と同じ本に dn を足している');
  assert.equal(out.length, d.books.length);
});
