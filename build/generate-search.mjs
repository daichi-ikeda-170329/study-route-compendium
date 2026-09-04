/**
 * 全ページ共通の検索ボックスが引く索引（/assets/js/book-index.js）を生成する。
 *
 * 5 科目の BOOKS を 1 本にまとめ、検索用の文字列を作り置きした配列にする。
 * 検索は利用者の端末で走るので、索引は全ページから読める静的ファイルとして置く。
 *
 * 1 冊 = [科目インデックス, id, 書名, 出版社, 役割の短縮名, 検索用の追加語]
 *
 * 追加語には次の 3 つが入る。
 *   - 正式名・収録範囲・分野・役割（書名と出版社だけでは引けない語）
 *   - build/data/aliases.json のあだ名（「ネクステ」「シス単」など）
 *
 * どの語も assets/js/search.js の normalize() を通した形で持つ。検索側も同じ関数を
 * 通すので、「ポレポレ / ぽれぽれ」「Next Stage / nextstage」の違いは吸収される。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { SUBJECTS, SUB_LABELS } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';

/* 検索側（assets/js/search.js）と同じ正規化を使う。
   索引と検索で別々に実装すると、片方だけ直したときに黙って引けなくなる */
const { normalize } = createRequire(import.meta.url)('../assets/js/search.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'js', 'book-index.js');
const ALIAS_FILE = path.join(ROOT, 'build', 'data', 'aliases.json');

/** 呼び名の辞書。key は "<科目>:<id>"。実在しない書籍を指していたらビルドを止める */
function loadAliases(byDir) {
  const raw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
  const out = new Map();
  const bad = [];
  for (const [key, list] of Object.entries(raw.aliases || {})) {
    const [dir, id] = key.split(':');
    if (!byDir[dir] || !byDir[dir].has(id)) { bad.push(key); continue; }
    out.set(key, list);
  }
  if (bad.length) {
    throw new Error(`aliases.json が存在しない書籍を指している — ${bad.join(', ')}`);
  }
  return out;
}


/**
 * 書名・出版社だけでは引けない語（正式名・収録範囲・分野・役割）を 1 本に潰す。
 *
 * 書名と出版社は表示用の項目にすでに入っているので、ここには含めない。
 * 検索側は「書名 + 出版社 + この文字列」を突き合わせる。索引を 2 割ほど小さくできる。
 */
function extraTerms(b, stages, aliases) {
  const st = stages[b.stage] || {};
  const parts = [b.official, b.subjects, SUB_LABELS[b.sub] || '', st.label || '', ...aliases];
  /* 書名と出版社は表示用の項目にすでに入っていて、検索側が同じ正規化を通して足す。
     ここで重ねると索引が太るだけなので、同じ形になったものは落とす */
  const seen = new Set([normalize(b.name), normalize(b.pub)]);
  const out = [];
  for (const p of parts) {
    const t = normalize(p);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.join(' ');
}

const subjects = [];
const books = [];
const data = SUBJECTS.map((s) => loadSubjectData(ROOT, s.dir));
const byDir = Object.fromEntries(SUBJECTS.map((s, i) => [s.dir, new Set(data[i].books.map((b) => b.id))]));
const aliasMap = loadAliases(byDir);

for (let i = 0; i < SUBJECTS.length; i++) {
  const s = SUBJECTS[i];
  const d = data[i];
  subjects.push([s.dir, s.ja, s.mark, s.color]);
  for (const b of d.books) {
    const st = d.stages[b.stage] || {};
    const aliases = aliasMap.get(`${s.dir}:${b.id}`) || [];
    books.push([i, b.id, b.name, b.pub || '', st.short || '', extraTerms(b, d.stages, aliases)]);
  }
}

const payload = { v: 1, subjects, books };
const js = `/* 自動生成 — build/generate-search.mjs が出力する。手で編集しない */
window.RT_BOOK_INDEX = ${JSON.stringify(payload)};
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, js);
console.log(`  ✓ assets/js/book-index.js  (${books.length}冊 / あだ名 ${aliasMap.size}冊分 / ${(Buffer.byteLength(js) / 1024).toFixed(1)}KB)`);
