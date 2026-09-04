/**
 * 確認状態（verification）の判定と表示ラベル。
 *
 * このサイトのレコードには、性質の違う 2 種類の情報が混ざっている。
 *
 *   事実   … 書名・出版社・ISBN・刊行年・著者・問題数
 *            出版社や書誌データベースで確かめられる。確かめた出典と日付を持てる。
 *   推定   … 難易度・到達目安・想定学習時間・長所・注意点・向く人・ルート採用理由
 *            編集部（運営者 1 人）が既存の収録全冊との相対で付けた見立て。
 *            出典が存在しないので、verified にはならない。**推定は推定として出す。**
 *
 * これまでは「（要確認）」という文字列を本文に混ぜて管理していた。文章の中にあると
 * 集計も検査もできず、書き換えたときに消えたことにも気づけない。ここでは状態を
 * データとして持ち、表示・集計・検査のすべてが同じ 1 か所を見るようにする。
 *
 * 状態は 4 つ。
 *   verified      出典 URL と確認日がある。**この 2 つが無いものを verified にしない。**
 *   partial       一部の項目だけ確かめてある
 *   unverified    確かめていない
 *   notApplicable その項目を持たないレコード（ルート上の枠など）
 *
 * `physicalReview: true` は「人が実物を確認した」ことを意味する。現物確認はしていないので、
 * 既定は false であり、**自動で true にしない**（運営者が明示した場合だけ）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlaceholder } from './record-type.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(ROOT, 'build', 'data', 'verification.json');
const AUTHORS_FILE = path.join(ROOT, 'build', 'data', 'authors.json');

export const STATUSES = ['verified', 'partial', 'unverified', 'notApplicable'];

/** 事実として確かめられる項目 */
export const FACT_FIELDS = ['official', 'pub', 'isbn13', 'year', 'author', 'problems'];

/** 編集部の推定。出典が存在しないので verification の対象にしない */
export const ESTIMATE_FIELDS = ['diff', 'hensachi', 'hours', 'pros', 'cons', 'bestFor'];

/** 本文に混ぜて書かれてきた未確認の印。移行が終わるまで検出に使う */
export const UNVERIFIED_MARK = /要確認|未確認|不明/;

let cache = null;

/** verification.json を読む。無ければ空の台帳として扱う */
export function loadVerification() {
  if (cache) return cache;
  cache = fs.existsSync(FILE)
    ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
    : { schemaVersion: 1, checkedAt: null, records: {} };
  return cache;
}

/** テストから台帳を差し替えるため */
export function __setVerification(v) { cache = v; }

let authorsCache = null;
function authors() {
  if (authorsCache) return authorsCache;
  authorsCache = fs.existsSync(AUTHORS_FILE)
    ? JSON.parse(fs.readFileSync(AUTHORS_FILE, 'utf8'))
    : { _provenance: {}, authors: {} };
  return authorsCache;
}

export const recordKey = (dir, id) => `${dir}:${id}`;

/**
 * 1 レコードの確認状態を返す。
 *
 * 台帳（build/data/verification.json）に記録があればそれを使う。
 * 無い項目は、いま手元にある根拠だけから決める。**推測で埋めない。**
 *
 *   - 著者は build/data/authors.json（openBD / 国立国会図書館サーチで実在を確認した人名）
 *     に載っていれば verified。載っていなければ「著者不明」ではなく unverified
 *     （書誌データベースに記載が無いだけかもしれないため）。
 *   - 本文に「要確認 / 未確認 / 不明」と書かれている項目は unverified。
 *   - それ以外の事実項目は、出典を記録していないので unverified。
 *
 * @returns {{status:string, checkedAt:?string, physicalReview:boolean,
 *            fields:Object, unverifiedFields:string[], sources:Array}}
 */
