/**
 * 科目データ（BOOKS / UNIS / TIERS / ROUTES / STAGES）の厳格な検証。
 *
 * いまのデータは科目トップの HTML に <script> リテラルとして書かれていて、
 * 形が崩れても「読めてしまう」。**データを別ファイルへ移す前に、
 * 移した先で同じ形を保てているかを確かめる道具を先に用意しておく**（指示書 13.1）。
 * 移行の途中も、移行後も、同じ検証を通す。
 *
 * ここが見るのは「形」だけ。値の正しさ（ISBN が実在するか、難易度が妥当か）は
 * build/check-data.mjs と build/lib/verification.mjs が見る。
 *
 * **不明な値を空文字や 0 で表さない。** 分からないものは undefined か null のまま
 * 持ち、検証もそれを通す。0 を「未設定」の意味で使うと、本当の 0 と区別できなくなる。
 */
import { recordType, isPlaceholder } from './record-type.mjs';

/** BOOKS の 1 レコードに必ずある項目 */
export const REQUIRED_BOOK = ['id', 'name', 'stage'];

/** 実在する 1 冊にはあるが、ルート上の枠には無い項目 */
export const BOOK_ONLY = ['isbn13', 'year'];

/** 型の期待。undefined は「無くてよい」を意味する */
const TYPES = {
  id: 'string', name: 'string', official: 'string', pub: 'string',
  isbn10: 'string', isbn13: 'string', year: 'number',
  stage: 'string', diff: 'number', hensachi: 'string',
  problems: 'string', hours: 'string', h: 'number', style: 'string',
  subjects: 'string', sub: 'string', bunri: 'string',
  desc: 'string', bestFor: 'string', recordType: 'string',
  basic: 'boolean', nocover: 'boolean',
  pros: 'array', cons: 'array', unis: 'array', alts: 'array',
  fb: 'object',
};

const typeOf = (v) => (Array.isArray(v) ? 'array' : typeof v);

/**
 * 1 科目ぶんを検証する。問題の一覧を返す（空なら合格）。
 * @param {string} dir 科目ディレクトリ名
 * @param {object} data extractSubject() の戻り値
 */
export function validateSubjectData(dir, data) {
  const problems = [];
  const bad = (m) => problems.push(`${dir}: ${m}`);

  if (!Array.isArray(data.books) || !data.books.length) {
    bad('BOOKS が配列でないか空');
    return problems;
  }

  const ids = new Set();
  for (const b of data.books) {
    const key = b && b.id ? `${b.id}` : '(id 不明)';

    for (const f of REQUIRED_BOOK) {
      if (b[f] === undefined || b[f] === null || b[f] === '') bad(`${key}: ${f} が無い`);
    }
    if (ids.has(b.id)) bad(`${key}: id が重複している`);
    ids.add(b.id);

    for (const [f, want] of Object.entries(TYPES)) {
      if (b[f] === undefined || b[f] === null) continue;
      const got = typeOf(b[f]);
      if (got !== want) bad(`${key}.${f}: ${want} のはずが ${got}`);
    }

    // 不明を空文字や 0 で表していないか。**空文字は「無い」ではなく「書き忘れ」の合図**
    for (const f of ['official', 'pub', 'isbn13', 'hensachi', 'problems', 'hours', 'style']) {
      if (b[f] === '') bad(`${key}.${f}: 空文字。分からないなら項目ごと持たない`);
    }
    if (b.h === 0) bad(`${key}.h: 0。分からないなら項目ごと持たない`);

    const rt = recordType(b);
    if (!['book', 'routePlaceholder'].includes(rt)) bad(`${key}: 未知の recordType「${rt}」`);
    if (isPlaceholder(b)) {
      for (const f of [...BOOK_ONLY, 'isbn10', 'asin', 'cover']) {
        if (b[f] !== undefined) bad(`${key}: ルート上の枠が ${f} を持っている`);
      }
    }
    if (b.stage && data.stages && !data.stages[b.stage]) {
      bad(`${key}.stage: STAGES に無い「${b.stage}」`);
    }
    if (b.diff !== undefined && (!Number.isInteger(b.diff) || b.diff < 1 || b.diff > 10)) {
      bad(`${key}.diff: 1〜10 の整数のはずが ${b.diff}`);
    }
  }

  /* 志望レベルとルート */
  for (const t of data.tiers) {
    if (!t.id || !t.name) bad(`TIERS に id か name が無い項目がある`);
    if (!data.routes[t.id]) bad(`TIERS の「${t.id}」にルートが無い`);
  }
  const known = new Set(data.books.map(b => b.id));
  const walk = (node, where) => {
    if (Array.isArray(node)) { node.forEach(n => walk(n, where)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && !known.has(node.id)) bad(`${where}: 未知の id「${node.id}」`);
    for (const a of node.alts || []) if (!known.has(a)) bad(`${where}: 代替が未知の id「${a}」`);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, where);
  };
  walk(data.routes, 'ROUTES');

  /* 大学 */
  for (const u of data.unis) {
    if (!u.n) bad('UNIS に名前の無い項目がある');
    if (u.t && !data.routes[u.t]) bad(`UNIS「${u.n}」の志望レベル「${u.t}」にルートが無い`);
  }

  return problems;
}

/**
 * canonical ファイル（data/subjects/<科目>/*.json）そのものの検証。
 *
 * `validateSubjectData()` が見るのは「読み込んだあとの形」なので、
 * JSON ファイル側の約束（schemaVersion がある・関数が無い）は別に見る。
 * **関数を持たせたくなったら .mjs へ逃がす**という誘惑への歯止め。
 * 関数が入ると vm 依存が別の形で戻り、データを静的に検査できなくなる。
 *
 * @param {string} file  表示用のファイル名
 * @param {*} raw        JSON.parse した中身
 * @returns {string[]} 問題の一覧（空なら合格）
 */
export function validateCanonicalFile(file, raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push(`${file}: トップレベルがオブジェクトでない`);
    return problems;
  }
  if (raw.schemaVersion !== 1) {
    problems.push(`${file}: schemaVersion が ${JSON.stringify(raw.schemaVersion)}。想定は 1`);
  }
  // JSON.parse の結果に関数は入らないが、書き出す側が JS を書いた場合に備えて見る
  const seen = new Set();
  const walk = (v, at) => {
    if (typeof v === 'function') { problems.push(`${file}: ${at} が関数。canonical データに関数を置かない`); return; }
    if (!v || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(raw, '');
  return problems;
}

/**
 * 比較に使う正規形。**キーの並び順に依存しない**ハッシュを作るために使う。
 * 関数（cond など）は文字列にして比べる。
 */
export function canonical(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'function') return `fn:${String(value).replace(/\s+/g, ' ')}`;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}
