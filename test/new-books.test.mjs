/**
 * 新刊（評価が未了の収録本）まわりのテスト。
 *
 *   node --test test/new-books.test.mjs
 *
 * 設計は docs/new-books-plan.md。ここで守るのは 5 つ。
 *
 *   1. 注入のマーカー区間が往復する（書き換えても他所を壊さない）
 *   2. 難易度を持たない本を通しても描画が落ちず、undefined が出ない
 *   3. 科目トップ 5 枚に「評価準備中」の分岐が全部入っている
 *   4. F 型（新刊速報）が難易度を書かず、X の文字数に収まる
 *   5. 調査先の出版社名が、実際の収録データの表記と一致している
 *
 * 2 が最も重要である。新刊は diff・pros・cons・bestFor を持たないので、
 * 分岐を 1 つ落とすだけで画面に undefined が出るか、TypeError で描画が止まる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'vm';
import { fileURLToPath } from 'node:url';

import { serializeBook, replaceBlock } from '../build/apply-new-books.mjs';
import { isProvisional, provisionalLast, PROVISIONAL_LABEL, loadNewBooks } from '../build/lib/newbooks.mjs';
import { bookCard } from '../build/lib/cards.mjs';
import { SUBJECTS, extractSubject } from '../build/lib/extract.mjs';
import { postF, weightedLen, X_LIMIT } from '../build/gen-x-posts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ============================================================
   注入
   ============================================================ */

const BEGIN = '/* NEW BOOKS — 自動生成。build/apply-new-books.mjs が書き換える。手で編集しない */';
const END = '/* /NEW BOOKS */';

test('マーカー区間だけが書き換わり、前後は変わらない', () => {
  const src = `前\n${BEGIN}\n古い中身\n${END}\n後`;
  const out = replaceBlock(src, '\n新しい中身\n');
  assert.equal(out, `前\n${BEGIN}\n新しい中身\n${END}\n後`);
  assert.ok(out.startsWith('前\n'));
  assert.ok(out.endsWith('\n後'));
});

test('マーカーが無ければ null を返す（呼び出し側がエラーで止める）', () => {
  assert.equal(replaceBlock('マーカーの無いファイル', 'x'), null);
  assert.equal(replaceBlock(`${BEGIN} 閉じが無い`, 'x'), null);
});

test('書き換えは繰り返しても同じ結果になる', () => {
  const src = `前\n${BEGIN}\n${END}\n後`;
  const once = replaceBlock(src, '\nA\n');
  assert.equal(replaceBlock(once, '\nA\n'), once);
});

test('区間を空にすると、注入前の状態に戻る', () => {
  // apply-new-books.mjs は id の衝突を「注入前の状態」を基準に見る。
  // ここを素通りさせると、前回自分が注入した本を既存書として数えてしまい、
  // 同じ new-books.json で 2 回目を流したときに衝突として落ちる
  const base = `const BOOKS = [{id:"a"}];\n${BEGIN}\n${END}\n`;
  const injected = replaceBlock(base, '\nBOOKS.push({"id":"newone"});\n');
  assert.ok(injected.includes('newone'));
  const cleared = replaceBlock(injected, '\n');
  assert.ok(!cleared.includes('newone'), '空にしても注入分が残っている');
  assert.equal(cleared, base);
});

test('直列化は subject を落とし、</script> を無害化する', () => {
  const s = serializeBook({ subject: 'english', id: 'x', name: '</script><b>注入</b>' });
  assert.ok(!s.includes('"subject"'), 'subject は BOOKS に持たせない');
  assert.ok(!s.includes('</script>'), '生の </script> が残ると script 要素がそこで閉じる');
  assert.ok(s.includes('<\\/script>'));
  // 無害化しても値そのものは変わらない
  assert.equal(JSON.parse(s).name, '</script><b>注入</b>');
});

test('直列化した結果は JS として評価でき、元の値に戻る', () => {
  const b = { subject: 'math', id: 'newbook1', name: 'テスト', pub: '出版社', provisional: true };
  // vm の中で作られたオブジェクトは別 realm の prototype を持つ。
  // 展開して現 realm の素のオブジェクトに移してから比べる
  const got = { ...vm.runInNewContext(`(${serializeBook(b)})`) };
  assert.deepEqual(got, { id: 'newbook1', name: 'テスト', pub: '出版社', provisional: true });
});

/* ============================================================
   承認ファイルの検証
   ============================================================ */