export function verificationOf(dir, book) {
  const led = loadVerification();
  const rec = led.records[recordKey(dir, book.id)] || {};
  const fields = {};

  if (isPlaceholder(book)) {
    // ルート上の枠は特定の商品ではない。書誌情報を持たないので確認の対象外
    for (const f of FACT_FIELDS) fields[f] = { status: 'notApplicable' };
    return {
      status: 'notApplicable', checkedAt: null, physicalReview: false,
      fields, unverifiedFields: [], sources: [],
    };
  }

  const prov = authors()._provenance || {};
  const hasAuthor = Boolean((authors().authors || {})[`${dir}/${book.id}`]);

  for (const f of FACT_FIELDS) {
    if (rec.fields && rec.fields[f]) { fields[f] = rec.fields[f]; continue; }

    if (f === 'author') {
      fields[f] = hasAuthor
        ? { status: 'verified', sourceKind: 'bibliography',
            sourceUrl: 'https://api.openbd.jp/v1/get', checkedAt: prov.fetched || null }
        : { status: 'unverified' };
      continue;
    }
    const raw = book[f];
    if (raw == null || raw === '') { fields[f] = { status: 'unverified' }; continue; }
    if (UNVERIFIED_MARK.test(String(raw))) { fields[f] = { status: 'unverified' }; continue; }
    fields[f] = { status: 'unverified' };
  }

  const vals = FACT_FIELDS.map(f => fields[f].status);
  const nVerified = vals.filter(v => v === 'verified').length;
  const nApplicable = vals.filter(v => v !== 'notApplicable').length;
  let status = rec.status;
  if (!status) {
    status = nVerified === 0 ? 'unverified'
      : nVerified === nApplicable ? 'verified' : 'partial';
  }

  const sources = [];
  for (const f of FACT_FIELDS) {
    const v = fields[f];
    if (v.status === 'verified' && v.sourceUrl) sources.push({ field: f, url: v.sourceUrl, checkedAt: v.checkedAt });
  }

  return {
    status,
    checkedAt: rec.checkedAt || (sources.length ? sources[0].checkedAt : null),
    // 現物確認は運営者が明示したときだけ true。自動で立てない
    physicalReview: rec.physicalReview === true,
    fields,
    unverifiedFields: FACT_FIELDS.filter(f => fields[f].status === 'unverified'),
    sources,
  };
}

/** verified を名乗るには出典 URL と確認日の両方が要る */
export function verifiedFieldIsWellFormed(v) {
  return v.status !== 'verified' || Boolean(v.sourceUrl && v.checkedAt);
}

/** 画面に出す状態のラベル。色だけで状態を伝えないよう、必ず文字で出す */
export const STATUS_LABEL = {
  verified: '確認済み',
  partial: '一部情報を確認中',
  unverified: '確認中',
  notApplicable: '対象外',
};

/** 項目名の表示 */
export const FIELD_LABEL = {
  official: '正式書名', pub: '出版社', isbn13: 'ISBN', year: '刊行年',
  author: '著者', problems: '問題数・構成',
};

/**
 * 書籍ページに常時出す「この情報の確かめ方」ブロックの中身を組み立てる。
 *
 * **項目ごとに、確かめたのか・確かめていないのか・食い違ったのかを分けて書く。**
 * まとめて「確認済み」と書くと、確かめていない項目まで確認済みに見える。
 * verified と現物確認も同じ意味にしない。推定は推定と書く。
 */
export function verificationRows(v) {
  const rows = [];
  const na = (f) => v.fields[f] && v.fields[f].status === 'notApplicable';
  if (na('isbn13')) {
    rows.push(['書誌情報', 'ルート上の枠のため、特定の書誌情報を持ちません']);
    rows.push(['難易度・到達目安・想定学習時間', 'ルート大全による推定（出典のある数値ではありません）']);
    rows.push(['現物確認', v.physicalReview ? '実物を確認しています' : '未登録']);
    return rows;
  }

  const say = (f, okText) => {
    const x = v.fields[f] || { status: 'unverified' };
    if (x.status === 'verified') return `${okText}${x.checkedAt ? `（${x.checkedAt} 確認）` : ''}`;
    if (x.mismatch) {
      if (f === 'year') return `書誌データベースは ${x.mismatch.theirs} 年としています。版の違いの可能性があり、確認中です`;
      if (f === 'pub') return `書誌データベースは「${x.mismatch.theirs}」としています。確認中です`;
      return `書誌データベースの表記「${x.mismatch.theirs}」と一致しないため確認中です（版・副題の書き方の違いを含みます）`;
    }
    return '確認中';
  };

  rows.push(['ISBN', say('isbn13', '書誌データベースで実在を確認済み')]);
  rows.push(['正式書名', say('official', '書誌データベースと一致')]);
  rows.push(['出版社', say('pub', '書誌データベースと一致')]);
  rows.push(['刊行年', say('year', '書誌データベースと一致')]);
  rows.push(['著者', v.fields.author && v.fields.author.status === 'verified'
    ? `書誌データベースで確認済み${v.fields.author.checkedAt ? `（${v.fields.author.checkedAt} 確認）` : ''}`
    : '書誌データベースに記載が見つからず、未登録です']);
  rows.push(['問題数・構成', v.fields.problems && v.fields.problems.status === 'verified' ? '確認済み' : '確認中']);
  rows.push(['難易度・到達目安・想定学習時間', 'ルート大全による推定（出典のある数値ではありません）']);
  rows.push(['現物確認', v.physicalReview ? '実物を確認しています' : '未登録']);
  return rows;
}
