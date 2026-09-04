/**
 * 書き直した説明文（desc / pros / cons / bestFor）を各科目トップの BOOKS に流し込む。
 *
 * 入力: data/_rewrite/books-text-rewrite-2026-09-03.json
 *   { subjects: { <科目dir>: { <id>: { name, desc, bestFor, pros, cons } } } }
 *
 * 書き換え先は data/subjects/<科目>/books.json（canonical データ）。
 * 該当レコードの desc / bestFor / pros / cons だけを差し替え、
 * 他のフィールド・並び順は触らない。
 *
 * 以前は科目 index.html を文字列として読み、波括弧の対応でレコードの範囲を数えて
 * 置き換えていた。2026-09-05 に 7 科目すべてを canonical ファイルへ移したので、
 * その経路は廃止した（実装指示書 §25）。
 *
 * 使い方:
 *   node build/apply-book-text.mjs            # 全科目に適用
 *   node build/apply-book-text.mjs --check    # 差分の件数だけ出して書き込まない
 *   node build/apply-book-text.mjs english    # 科目を絞る
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMigrated, loadSubjectData, writeSubjectBooks } from './lib/load-subject-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/_rewrite/books-text-rewrite-2026-09-03.json');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const only = args.filter(a => !a.startsWith('--'));

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let total = 0, changed = 0;

for (const [dir, books] of Object.entries(data.subjects)) {
  if (only.length && !only.includes(dir)) continue;

  /* 移行済み科目は canonical データを直接書き換える。
     HTML の文字列置換（波括弧の対応を数える方式）は、まだ HTML に BOOKS が
     残っている科目のためだけに残す。**両方に書かない。** */
  if (isMigrated(ROOT, dir)) {
    const cur = loadSubjectData(ROOT, dir).books;
    let hit = 0;
    const next = cur.map(b => {
      const text = books[b.id];
      if (!text) return b;
      total++;
      const updated = { ...b, desc: String(text.desc), bestFor: String(text.bestFor),
                        pros: text.pros.map(String), cons: text.cons.map(String) };
      if (JSON.stringify(updated) !== JSON.stringify(b)) { changed++; hit++; }
      return updated;
    });
    const unknown = Object.keys(books).filter(id => !cur.some(b => b.id === id));
    if (unknown.length) throw new Error(`${dir}: canonical データに無い id — ${unknown.join(', ')}`);
    if (!CHECK) writeSubjectBooks(ROOT, dir, next);
    console.log(`${dir}: ${hit} / ${Object.keys(books).length} 冊を書き換え（canonical）${CHECK ? '（--check のため保存しない）' : ''}`);
    continue;
  }

  throw new Error(
    `${dir}: data/subjects/${dir}/ が無い。科目データは canonical ファイルが正本で、`
    + ' 科目 HTML を文字列で書き換える方式は 2026-09-05 に廃止した（実装指示書 §25）');
}

console.log(`${changed} / ${total} 冊`);
