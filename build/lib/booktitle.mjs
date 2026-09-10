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
import { SUB_LABELS, SUBJECTS } from './extract.mjs';
import { loadSubjectData } from './load-subject-data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '../data/authors.json'), 'utf8'));

/** この本の著者。判明していなければ空配列 */
export function authorsOf(dir, id) {
  return DATA.authors[`${dir}/${id}`] || [];
}

/** 比較用に記号と空白を落とす */
function norm(s) {
  return String(s || '').replace(/[\s　[\]()（）【】「」『』,，、。・！!？?&＆/／]/g, '');
}

/** 分野を表す語。書名にこれが無く、正式名称にだけあるなら、分野を落とした略称とみなす */
const FIELD_WORDS = ['日本史', '世界史', '地理', '公共', '政治・経済', '倫理',
  '物理', '化学', '生物', '地学', '現代文', '古文', '漢文'];

/** 科目ごとの「2 冊以上が同じ name を持つ」書名の集合 */
const dupCache = new Map();
function duplicatedNames(dir) {
  if (!dupCache.has(dir)) {
    const n = new Map();
    for (const b of loadSubjectData(ROOT, dir).books) n.set(b.name, (n.get(b.name) || 0) + 1);
    dupCache.set(dir, new Set([...n].filter(([, c]) => c > 1).map(([k]) => k)));
  }
  return dupCache.get(dir);
}

/**
 * 「内部略称かどうか」を判定する。次のどれかに当たれば略称とみなす。
 *
 *   1. name が official と文字集合で 75% 未満しか重ならない（「河合 黒本」など 24 冊）
 *   2. 同じ科目の別の本と name が同じ（dir を渡したときだけ見る）。
 *      「実況中継①」は日本史と世界史の別の本が同じ名前を持っていて、名前だけでは区別できない
 *   3. official が name の後ろに分野名を足しただけの形で、name に分野名が無い。
 *      「関東難関私大」→「関東難関私大世界史問題集」。版表記（5訂版・[第12版]）だけの違いは当たらない
 *
 * 2 と 3 は 2026-09-10 に足した（仕様書 1.6 が挙げた「関東難関私大」「実況中継①」は
 * 1 の判定をすり抜けていた）。
 */
export function isShorthand(book, dir) {
  const n = norm(book.name);
  const o = norm(book.official);
  if (!n || !o) return false;
  const chars = [...new Set(n)];
  if (chars.filter(c => o.includes(c)).length / chars.length < 0.75) return true;
  if (dir && duplicatedNames(dir).has(book.name)) return true;
  if (o.startsWith(n) && o !== n) {
    const rest = String(book.official).slice(String(book.official).indexOf(book.name.slice(-1)) + 1);
    if (FIELD_WORDS.some(w => rest.includes(w) && !book.name.includes(w))) return true;
  }
  return false;
}

/** official から、検索語として邪魔になる付帯情報を落とす */
export function trimOfficial(official) {
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
  if (!isShorthand(book, dir)) return book.name;
  const trimmed = trimOfficial(book.official);
  const lost = (dir ? authorsOf(dir, book.id) : [])
    .find(a => book.name.includes(a) && !trimmed.includes(a));
  return lost ? `${lost} ${trimmed}` : trimmed;
}

/** カードや一覧に収まる書名の長さ（字）。これを超える正式名称は使わない */
export const DISPLAY_MAX = 28;

/**
 * 読者に見せる書名。カード・ルートの行・おすすめ・記事の表などで使う。
 *
 * 2026-09-10 まで、title / h1 / パンくずだけが searchName（略称なら正式名称）を使い、
 * それ以外の表示は name（編集上の内部略称を含む）をそのまま出していた。
 * 大学別ページに「関東難関私大」「実況中継①」が単独で並んでいたのがこれ。
 *
 *   略称でない             → name
 *   略称で正式名称が短い   → searchName（整えた正式名称）
 *   略称で正式名称が長い   → name（分野名が無ければ「name（分野）」にして区別できるようにする）
 *
 * **検索用の name には使わない**（検索は name・official の両方を見ている）。
 */
export function displayName(book, dir) {
  if (!book) return '';
  const d = dir || dirOfBook(book);
  if (!d) return candidateDisplay(book, d);
  return displayTable(d).get(book.id) ?? candidateDisplay(book, d);
}

/**
 * 科目を渡されなかったときに、書籍オブジェクトから科目を引く。
 * 書影の枠（build/lib/cover.mjs）のように、本だけを受け取る部品から呼ばれるため。
 * loadSubjectData はキャッシュした同じオブジェクトを返すので、参照で引ける。
 */
let bookDirs = null;
function dirOfBook(book) {
  if (!bookDirs) {
    bookDirs = new WeakMap();
    for (const s of SUBJECTS) for (const b of loadSubjectData(ROOT, s.dir).books) bookDirs.set(b, s.dir);
  }
  return bookDirs.get(book) || '';
}

/** 分野名の略記。書名にこれがあれば分野名を補わない（「完全MASTER政経」に「（政治・経済）」を足さない） */
const FIELD_ALIASES = { '政治・経済': ['政経'], '古文': ['古典'], '地理': ['地誌'] };
/** 補わない分野（「総合」は分野名として読めない） */
const NO_SUFFIX = new Set(['sogo']);

function candidateDisplay(book, dir) {
  if (!isShorthand(book, dir)) return book.name;
  const full = searchName(book, dir);
  if ([...full].length <= DISPLAY_MAX) return full;
  const field = NO_SUFFIX.has(book.sub) ? '' : SUB_LABELS[book.sub];
  const has = field && [field, ...(FIELD_ALIASES[field] || [])].some(w => book.name.includes(w));
  return field && !has ? `${book.name}（${field}）` : book.name;
}

/**
 * 科目ごとに全冊の表示名を決める。**表示名が別の本と重なったら name に戻す。**
 * 正式名称が同じ別の本（代ゼミと駿台の「実戦問題集 公共、倫理」）を同じ名前で出すと、
 * 略称のときより区別できなくなるため。
 */
const displayCache = new Map();
function displayTable(dir) {
  if (displayCache.has(dir)) return displayCache.get(dir);
  const books = loadSubjectData(ROOT, dir).books;
  const cand = new Map(books.map(b => [b.id, candidateDisplay(b, dir)]));
  const count = new Map();
  for (const v of cand.values()) count.set(v, (count.get(v) || 0) + 1);
  const out = new Map();
  for (const b of books) {
    const v = cand.get(b.id);
    out.set(b.id, count.get(v) > 1 && v !== b.name ? b.name : v);
  }
  displayCache.set(dir, out);
  return out;
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
