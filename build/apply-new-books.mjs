/**
 * 承認済みの新刊を各科目 index.html へ注入する。
 *
 *   node build/apply-new-books.mjs          注入する
 *   node build/apply-new-books.mjs --check  差分が出るかだけ見る（書き込まない）
 *
 * 正本は build/data/new-books.json。設計は docs/new-books-plan.md。
 *
 * 科目ページはビルド工程を持たない単一 HTML なので、データは <script> の中に
 * リテラルとして書かれている。ここでは BOOKS 配列そのものは触らず、その直後に
 * 置いたマーカー区間を丸ごと書き換えて BOOKS.push() を出力する。
 * build/lib/extract.mjs は vm 上で script を実行するので、push 分も回収される。
 *
 * **マーカーが無い科目があったらエラーで止める。** 黙って何もしないと掲載漏れに
 * 気づけないため。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { loadNewBooks } from './lib/newbooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const BEGIN = '/* NEW BOOKS — 自動生成。build/apply-new-books.mjs が書き換える。手で編集しない */';
const END = '/* /NEW BOOKS */';

/**
 * 1 冊を JS のオブジェクトリテラルにする。
 *
 * JSON.stringify をそのまま使う。手で書く BOOKS 配列と体裁は揃わないが、
 * この区間は機械が書き換える前提なので、読みやすさより取りこぼしの無さを取る。
 *
 * `</` を `<\/` に潰すのは、値に `</script>` が入ったときに HTML の script 要素が
 * そこで閉じてしまうのを防ぐため。JSON でも JS でも `\/` は `/` として解釈される。
 */
export function serializeBook(b) {
  const { subject, ...rest } = b;   // subject は科目の振り分け用。BOOKS には持たせない
  return JSON.stringify(rest).replace(/<\//g, '<\\/');
}

/** マーカー区間の中身を差し替える。区間が無ければ null を返す */
export function replaceBlock(src, body) {
  const i = src.indexOf(BEGIN);
  if (i < 0) return null;
  const j = src.indexOf(END, i);
  if (j < 0) return null;
  return src.slice(0, i + BEGIN.length) + body + src.slice(j);
}

function buildBody(books) {
  if (!books.length) return '\n';
  return `\nBOOKS.push(\n${books.map(serializeBook).join(',\n')}\n);\n`;
}

function main() {
  const all = loadNewBooks(ROOT);
  const dirs = new Set(SUBJECTS.map(s => s.dir));

  for (const b of all) {
    if (!dirs.has(b.subject)) {
      throw new Error(`new-books.json: ${b.id} の subject が科目名でない — ${b.subject}`);
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(b.id)) {
      throw new Error(`new-books.json: URL に使えない id — ${b.id}`);
    }
  }

  let changed = 0;
  for (const s of SUBJECTS) {
    const mine = all.filter(b => b.subject === s.dir);

    const file = path.join(ROOT, s.dir, 'index.html');
    const src = fs.readFileSync(file, 'utf8');

    // 突き合わせの基準は「新刊を注入する前の状態」にする。ファイルをそのまま読むと、
    // 前回自分が注入した本まで既存書として数えてしまい、2 回目の実行が
    // id の衝突として落ちる（何度流しても同じ結果になる必要がある）
    const cleared = replaceBlock(src, '\n');
    if (cleared === null) {
      throw new Error(`${s.dir}/index.html に NEW BOOKS のマーカー区間が無い。手で入れ直す（docs/new-books-plan.md の 6 節）`);
    }

    // id の衝突と、存在しない stage をここで止める。
    // extract.mjs も id 重複を見るが、そこまで行くとどちらが新刊か分からない
    const existing = extractSubject(ROOT, s.dir, cleared);
    const known = new Set(existing.books.map(b => b.id));
    const stages = Object.keys(existing.stages);
    for (const b of mine) {
      if (known.has(b.id)) {
        throw new Error(`${s.dir}: id が既存書と衝突している — ${b.id}（既に掲載済みなら new-books.json から消す）`);
      }
      if (!stages.includes(b.stage)) {
        throw new Error(`${s.dir}: ${b.id} の stage が STAGES に無い — ${b.stage}（使えるのは ${stages.join(', ')}）`);
      }
    }

    const out = replaceBlock(src, buildBody(mine));
    if (out === src) {
      console.log(`${s.dir}: 変更なし（新刊 ${mine.length} 冊）`);
      continue;
    }
    changed++;
    if (CHECK) {
      console.log(`${s.dir}: 差分あり（新刊 ${mine.length} 冊）`);
    } else {
      fs.writeFileSync(file, out, 'utf8');
      console.log(`${s.dir}: 注入した（新刊 ${mine.length} 冊）`);
    }
  }

  console.log(`承認済み新刊 ${all.length} 冊 / 書き換えた科目 ${changed} 件${CHECK ? '（--check なので書き込んでいない）' : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
