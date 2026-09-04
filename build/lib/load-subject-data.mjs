/**
 * 科目データの**唯一の読み書き口**。
 *
 *   loadSubjectData(ROOT, dir)          読む
 *   isMigrated(ROOT, dir)               data/subjects/<科目>/ へ移し終えているか
 *   writeSubjectBooks(ROOT, dir, books) BOOKS を書き戻す
 *   affiliateEnabled(ROOT) / amazonEnabled(ROOT)  広告表記の出し分け
 *
 * ## なぜ 1 本にするか
 *
 * `extractSubject()` は 20 本のスクリプトと 8 本のテストから呼ばれ、さらに 2 本の
 * スクリプトが科目 HTML へ文字列で書き込んでいる。読み口と書き口を先に 1 本化して
 * おかないと、科目を 1 つ移すたびに 25 か所以上を直すことになり、必ず取りこぼす。
 *
 * ## 移行中の振る舞い
 *
 *   data/subjects/<科目>/ がある … そこから読む（移行済み）
 *   無い                        … extractSubject() へ落とす（未移行）
 *
 * **フォールバックは移行中だけの仕組み。** 7 科目すべてを移し終えたら削除する。
 * 戻り値の形は `extractSubject()` と完全に同じにする。違っていたら
 * `build/data/subject-snapshot.json` との突き合わせ（`npm run check:shape`）が落ちる。
 *
 * ## 広告表記の判定をここへ移した理由（重要）
 *
 * もとの `affiliateEnabled()` / `amazonEnabled()` は、科目 HTML を正規表現で読んでいた。
 *
 *     const tag = src.match(/\bamazonTag:\s*"([^"]*)"/);
 *
 * データを HTML の外へ出すと、この正規表現は何にもマッチしなくなり、**例外も警告も
 * 出さずに戻り値が `false` になる**。その結果、生成される 1,390 ページから
 * アフィリエイト開示と Amazon アソシエイトの必須表記がまるごと消える。
 * **これは表示崩れではなく規約違反になる。**
 *
 * だから判定を canonical な CONFIG 経由へ移し、`test/affiliate-disclosure.test.mjs` で
 * 出力を固定した。**ここに HTML を正規表現で読むコードを戻さない。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractSubject, SUBJECTS } from './extract.mjs';
import { validateCanonicalFile } from './validate-subject-data.mjs';

/** data/subjects/<科目>/ に置くファイルと、戻り値のどのキーに載るか */
export const CANONICAL_FILES = [
  { file: 'books.json',        key: 'books',  kind: 'array'  },
  { file: 'universities.json', key: 'unis',   kind: 'array'  },
  { file: 'routes.json',       key: null,     kind: 'object' }, // routes + tiers をまとめて持つ
  { file: 'guides.json',       key: 'guides', kind: 'array'  },
  { file: 'stages.json',       key: 'stages', kind: 'object' },
  { file: 'config.json',       key: 'config', kind: 'object' },
];

/** 正本の置き場所 */
export function subjectDir(rootDir, dir) {
  return path.join(rootDir, 'data', 'subjects', dir);
}

/**
 * 移行済みか。**books.json があるかどうかだけで決める。**
 * 「途中まで書けている」状態を移行済みと誤認しないよう、読むときに全ファイルの
 * 存在を確かめて、欠けていれば落とす（黙って古い HTML へ落ちない）。
 */
export function isMigrated(rootDir, dir) {
  return fs.existsSync(path.join(subjectDir(rootDir, dir), 'books.json'));
}

/** JSON を読む。schemaVersion を検査する */
function readJson(rootDir, dir, file) {
  const p = path.join(subjectDir(rootDir, dir), file);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`${dir}/${file} を読めなかった: ${e.message}`);
  }
  const problems = validateCanonicalFile(`${dir}/${file}`, raw);
  if (problems.length) throw new Error(problems.join('\n'));
  return raw;
}

/**
 * 関数が混ざっていないことを確かめる。
 * JSON なので入りようがないが、「`.mjs` へ逃がして関数を持たせる」誘惑への歯止めとして置く。
 * 関数が入ると `extractSubject()` 時代の vm 依存が別の形で戻り、
 * データを静的に検査できなくなる。
 */