test('承認済み新刊はいま読める（必須項目・重複の検査を通る）', () => {
  const books = loadNewBooks(ROOT);
  assert.ok(Array.isArray(books));
  for (const b of books) {
    assert.ok(SUBJECTS.some(s => s.dir === b.subject), `${b.id} の subject が科目名でない`);
    assert.equal(isProvisional(b), true, `${b.id} は provisional: true のはず`);
  }
});

/* ============================================================
   評価未了の表示
   ============================================================ */

const PROV = {
  id: 'testnew', name: 'テスト新刊', official: 'テスト新刊 2026年版',
  pub: 'テスト出版', year: 2026, stage: 'tango', provisional: true,
};
const SUB = SUBJECTS[0];
const STAGES = { tango: { label: '単語・語彙', short: '単語', color: '#B5432A' } };

test('カードは難易度を持たない本でも undefined を出さない', () => {
  const html = bookCard(PROV, SUB, STAGES);
  assert.ok(!html.includes('undefined'), `undefined が出た:\n${html}`);
  assert.ok(!html.includes('NaN'));
  assert.ok(html.includes(PROVISIONAL_LABEL), '「評価準備中」のバッジが出ていない');
  assert.ok(!html.includes('難易度'), '難易度の数字を出してはいけない');
});

test('カードは評価済みの本ではこれまでどおり難易度を出す', () => {
  const html = bookCard({ ...PROV, provisional: false, diff: 4, hensachi: '45〜58', desc: '説明' }, SUB, STAGES);
  assert.ok(html.includes('難易度 4'));
  assert.ok(!html.includes(PROVISIONAL_LABEL));
  assert.ok(!html.includes('undefined'));
});

test('難易度順の並びで、評価未了の本は必ず末尾へ落ちる', () => {
  const list = [
    { id: 'a', diff: 5 }, PROV, { id: 'b', diff: 1 }, { ...PROV, id: 'p2' }, { id: 'c', diff: 9 },
  ];
  const sorted = [...list].sort((x, y) => provisionalLast(x, y) || x.diff - y.diff);
  assert.deepEqual(sorted.map(b => b.id), ['b', 'a', 'c', 'testnew', 'p2']);
  // 比較子が対称であること（NaN が混じると入力順で結果が変わる）
  const rev = [...list].reverse().sort((x, y) => provisionalLast(x, y) || x.diff - y.diff);
  assert.deepEqual(rev.slice(0, 3).map(b => b.id), ['b', 'a', 'c']);
});

test('isProvisional は true 以外を評価未了と見なさない', () => {
  for (const v of [undefined, null, false, 0, '', 'true', 1]) {
    assert.equal(isProvisional({ provisional: v }), false, `${JSON.stringify(v)} を通してはいけない`);
  }
  assert.equal(isProvisional({ provisional: true }), true);
  assert.equal(isProvisional(undefined), false);
});

/* ============================================================
   科目トップ（全科目）
   ============================================================ */

test('科目トップすべてに評価未了の分岐が入っている', () => {
  // 1 枚でも落ちていると、その科目だけ画面に undefined が出る。
  // 科目トップは手書きの HTML で、同じ修正を科目の数だけ当てる形になるため取りこぼしやすい
  for (const s of SUBJECTS) {
    const src = fs.readFileSync(path.join(ROOT, s.dir, 'index.html'), 'utf8');
    assert.ok(src.includes('function isProv(b)'), `${s.dir}: isProv が無い`);
    assert.ok(src.includes('function provLast(a,b)'), `${s.dir}: provLast が無い`);
    assert.ok(src.includes(`const PROV_LABEL = "${PROVISIONAL_LABEL}"`),
      `${s.dir}: 文言が build/lib/newbooks.mjs と食い違っている`);
    assert.ok(src.includes('if(d==null) return "var(--line)"'), `${s.dir}: diffColor に guard が無い`);
    assert.ok(src.includes('const dots = isProv(b) ?'), `${s.dir}: カードのドットに分岐が無い`);
    assert.ok(src.includes('isProv(b) ? `<span class="bc-prov">'), `${s.dir}: カードのバッジが無い`);
    assert.ok(src.includes('(b.pros||[])'), `${s.dir}: pros の guard が無い（TypeError で描画が止まる）`);
    assert.ok(src.includes('(b.cons||[])'), `${s.dir}: cons の guard が無い`);
    assert.ok(src.includes('provLast(a,b) || a.diff-b.diff'), `${s.dir}: やさしい順の並びに guard が無い`);
    assert.ok(src.includes('provLast(a,b) || b.diff-a.diff'), `${s.dir}: 難しい順の並びに guard が無い`);
    assert.ok(src.includes('.bc-prov{'), `${s.dir}: バッジの CSS が無い`);
    assert.ok(src.includes(BEGIN) && src.includes(END), `${s.dir}: NEW BOOKS のマーカー区間が無い`);
  }
});

