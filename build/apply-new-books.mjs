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
 *
 * ## 移行済み科目（data/subjects/<科目>/books.json がある）
 *
 * マーカー区間は HTML にしか無いので使えない。代わりに canonical な books.json を
 * 「new-books.json に載っている id を全部いったん除き、末尾へ入れ直す」形で書き換える。
 * マーカー方式と同じく**何度流しても同じ結果になる**（前回注入した分を既存書として
 * 数えないため）。並び順も、マーカー区間が BOOKS の末尾にある現行の見え方と揃う。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS } from './lib/extract.mjs';
import { isMigrated, loadSubjectData, writeSubjectBooks } from './lib/load-subject-data.mjs';
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

/**
 * 移行済み科目へ新刊を入れる。
 * 「new-books.json に載っている id を除いた既存書」＋「新刊」という形にするので、
 * 何度流しても同じ結果になる。
 * @returns {boolean} 書き換えが要ったか
 */
function applyCanonical(dir, mine) {
  const cur = loadSubjectData(ROOT, dir, { fresh: true });
  const mineIds = new Set(mine.map(b => b.id));

  // 前回注入した分を落としたうえで、既存書との衝突と stage を確かめる
  const base = cur.books.filter(b => !mineIds.has(b.id));
  const known = new Set(base.map(b => b.id));
  const stages = Object.keys(cur.stages);
  for (const b of mine) {
    if (known.has(b.id)) {
      throw new Error(`${dir}: id が既存書と衝突している — ${b.id}（既に掲載済みなら new-books.json から消す）`);
    }
    if (!stages.includes(b.stage)) {
      throw new Error(`${dir}: ${b.id} の stage が STAGES に無い — ${b.stage}（使えるのは ${stages.join(', ')}）`);
    }
  }

  // subject は科目の振り分け用。BOOKS には持たせない（serializeBook と同じ扱い）
  const next = [...base, ...mine.map(({ subject, ...rest }) => rest)];
  const same = JSON.stringify(next) === JSON.stringify(cur.books);
  if (same) {
    console.log(`${dir}: 変更なし（新刊 ${mine.length} 冊 / canonical）`);
    return false;
  }
  if (CHECK) {
    console.log(`${dir}: 差分あり（新刊 ${mine.length} 冊 / canonical）`);
  } else {
    writeSubjectBooks(ROOT, dir, next);
    console.log(`${dir}: 注入した（新刊 ${mine.length} 冊 / canonical）`);
  }
  return true;
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

    if (isMigrated(ROOT, s.dir)) {
      changed += applyCanonical(s.dir, mine) ? 1 : 0;
      continue;
    }

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
    const existing = loadSubjectData(ROOT, s.dir, { srcOverride: cleared });
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
