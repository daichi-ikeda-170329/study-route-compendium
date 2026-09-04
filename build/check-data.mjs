/**
 * 生成の前にデータを検証する。**壊れたデータから 1,390 ページを作らないための関門。**
 *
 *   node build/check-data.mjs
 *
 * ここで見るのは「生成しても直らないもの」だけ。文章の質や表記のゆれは
 * build/check-site.mjs が生成後に見る。役割を分けてあるので、両方を流す。
 */
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { isPlaceholder, recordType } from './lib/record-type.mjs';
import { verificationOf, verifiedFieldIsWellFormed, loadVerification, STATUSES } from './lib/verification.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const bad = (m) => problems.push(m);

/* ---------- ISBN ---------- */
function isbn13Valid(v) {
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(v[12]);
}
function isbn10Valid(v) {
  if (!/^\d{9}[\dX]$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(v[i]) * (10 - i);
  sum += v[9] === 'X' ? 10 : Number(v[9]);
  return sum % 11 === 0;
}
function to13(v10) {
  const core = `978${v10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + String((10 - (sum % 10)) % 10);
}

const isbnSeen = new Map();
let total = 0;

for (const s of SUBJECTS) {
  const d = extractSubject(ROOT, s.dir);
  total += d.books.length;
  const ids = new Set();

  for (const b of d.books) {
    const key = `${s.dir}:${b.id}`;
    if (ids.has(b.id)) bad(`${key}: id が重複している`);
    ids.add(b.id);
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(b.id)) bad(`${key}: URL に使えない id`);

    if (!['book', 'routePlaceholder'].includes(recordType(b))) {
      bad(`${key}: 未知の recordType「${recordType(b)}」`);
    }
    if (isPlaceholder(b)) {
      for (const f of ['isbn13', 'isbn10', 'asin', 'year', 'cover']) {
        if (b[f]) bad(`${key}: ルート上の枠が ${f} を持っている`);
      }
    }
    if (b.isbn13 && !isbn13Valid(String(b.isbn13))) bad(`${key}: ISBN-13 のチェックディジットが合わない（${b.isbn13}）`);
    if (b.isbn10 && !isbn10Valid(String(b.isbn10))) bad(`${key}: ISBN-10 のチェックディジットが合わない（${b.isbn10}）`);
    if (b.isbn10 && b.isbn13 && to13(String(b.isbn10)) !== String(b.isbn13)) {
      bad(`${key}: ISBN-10 と ISBN-13 が別の本を指している`);
    }
    if (b.isbn13) {
      const k = String(b.isbn13);
      if (!isbnSeen.has(k)) isbnSeen.set(k, []);
      isbnSeen.get(k).push(key);
    }
  }

  /* ルート・代替が参照する id が実在するか */
  const known = new Set(d.books.map(b => b.id));
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && !known.has(node.id)) bad(`${s.dir}: ルートが未知の id「${node.id}」を参照`);
    for (const a of node.alts || []) if (!known.has(a)) bad(`${s.dir}: 代替が未知の id「${a}」を参照`);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  walk(d.routes);

  /* 志望レベルがルートを持っているか */
  for (const t of d.tiers) {
    if (!d.routes[t.id]) bad(`${s.dir}: 志望レベル「${t.id}」にルートが無い`);
  }
}

for (const [isbn, keys] of isbnSeen) {
  if (keys.length > 1) bad(`ISBN ${isbn} を ${keys.length} 件が共有している: ${keys.join(', ')}`);
}

/* ---------- 確認状態 ---------- */
const led = loadVerification();
for (const [k, r] of Object.entries(led.records)) {
  if (!STATUSES.includes(r.status)) bad(`verification ${k}: 未知の状態「${r.status}」`);
  for (const [f, v] of Object.entries(r.fields || {})) {
    if (!STATUSES.includes(v.status)) bad(`verification ${k}.${f}: 未知の状態「${v.status}」`);
    if (!verifiedFieldIsWellFormed(v)) bad(`verification ${k}.${f}: 出典 URL か確認日が無いのに verified`);
    if (v.sourceUrl && !/^https:\/\//.test(v.sourceUrl)) bad(`verification ${k}.${f}: https 以外の出典 URL`);
  }
}

console.log(`データ検証: ${total} 件のレコードと ${Object.keys(led.records).length} 件の確認状態を見た`);
if (problems.length) {
  for (const p of problems.slice(0, 40)) console.error(`  ✗ ${p}`);
  if (problems.length > 40) console.error(`  … ほか ${problems.length - 40} 件`);
  console.error(`データ検証で ${problems.length} 件見つかった。生成を止める`);
  process.exit(1);
}
console.log('データ検証を通過した');