test('英語の現在地推定は、評価未了の本を最難関と誤判定しない', () => {
  // bookLv は英語だけが持つ。diff を持たない本をそのまま通すと比較が全部 false になり、
  // 「最難関を終えた人」に化けて診断の現在地が跳ね上がる
  const src = fs.readFileSync(path.join(ROOT, 'english', 'index.html'), 'utf8');
  const m = src.match(/function bookLv\(b\)\{[^}]*\}/);
  assert.ok(m, 'bookLv が見つからない');
  const bookLv = vm.runInNewContext(
    `function isProv(b){ return !!b && b.provisional === true; } ${m[0]}; bookLv`,
  );
  assert.equal(bookLv(PROV), null, '評価未了の本は判定不能（null）であるべき');
  assert.equal(bookLv({ diff: null }), null);
  assert.equal(bookLv({ diff: 2 }), 0);
  assert.equal(bookLv({ diff: 5 }), 2);
  assert.equal(bookLv({ diff: 10 }), 3);
});

/* ============================================================
   F 型（新刊速報）
   ============================================================ */

const EN_STAGES = extractSubject(ROOT, 'english').stages;

test('F 型は難易度も向いている人も書かない', () => {
  const p = postF({ ...PROV, subjects: '単語1500' }, SUB, EN_STAGES);
  assert.ok(p, '投稿文が作れなかった');
  assert.ok(!/難易度\s*\d/.test(p.text), `難易度の数字が入っている:\n${p.text}`);
  assert.ok(!p.text.includes('向いている人'));
  assert.ok(!p.text.includes('undefined'));
  assert.ok(p.text.includes('評価はまだしていません'), '評価未了であることを書いていない');
});

test('F 型は書籍ページへ F 型の utm 付きで送る', () => {
  const p = postF(PROV, SUB, EN_STAGES);
  assert.ok(p.text.includes(`/${SUB.dir}/books/${PROV.id}/`));
  assert.ok(p.text.includes('utm_campaign=rt_f_new'), 'utm が A 型などと混ざる');
});

test('F 型は X の文字数上限に収まる', () => {
  const p = postF({ ...PROV, subjects: '単語1500・熟語300・文法400' }, SUB, EN_STAGES);
  assert.ok(weightedLen(p.text) <= X_LIMIT, `${weightedLen(p.text)} / ${X_LIMIT} で超過`);
});

test('F 型は書名が長すぎれば null を返す（黙って壊れた投稿を作らない）', () => {
  // 落とせる行を全部落としても収まらない場合。呼び出し側が報せる作りになっている
  const p = postF({ ...PROV, name: 'あ'.repeat(200) }, SUB, EN_STAGES);
  assert.equal(p, null);
});

test('F 型は subjects を持たない本でも壊れない', () => {
  const p = postF(PROV, SUB, EN_STAGES);
  assert.ok(p && !p.text.includes('undefined'));
  assert.ok(!p.text.includes('収録：'), 'subjects が無いのに収録欄が出ている');
});

/* ============================================================
   調査先の出版社
   ============================================================ */

test('調査先の出版社名は、実際の収録データの表記と一致している', () => {
  // publishers.json の name は BOOKS[].pub と突き合わせるために使う。
  // 表記がずれていると「未収録」の判定が狂い、既に載っている本を新刊として拾う
  const file = path.join(ROOT, 'build', 'data', 'publishers.json');
  const { publishers, searchQueries } = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(publishers.length >= 10, '調査先が少なすぎる');
  assert.ok(searchQueries.length >= 1, '検索クエリが無い');

  const pubs = new Set();
  for (const s of SUBJECTS) {
    for (const b of extractSubject(ROOT, s.dir).books) pubs.add(b.pub);
  }
  const unknown = publishers
    .flatMap(p => [p.name, ...(p.aliases || [])])
    .filter(n => !pubs.has(n));
  assert.deepEqual(unknown, [], `収録データに存在しない出版社名: ${unknown.join(' / ')}`);

  for (const p of publishers) {
    assert.match(p.url, /^https:\/\//, `${p.name} の URL が https でない`);
  }
});
