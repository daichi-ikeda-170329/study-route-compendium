/**
 * 新刊（評価が未了の収録本）の共通ロジック。
 *
 * 設計の正本は docs/new-books-plan.md。
 *
 * 新刊は現物を読んでいないため、難易度・到達目安・強み・注意点・向いている人を
 * 持たない。これらを推測で埋めると既存 1,052 冊との物差しが狂うので、空のまま
 * 掲載し `provisional: true` を立てて「評価準備中」と明示する。
 *
 * **数字を持たない本は描画を壊す。** 生成側・科目トップの両方で、次の 3 つを
 * 必ず分岐する（詳細は docs/new-books-plan.md の 7 節）。
 *
 *   1. `${b.diff}` の素の埋め込み       → 画面に undefined が出る
 *   2. `b.pros.map()` / `b.subjects.split()` → TypeError で描画が止まる
 *   3. `b.diff<=2 ? … : 3` 形の分類      → 比較が全部 false になり最難関に化ける
 *
 * 3 は静かに間違うので最も危ない。
 */
import fs from 'fs';
import path from 'path';

/** 画面に出す文言。科目トップ側（各 index.html）にも同じ文字列がある */
export const PROVISIONAL_LABEL = '新刊・評価準備中';

/** 承認済み新刊の JSON で必須の項目。1 つでも欠けたら注入を止める */
export const REQUIRED_FIELDS = ['id', 'subject', 'name', 'official', 'pub', 'year', 'stage'];

/** 評価が未了の本か。サイト全体でこの判定だけを根拠にする */
export function isProvisional(b) {
  return b?.provisional === true;
}

/**
 * 並び替えで評価未了の本を末尾へ送るための比較関数。
 *
 * `diff` が無い本を `a.diff - b.diff` に通すと NaN になり、比較子が非対称になって
 * 並び順が実行ごとに変わる。難易度順の並びでは常に末尾へ落とす。
 */
export function provisionalLast(a, b) {
  return (isProvisional(a) ? 1 : 0) - (isProvisional(b) ? 1 : 0);
}

/** 承認済み新刊を読む。ファイルが無ければ空で返す（未導入の環境でビルドを止めない） */
export function loadNewBooks(rootDir) {
  const file = path.join(rootDir, 'build', 'data', 'new-books.json');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`build/data/new-books.json を読めない: ${e.message}`);
  }
  const books = Array.isArray(raw.books) ? raw.books : [];

  // 必須項目の欠落は注入前に止める。欠けたまま入れると科目トップの描画が落ちる
  for (const b of books) {
    const missing = REQUIRED_FIELDS.filter(k => b[k] === undefined || b[k] === '');
    if (missing.length) {
      throw new Error(`new-books.json: ${b.id || '(id 未設定)'} に必須項目が無い — ${missing.join(', ')}`);
    }
  }
  const ids = books.map(b => `${b.subject}:${b.id}`);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) throw new Error(`new-books.json: 重複 — ${[...new Set(dup)].join(', ')}`);

  return books;
}