function assertNoFunctions(value, where) {
  const seen = new Set();
  const walk = (v, at) => {
    if (typeof v === 'function') throw new Error(`${where}: ${at} が関数。canonical データに関数を置かない`);
    if (!v || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(value, '');
}

/** キャッシュ。1 回のビルドで同じ科目を何度も読むため */
const cache = new Map();

/**
 * 科目データを読む。戻り値の形は `extractSubject()` と同じ。
 *
 * @param {string} rootDir リポジトリのルート
 * @param {string} dir     科目ディレクトリ名
 * @param {object} [opts]
 * @param {string} [opts.srcOverride] 未移行科目で、ファイルの代わりに読む HTML。
 *   `build/apply-new-books.mjs` が「新刊を注入する前の状態」を基準にするために使う。
 * @param {boolean} [opts.fresh] キャッシュを使わない
 */
export function loadSubjectData(rootDir, dir, opts = {}) {
  const { srcOverride = null, fresh = false } = opts;
  if (srcOverride) return extractSubject(rootDir, dir, srcOverride);

  const key = `${rootDir}::${dir}`;
  if (!fresh && cache.has(key)) return cache.get(key);

  let data;
  if (isMigrated(rootDir, dir)) {
    const missing = CANONICAL_FILES
      .map(f => f.file)
      .filter(f => !fs.existsSync(path.join(subjectDir(rootDir, dir), f)));
    if (missing.length) {
      // 中途半端な状態で古い HTML へ落ちると、「移したつもりで移っていない」に気づけない
      throw new Error(`${dir}: 移行が途中。足りない: ${missing.join(', ')}`);
    }

    const books = readJson(rootDir, dir, 'books.json');
    const unis = readJson(rootDir, dir, 'universities.json');
    const routes = readJson(rootDir, dir, 'routes.json');
    const guides = readJson(rootDir, dir, 'guides.json');
    const stages = readJson(rootDir, dir, 'stages.json');
    const config = readJson(rootDir, dir, 'config.json');

    data = {
      dir,
      books: books.books,
      stages: stages.stages,
      tiers: routes.tiers,
      routes: routes.routes,
      unis: unis.universities,
      guides: guides.guides,
      config: config.config,
    };
    assertNoFunctions(data, `data/subjects/${dir}`);
  } else {
    data = extractSubject(rootDir, dir);
  }

  if (!fresh) cache.set(key, data);
  return data;
}

/** 読み込みキャッシュを捨てる。書き戻したあとに呼ぶ */
export function clearSubjectCache() {
  cache.clear();
  affCache = null;
  azCache = null;
}

/**
 * BOOKS を書き戻す。**唯一の書き口。**
 *
 * 移行済み科目 … data/subjects/<科目>/books.json を書く
 * 未移行科目   … 呼び出し側が従来どおり HTML を書き換える（false を返す）
 *
 * @returns {boolean} canonical データへ書いたなら true
 */
export function writeSubjectBooks(rootDir, dir, books) {
  if (!isMigrated(rootDir, dir)) return false;
  assertNoFunctions(books, `${dir}/books.json`);
  const p = path.join(subjectDir(rootDir, dir), 'books.json');
  const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
  writeCanonicalFile(p, { ...cur, books });
  clearSubjectCache();
  return true;
}

/**
 * canonical ファイルの書式を 1 か所に固定する。
 * 人がレビューする正本なので、1 レコード 1 行にして差分を読めるようにする。
 * `JSON.stringify(x, null, 2)` だと 1 冊が 30 行になり、1 冊の変更が差分で埋もれる。
 */
export function writeCanonicalFile(absPath, obj) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, serializeCanonical(obj));
}

/** 配列の要素だけを 1 行に畳む。それ以外は通常の 2 スペース整形 */
export function serializeCanonical(obj) {
  const lines = [];
  const walk = (v, indent, trailing) => {
    const pad = ' '.repeat(indent);
    if (Array.isArray(v)) {
      if (!v.length) { lines.push(`${pad}[]${trailing}`); return; }
      lines.push(`${pad}[`);
      v.forEach((item, i) => {
        const comma = i === v.length - 1 ? '' : ',';
        lines.push(`${' '.repeat(indent + 2)}${JSON.stringify(item)}${comma}`);
      });
      lines.push(`${pad}]${trailing}`);
      return;
    }
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (!keys.length) { lines.push(`${pad}{}${trailing}`); return; }
      lines.push(`${pad}{`);
      keys.forEach((k, i) => {
        const comma = i === keys.length - 1 ? '' : ',';
        const x = v[k];
        if (Array.isArray(x) && x.length) {
          lines.push(`${' '.repeat(indent + 2)}${JSON.stringify(k)}: [`);
          x.forEach((item, j) => {
            lines.push(`${' '.repeat(indent + 4)}${JSON.stringify(item)}${j === x.length - 1 ? '' : ','}`);
          });
          lines.push(`${' '.repeat(indent + 2)}]${comma}`);
        } else if (x && typeof x === 'object' && !Array.isArray(x)) {
          lines.push(`${' '.repeat(indent + 2)}${JSON.stringify(k)}: {`);
          const ks = Object.keys(x);
          ks.forEach((k2, j) => {
            lines.push(`${' '.repeat(indent + 4)}${JSON.stringify(k2)}: ${JSON.stringify(x[k2])}${j === ks.length - 1 ? '' : ','}`);
          });
          lines.push(`${' '.repeat(indent + 2)}}${comma}`);
        } else {
          lines.push(`${' '.repeat(indent + 2)}${JSON.stringify(k)}: ${JSON.stringify(x)}${comma}`);
        }
      });
      lines.push(`${pad}}${trailing}`);
      return;
    }
    lines.push(`${pad}${JSON.stringify(v)}${trailing}`);
  };
  walk(obj, 0, '');
  return lines.join('\n') + '\n';
}

/* ============================================================
   広告表記の出し分け

   **HTML を正規表現で読まない。** canonical な CONFIG だけを見る。
   ============================================================ */

let affCache = null;
let azCache = null;

/**
 * サイト全体でアフィリエイトを利用しているかを、各科目の CONFIG から判定する。
 *
 * 生成ページの広告表記はここを唯一の根拠にする。ID が未設定のうちは
 * 「アフィリエイト広告を利用しています」と書かない（事実に反するため）。
 * ID を入れて再生成すれば、必要な表記が自動で戻る。
 */
export function affiliateEnabled(rootDir) {
  if (affCache !== null) return affCache;
  affCache = SUBJECTS.some(s => {
    const c = loadSubjectData(rootDir, s.dir).config || {};
    return Boolean(c.amazonTag || c.rakutenId);
  });
  return affCache;
}

/**
 * Amazon アソシエイトの ID だけが入っているかを判定する。
 * Amazon の運営規約が求める「適格販売により収入を得ています」の表記は、
 * Amazon に参加しているときだけ出す（楽天だけの状態で出すと事実に反する）。
 */
export function amazonEnabled(rootDir) {
  if (azCache !== null) return azCache;
  azCache = SUBJECTS.some(s => Boolean((loadSubjectData(rootDir, s.dir).config || {}).amazonTag));
  return azCache;
}
