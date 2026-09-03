/**
 * 書き直した説明文（desc / pros / cons / bestFor）を各科目トップの BOOKS に流し込む。
 *
 * 入力: data/_rewrite/books-text-rewrite-2026-09-03.json
 *   { subjects: { <科目dir>: { <id>: { name, desc, bestFor, pros, cons } } } }
 *
 * 各科目の index.html を文字列として読み、BOOKS の該当レコードだけを差し替える。
 * レコードの範囲は {id:"<id>", から対応する } までを波括弧の対応で数えて決める
 * （文字列リテラルの中の括弧は数えない）。他のフィールド・整形・並び順は触らない。
 *
 * 使い方:
 *   node build/apply-book-text.mjs            # 全科目に適用
 *   node build/apply-book-text.mjs --check    # 差分の件数だけ出して書き込まない
 *   node build/apply-book-text.mjs english    # 科目を絞る
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/_rewrite/books-text-rewrite-2026-09-03.json');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const only = args.filter(a => !a.startsWith('--'));

/** レコード {id:"..."} の終端を、文字列リテラルを避けつつ波括弧の対応で探す */
function recordEnd(src, start) {
  let depth = 0, q = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error(`レコードの終端が見つからない（${start}）`);
}

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let total = 0, changed = 0;

for (const [dir, books] of Object.entries(data.subjects)) {
  if (only.length && !only.includes(dir)) continue;
  const file = path.join(ROOT, dir, 'index.html');
  let src = fs.readFileSync(file, 'utf8');
  let hit = 0;

  for (const [id, text] of Object.entries(books)) {
    total++;
    // 同じ {id:"..."} は ROUTES の中にも現れる。書誌フィールドを持つものだけが BOOKS のレコード。
    // BOOKS.push() で足した新刊はキーが引用符つき（{"id":"..."}）なので両方を探す
    const markers = [`{id:"${id}",`, `{"id":"${id}",`];
    const found = [];
    for (const marker of markers) {
      for (let i = src.indexOf(marker); i >= 0; i = src.indexOf(marker, i + 1)) {
        const e = recordEnd(src, i);
        if (/"?\bisbn1[03]"?:|"?\bpub"?:/.test(src.slice(i, e))) found.push([i, e]);
      }
    }
    if (found.length === 0) throw new Error(`${dir}: id="${id}" のレコードが見つからない`);
    if (found.length > 1) throw new Error(`${dir}: id="${id}" のレコードが ${found.length} 個ある`);
    const [start, end] = found[0];
    let rec = src.slice(start, end);
    const before = rec;

    const str = s => JSON.stringify(String(s));
    const arr = a => '[' + a.map(str).join(',') + ']';
    const put = (field, value) => {
      const re = new RegExp(`("?\\b${field}"?:)("(?:[^"\\\\]|\\\\.)*")`);
      if (!re.test(rec)) throw new Error(`${dir}/${id}: ${field} が無い`);
      rec = rec.replace(re, (_, k) => k + value);
    };
    const putArr = (field, value) => {
      const re = new RegExp(`("?\\b${field}"?:)(\\[(?:[^\\]"]|"(?:[^"\\\\]|\\\\.)*")*\\])`);
      if (!re.test(rec)) throw new Error(`${dir}/${id}: ${field} が無い`);
      rec = rec.replace(re, (_, k) => k + value);
    };

    put('desc', str(text.desc));
    put('bestFor', str(text.bestFor));
    putArr('pros', arr(text.pros));
    putArr('cons', arr(text.cons));

    if (rec !== before) { changed++; hit++; }
    src = src.slice(0, start) + rec + src.slice(end);
  }

  if (!CHECK) fs.writeFileSync(file, src);
  console.log(`${dir}: ${hit} / ${Object.keys(books).length} 冊を書き換え${CHECK ? '（--check のため保存しない）' : ''}`);
}

console.log(`${changed} / ${total} 冊`);
