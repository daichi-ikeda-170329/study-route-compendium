/**
 * 全ページ共通の検索ボックスが引く索引（/assets/js/book-index.js）を生成する。
 *
 * 5 科目の BOOKS を 1 本にまとめ、検索用の文字列を作り置きした配列にする。
 * 検索は利用者の端末で走るので、索引は全ページから読める静的ファイルとして置く。
 *
 * 1 冊 = [科目インデックス, id, 書名, 出版社, 役割の短縮名, 検索用の追加語]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, SUB_LABELS } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'js', 'book-index.js');

/**
 * 書名・出版社だけでは引けない語（正式名・収録範囲・分野・役割）を 1 本に潰す。
 *
 * 書名と出版社は表示用の項目にすでに入っているので、ここには含めない。
 * 検索側は「書名 + 出版社 + この文字列」を突き合わせる。索引を 2 割ほど小さくできる。
 */
function extraTerms(b, stages) {
  const st = stages[b.stage] || {};
  const parts = [b.official, b.subjects, SUB_LABELS[b.sub] || '', st.label || ''];
  const seen = new Set([String(b.name).toLowerCase(), String(b.pub || '').toLowerCase()]);
  const out = [];
  for (const p of parts) {
    const t = String(p || '').toLowerCase().trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.join(' ');
}

const subjects = [];
const books = [];

for (let i = 0; i < SUBJECTS.length; i++) {
  const s = SUBJECTS[i];
  const d = extractSubject(ROOT, s.dir);
  subjects.push([s.dir, s.ja, s.mark, s.color]);
  for (const b of d.books) {
    const st = d.stages[b.stage] || {};
    books.push([i, b.id, b.name, b.pub || '', st.short || '', extraTerms(b, d.stages)]);
  }
}

const payload = { v: 1, subjects, books };
const js = `/* 自動生成 — build/generate-search.mjs が出力する。手で編集しない */
window.RT_BOOK_INDEX = ${JSON.stringify(payload)};
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, js);
console.log(`  ✓ assets/js/book-index.js  (${books.length}冊 / ${(Buffer.byteLength(js) / 1024).toFixed(1)}KB)`);
