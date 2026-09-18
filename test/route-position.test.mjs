/**
 * 書籍ページの「志望校別ルートでの位置」（build/lib/route-position.mjs）の検査。
 *
 * 2026-09-18 に足した節。ROUTES から数えた「何冊目・前後の本・代わりに使える本」を
 * 書くので、数え間違いはそのまま誤情報として公開される。実データで突き合わせる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from './helpers.mjs';

const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');
const { routePositions, adoptedPeers, tierUniversities } = await import('../build/lib/route-position.mjs');
const { SUBJECTS } = await import('../build/lib/extract.mjs');

const cache = new Map();
const load = (dir) => {
  if (!cache.has(dir)) cache.set(dir, loadSubjectData(ROOT, dir));
  return cache.get(dir);
};
const book = (dir, id) => {
  const b = load(dir).books.find(x => x.id === id);
  assert.ok(b, `${dir}/${id} が無い`);
  return b;
};

test('本編に載っている本は、何冊目かと前後の本が ROUTES の並びと一致する', () => {
  const d = load('english');
  const pos = routePositions(book('english', 'hijii-dokkai-hisshu'), d);
  assert.ok(pos.lines > 0);
  assert.ok(pos.main.length > 0, '本編に 1 つも見つからない');
  for (const e of pos.main) {
    const node = d.routes[e.tier.id];
    for (const tk of e.tracks) {
      const list = node[tk][e.policy];
      assert.equal(list.length, e.total, `${e.tier.id}/${tk}/${e.policy} の冊数`);
      assert.equal(list[e.index - 1].id, 'hijii-dokkai-hisshu', `${e.tier.id}/${tk}/${e.policy} の位置`);
      if (e.prev) assert.equal(list[e.index - 2].id, e.prev.id, '前の本');
      if (e.next) assert.equal(list[e.index].id, e.next.id, '次の本');
      assert.deepEqual(e.alts.map(a => a.id), list[e.index - 1].alts || [], '代わりに使える本');
    }
  }
});

test('adopted は、まとめる前のトラック数で数える（本編が同一のトラックは 1 行にまとめても数は減らない）', () => {
  const d = load('english');
  const id = 'hijii-dokkai-hisshu';
  let naive = 0;
  for (const node of Object.values(d.routes)) {
    for (const [k, v] of Object.entries(node)) {
      if (!v || Array.isArray(v) || ['para', 'final', 'basic'].includes(k)) continue;
      for (const pol of ['omni', 'quick']) if ((v[pol] || []).some(s => s.id === id)) naive++;
    }
  }
  assert.equal(routePositions(book('english', id), d).adopted, naive);
});

test('ルートに載っていない本は main / asAlt / side がすべて空で、同じ役割の採用例が引ける', () => {
  for (const s of SUBJECTS) {
    const d = load(s.dir);
    if (!d.tiers.length) continue;
    const none = d.books.find(b => !b.provisional && (() => {
      const p = routePositions(b, d);
      return !p.main.length && !p.asAlt.length && !p.side.length;
    })());
    if (!none) continue;
    const peers = adoptedPeers(none, d);
    for (const p of peers) {
      assert.equal(p.book.stage, none.stage, `${s.dir}/${none.id}: 別の役割の本が混ざっている`);
      assert.ok(p.count > 0);
    }
  }
});

test('alts にだけ挙げた本は asAlt に出て、その段の本が forBook になる', () => {
  const d = load('english');
  // 入門英文解釈の技術70 は読解のための英文法(必修編) の代替として多くの段で挙がる
  const pos = routePositions(book('english', 'gijutsu70'), d);
  assert.ok(pos.asAlt.length > 0, 'asAlt が空');
  for (const e of pos.asAlt) {
    const node = d.routes[e.tier.id];
    for (const tk of e.tracks) {
      const step = node[tk][e.policy][e.index - 1];
      assert.equal(step.id, e.forBook.id);
      assert.ok((step.alts || []).includes('gijutsu70'));
    }
  }
});

test('ルートが無い科目（情報・小論文）では lines が 0', () => {
  for (const dir of ['joho', 'shoron']) {
    const d = load(dir);
    const pos = routePositions(d.books[0], d);
    assert.equal(pos.lines, 0);
    assert.deepEqual(pos.main, []);
  }
});

test('志望レベルの大学は台帳に slug がある大学だけを返す', () => {
  const d = load('english');
  const slugs = new Map([['東京大学', 'tokyo'], ['存在しない大学', 'nope']]);
  const top = d.tiers.find(t => t.id === 'top');
  const list = tierUniversities(top, d, slugs);
  assert.deepEqual(list, [{ name: '東京大学', slug: 'tokyo' }]);
});
