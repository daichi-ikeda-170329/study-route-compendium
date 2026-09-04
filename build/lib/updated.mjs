/**
 * ページの「最終更新日」を、人が日付を書かずに出すための仕組み。
 *
 * 更新日を手で書く運用にすると必ず古くなる。ここでは 2 通りの求め方を使い分ける。
 *
 *   1. 1 ページ = 1 ファイル（解説記事の本文・手書き HTML）… ファイルの中身のハッシュ
 *   2. 1 ファイルに多数のレコード（BOOKS の 1 冊・ROUTES の 1 本）… レコードの
 *      ハッシュを build/data/record-dates.json に控えておき、**中身が変わった日**を
 *      更新日にする。科目 HTML を 1 文字直しただけで 252 冊ぜんぶの更新日が
 *      動くのを避けるためで、git の日付をそのまま使うとそうなる。
 *
 * 台帳は増えるだけで、消さない。生成を科目単位・1 冊単位で流しても、実行しな
 * かった本の日付が消えないようにするためである。
 *
 * **git の日付は使わない。**（2026-09-04 に変更）
 * `git log -1 --format=%cs -- <path>` は、浅いクローン（GitHub Actions の
 * `actions/checkout` の既定は fetch-depth: 1）では履歴を 1 コミットしか持たない
 * ため、**すべてのファイルが「今日」になる**。手元と CI で生成物が食い違って
 * `git diff --exit-code` が落ちるだけでなく、実際には変えていない日を
 * 「更新日」として公開することになる。これは検索向けの偽更新にあたる。
 * どちらの求め方も、いまは中身のハッシュだけを根拠にしている。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = path.join(ROOT, 'build', 'data', 'record-dates.json');

const today = () => new Date().toISOString().slice(0, 10);


function load() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  } catch {
    return { _note: 'レコードの中身が変わった日を控える台帳。build/lib/updated.mjs が読み書きする。手で編集しない。', records: {} };
  }
}

const ledger = load();
let dirty = false;

/** レコードの中身から短いハッシュを作る。キーの並び順に依存しないようにする */
function hashOf(value) {
  const stable = JSON.stringify(value, (k, v) =>
    (v && typeof v === 'object' && !Array.isArray(v))
      ? Object.fromEntries(Object.keys(v).sort().map(kk => [kk, v[kk]]))
      : v);
  return crypto.createHash('sha1').update(stable).digest('hex').slice(0, 12);
}

/**
 * このレコードの更新日。中身が前回と同じなら前回の日付を返し、
 * 変わっていれば今日の日付に進めて台帳に控える。
 * @param {string} key   例 "english/porepore"
 * @param {*} value      レコードそのもの（ハッシュの材料）
 */
export function recordDate(key, value) {
  const h = hashOf(value);
  const prev = ledger.records[key];
  if (prev && prev.h === h) return prev.d;
  const d = today();
  ledger.records[key] = { h, d };
  dirty = true;
  return d;
}

/**
 * ファイル 1 枚の更新日。**中身が変わった日**を返す。
 *
 * 台帳のキーは `file:<相対パス>`。レコードの日付と同じ台帳に置くのは、
 * 求め方（中身のハッシュ）が同じで、書き戻しも 1 か所で済むため。
 *
 * 生成物そのもの（`<科目>/index.html` など）を渡してよい。生成のたびに
 * 中身が変われば日付が進み、変わらなければ据え置かれる。
 */
export function fileDate(relPath) {
  const file = path.join(ROOT, relPath);
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return today();   // まだ生成していないファイル
  }
  /* 更新日そのものが中身に含まれると、日付が入るたびにハッシュが変わって
     毎回「今日」になる。日付らしき並びを外してから比べる */
  const stripped = content.replace(/\d{4}-\d{2}-\d{2}/g, '');
  return recordDate(`file:${relPath}`, stripped);
}

/** 台帳を書き戻す。変化が無ければ何もしない（差分を無駄に作らない） */
export function saveDates() {
  if (!dirty) return;
  const sorted = Object.fromEntries(Object.keys(ledger.records).sort().map(k => [k, ledger.records[k]]));
  fs.writeFileSync(LEDGER, `${JSON.stringify({ ...ledger, records: sorted }, null, 1)}\n`, 'utf8');
  dirty = false;
}

/** 「最終更新: YYYY-MM-DD」の表示。<time> で機械にも読ませる */
export function updatedLine(date) {
  return `<p class="page-updated">最終更新: <time datetime="${date}">${date}</time></p>`;
}
