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
import { allTrackKeys } from './tracks.mjs';
// 循環 import になるが、関数の中でしか使わないので読み込み順に依存しない
import { TIER_GROUP } from './tiers.mjs';

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
  basic: 'boolean', nocover: 'boolean', cover: 'string', coverExample: 'string',
  pros: 'array', cons: 'array', unis: 'array', alts: 'array',
  fb: 'object',
  // 書籍ページの本文を厚くするための任意項目（仕様書 3.1）。無い本は従来どおりの表示
  pages: 'number', media: 'array', toc: 'array', howto: 'array', finish: 'string', editions: 'array',
};

/** media に書いてよい値（書籍ページの基本情報「付属」） */
export const MEDIA_VALUES = ['音声', 'アプリ', '電子版', '動画', '別冊解答'];
/** howto の phase に書いてよい値（書籍ページの「使い方の手順」） */
export const HOWTO_PHASES = ['1周目', '2周目', '3周目以降', '仕上げ'];
/** 構成（toc）に出す項目の上限 */
export const TOC_MAX = 12;

/** 任意項目の中身の検査。型（TYPES）が合っている前提で呼ぶ */
function checkBookExtras(b, bad) {
  const key = b.id;
  if (typeof b.pages === 'number' && (!Number.isInteger(b.pages) || b.pages < 1)) bad(`${key}.pages: 1 以上の整数のはずが ${b.pages}`);
  if (Array.isArray(b.media)) {
    for (const m of b.media) if (!MEDIA_VALUES.includes(m)) bad(`${key}.media: 「${m}」は ${MEDIA_VALUES.join('・')} のどれでもない`);
    if (new Set(b.media).size !== b.media.length) bad(`${key}.media: 同じ値が 2 回ある`);
  }
  if (Array.isArray(b.toc)) {
    if (!b.toc.length) bad(`${key}.toc: 空の配列。無いなら項目ごと持たない`);
    if (b.toc.length > TOC_MAX) bad(`${key}.toc: ${b.toc.length} 項目（${TOC_MAX} 項目まで）`);
    for (const t of b.toc) if (typeof t !== 'string' || !t) bad(`${key}.toc: 文字列でない項目がある`);
  }
  if (Array.isArray(b.howto)) {
    if (!b.howto.length) bad(`${key}.howto: 空の配列。無いなら項目ごと持たない`);
    for (const h of b.howto) {
      if (!h || typeof h !== 'object' || Array.isArray(h)) { bad(`${key}.howto: オブジェクトでない項目がある`); continue; }
      if (!HOWTO_PHASES.includes(h.phase)) bad(`${key}.howto: phase「${h.phase}」は ${HOWTO_PHASES.join('・')} のどれでもない`);
      if (typeof h.do !== 'string' || !h.do) bad(`${key}.howto: do が空か文字列でない`);
    }
  }
  if (b.finish === '') bad(`${key}.finish: 空文字。無いなら項目ごと持たない`);
  if (Array.isArray(b.editions)) {
    for (const e of b.editions) {
      if (!e || !Number.isInteger(e.year) || e.year < 1900 || e.year > 2100) bad(`${key}.editions: year が西暦の整数でない項目がある`);
      if (!e || typeof e.note !== 'string' || !e.note) bad(`${key}.editions: note が空か文字列でない`);
    }
  }
}

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

    let typed = true;
    for (const [f, want] of Object.entries(TYPES)) {
      if (b[f] === undefined || b[f] === null) continue;
      const got = typeOf(b[f]);
      if (got !== want) { bad(`${key}.${f}: ${want} のはずが ${got}`); typed = false; }
    }
    if (typed) checkBookExtras(b, bad);

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
    } else if (b.coverExample !== undefined) {
      // coverExample は枠に添える見本。実在の 1 冊はその本自身の書影（cover）を使う
      bad(`${key}: 実在の本が coverExample を持っている（見本ではなく cover を使う）`);
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
    // 大学別ページは科目をまたいで帯の名前にそろえて出す（build/lib/tiers.mjs の TIER_GROUP）
    if (t.id && !TIER_GROUP[t.id]) bad(`TIERS の「${t.id}」が build/lib/tiers.mjs の TIER_GROUP に無い`);
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

  /* トラックの表示名。書くなら routes.json のトラックと過不足なくそろえる。
     足りないと静的ページだけ SUB_LABELS に落ちて「bun」がそのまま見出しに出る */
  const labels = data.config && data.config.trackLabels;
  if (labels !== undefined) {
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
      bad('config.trackLabels がオブジェクトでない');
    } else {
      const want = allTrackKeys(data.routes);
      for (const k of want) if (!labels[k]) bad(`config.trackLabels に「${k}」が無い（routes.json にあるトラック）`);
      for (const k of Object.keys(labels)) {
        if (!want.has(k)) bad(`config.trackLabels の「${k}」は routes.json に無いトラック`);
        const v = labels[k] || {};
        for (const f of ['label', 'short', 'lead']) {
          if (typeof v[f] !== 'string' || !v[f]) bad(`config.trackLabels.${k}.${f} が空か文字列でない`);
        }
      }
    }
  }

  /* 出題形式別の重点対策（focus.json）。本が実在し、大学の fx がすべて引けること */
  const focus = data.focus || {};
  for (const [k, f] of Object.entries(focus)) {
    if (!f || typeof f !== 'object') { bad(`focus「${k}」がオブジェクトでない`); continue; }
    if (typeof f.id !== 'string' || !known.has(f.id)) bad(`focus「${k}」の本「${f.id}」が BOOKS に無い`);
    if (typeof f.note !== 'string' || !f.note) bad(`focus「${k}」に note が無い`);
    if (f.alts !== undefined && !Array.isArray(f.alts)) bad(`focus「${k}」の alts が配列でない`);
    for (const a of f.alts || []) if (!known.has(a)) bad(`focus「${k}」の代替「${a}」が BOOKS に無い`);
  }

  /* 大学 */
  for (const u of data.unis) {
    if (!u.n) bad('UNIS に名前の無い項目がある');
    if (u.t && !data.routes[u.t]) bad(`UNIS「${u.n}」の志望レベル「${u.t}」にルートが無い`);
    for (const k of u.fx || []) {
      if (!focus[k]) bad(`UNIS「${u.n}」の出題形式「${k}」が focus.json に無い`);
    }
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
