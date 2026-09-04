/**
 * 公開表示の冊数が、元データ（BOOKS）の実数と一致していることを検査する。
 *
 * 冊数は「フッターの科目別」「ポータルと科目トップの合計」「法務・方法論ページ」
 * 「OGP 台帳」「将来用の X 投稿案」に散っている。1 か所を直しても残りが古いまま
 * 公開されるので、**元データから数え直した値とだけ**突き合わせる。
 *
 * 利用者が見る単位は「冊」で統一する。内部では record と呼んでよいが、公開表示で
 * 「項目」「レコード」へ言い換えない（指示書 3 節）。ここではその露出も見張る。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractSubject, SUBJECTS } from '../build/lib/extract.mjs';
import { ROOT } from './helpers.mjs';

/* ---------- 元データから数え直す（唯一の正本） ---------- */
const counts = {};
let TOTAL = 0;
for (const s of SUBJECTS) {
  counts[s.dir] = extractSubject(ROOT, s.dir).books.length;
  TOTAL += counts[s.dir];
}
const byJa = new Map(SUBJECTS.map(s => [s.ja, counts[s.dir]]));

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'data']);
function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const HTML = htmlFiles();

test('全公開 HTML のフッターの科目別冊数が元データと一致する', () => {
  const re = /<b>([^<]*?)ルート大全<\/b><span>([\d,]+) BOOKS<\/span>/g;
  const bad = [];
  let seen = 0;
  for (const file of HTML) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) {
      seen++;
      const want = byJa.get(m[1]);
      const got = Number(m[2].replace(/,/g, ''));
      if (want === undefined) bad.push(`${path.relative(ROOT, file)}: 未知の科目「${m[1]}」`);
      else if (want !== got) bad.push(`${path.relative(ROOT, file)}: ${m[1]} は ${want} 冊のはずが ${got}`);
    }
  }
  assert.ok(seen >= SUBJECTS.length * 10, `フッターが ${seen} 件しか見つからない。構造を変えたなら正規表現も直す`);
  assert.deepEqual(bad, [], `フッターの冊数がずれている:\n${bad.slice(0, 20).join('\n')}`);
});

test('フッター検査は理科の表示を変えれば落ちる（検査そのものが効いていることの確認）', () => {
  const fixture = '<b>理科ルート大全</b><span>375 BOOKS</span>';
  const m = /<b>([^<]*?)ルート大全<\/b><span>([\d,]+) BOOKS<\/span>/.exec(fixture);
  assert.notEqual(byJa.get(m[1]), Number(m[2]), '375 が理科の実数と一致してしまっている。fixture を実数以外へ変える');
});

test('ポータルと科目トップに書かれた合計冊数が元データと一致する', () => {
  const want = TOTAL.toLocaleString('en-US');
  const targets = ['index.html', ...SUBJECTS.map(s => `${s.dir}/index.html`)];
  for (const rel of targets) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // 「参考書・問題集1,390冊」「参考書1390冊」など、合計を名乗る表記のゆれを両方見る
    const nums = [...src.matchAll(/参考書(?:・問題集)?\s*([\d,]{3,6})\s*冊/g)].map(m => m[1].replace(/,/g, ''));
    for (const n of nums) {
      // 科目ページは自科目の冊数も同じ言い回しで書く。合計・自科目のどちらかであればよい
      const ok = Number(n) === TOTAL || Object.values(counts).includes(Number(n));
      assert.ok(ok, `${rel}: 「参考書${n}冊」は元データに無い値（合計は ${want}）`);
    }
  }
});

test('公開表示に「項目」「レコード」で件数を言い換えた箇所が無い', () => {
  const re = /([\d,]{3,6})\s*(項目|レコード)/g;
  const bad = [];
  for (const file of HTML) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (n === TOTAL || Object.values(counts).includes(n)) {
        bad.push(`${path.relative(ROOT, file)}: 「${m[0]}」— 公開表示の単位は「冊」`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('将来用の X 投稿案に古い冊数が残っていない', () => {
  const dir = path.join(ROOT, 'docs', 'x-posts');
  const valid = new Set([TOTAL, ...Object.values(counts)]);
  const bad = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/([\d,]{4,6})\s*冊/g)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (n >= 100 && !valid.has(n)) bad.push(`docs/x-posts/${f}: 「${m[0]}」は元データに無い`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('OGP 台帳の科目別画像が、現在の冊数で焼かれている', () => {
  const ledger = path.join(ROOT, 'build', 'data', 'ogp-hashes.json');
  const raw = JSON.parse(fs.readFileSync(ledger, 'utf8')).files;
  // 台帳は「画像パス -> 入力のハッシュ」。冊数そのものは持たないので、
  // 科目別 OGP が 7 科目ぶんと共通 1 枚だけ揃っているかを見る（画像の中身は gen-ogp --check）
  const subjectImgs = Object.keys(raw).filter(k => /^assets\/ogp-[a-z]+\.png$/.test(k));
  assert.equal(subjectImgs.length, SUBJECTS.length, `科目別 OGP は ${SUBJECTS.length} 枚のはず`);
  assert.ok(Object.prototype.hasOwnProperty.call(raw, 'assets/ogp.png'), '共通 OGP が台帳に無い');
});
