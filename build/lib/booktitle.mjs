/**
 * 検索されたときに見つかる形の書名・著者名を決める。
 *
 * BOOKS[].name は図鑑の一覧で使う短い呼び名で、たいていはそのまま検索語になる
 * （「速読英単語 入門編」「英文法ポラリス1」など）。ただし一部は編集上の内部略称で、
 * 誰も検索しない形になっている（「河合 黒本」「東書『公共』」など）。
 * その場合だけ official（正式名称）を整えて使う。
 *
 * 著者名は build/data/authors.json（openBD 由来・実在確認済み）から引く。
 * 判明していない本には何も足さない。推測で著者名を補わない。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '../data/authors.json'), 'utf8'));

/** この本の著者。判明していなければ空配列 */
export function authorsOf(dir, id) {
  return DATA.authors[`${dir}/${id}`] || [];
}

/** 比較用に記号と空白を落とす */
function norm(s) {
  return String(s || '').replace(/[\s　[\]()（）【】「」『』,，、。・！!？?&＆/／]/g, '');
}

/**
 * name が official とどれだけ重なるかで「内部略称かどうか」を判定する。
 * 文字集合の 75% 未満しか一致しないものを略称とみなす。
 */
function isShorthand(book) {
  const n = norm(book.name);
  const o = norm(book.official);
  if (!n || !o) return false;
  const chars = [...new Set(n)];
  return chars.filter(c => o.includes(c)).length / chars.length < 0.75;
}

/** official から、検索語として邪魔になる付帯情報を落とす */
function trimOfficial(official) {
  const s = String(official || '')
    .replace(/※.*$/, '')                                   // 「※表紙は〜の例」などの注記
    .replace(/[(（][^()（）]*(シリーズ|SERIES|年度版|音声|DL付|ほか)[^()（）]*[)）]/g, '')
    .replace(/[〔[][^〕\]]*\d{3}[〕\]]/g, '')                 // 〔倫理703〕のような教科書番号
    .replace(/文部科学省検定済教科書\s*/g, '')
    .replace(/高等学校(公民科|地理歴史科)用/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // 削りすぎて意味が取れなくなったら元に戻す
  return norm(s).length >= 8 ? s : String(official || '').replace(/※.*$/, '').trim();
}

/**
 * 検索で使われる書名。title / h1 / パンくずの末尾に使う。
 * 略称の本だけ official 由来にし、それ以外は name をそのまま使う。
 *
 * 差し替えで著者名が落ちてしまう本（「浜島清利 物理講義の実況中継」→
 * official には著者名が無い）は、著者名を戻してから返す。
 */
export function searchName(book, dir) {
  if (!isShorthand(book)) return book.name;
  const trimmed = trimOfficial(book.official);
  const lost = (dir ? authorsOf(dir, book.id) : [])
    .find(a => book.name.includes(a) && !trimmed.includes(a));
  return lost ? `${lost} ${trimmed}` : trimmed;
}

/**
 * 著者名を前に付けた検索形。「関正生の英文法ポラリス1」のように
 * 正式名称が「著者名の◯◯」という形を取っているときだけ付ける。
 * 書名にすでに著者名が入っている本や、正式名称が裏づけない本には付けない。
 */
// 同名判定のため 1 冊あたり全冊ぶん呼ばれるので、結果を使い回す
const memo = new Map();
export function withAuthor(book, dir) {
  const key = `${dir}/${book.id}`;
  if (memo.has(key)) return memo.get(key);
  const value = computeWithAuthor(book, dir);
  memo.set(key, value);
  return value;
}

function computeWithAuthor(book, dir) {
  const base = searchName(book, dir);
  const [author] = authorsOf(dir, book.id);
  if (!author) return base;
  // 姓だけが書名に入っている本（「蔭山面白いほど」に対する著者「蔭山克秀」）も
  // 二重表記になるので付けない
  if (base.includes(author) || base.includes(author.slice(0, 2))) return base;
  const official = String(book.official || '');
  return official.includes(`${author}の`) ? `${author}の${base}` : base;
}
