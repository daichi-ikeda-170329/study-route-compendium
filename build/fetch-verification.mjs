/**
 * 書誌情報を openBD で照合し、build/data/verification.json を作る。
 *
 *   node build/fetch-verification.mjs            取得して書き込む
 *   node build/fetch-verification.mjs --dry      取得するが書き込まない
 *   node build/fetch-verification.mjs --offline  取得せずキャッシュだけで作り直す
 *   node build/fetch-verification.mjs --limit 50 先頭 N 冊だけ（動作確認用）
 *
 * **推測で確認済みにしない。** API が返した値と収録データが一致した項目だけを
 * verified にする。一致しない項目は mismatch として記録し、verified にはしない。
 * API が応答しない・レコードが無い ISBN は unverified のままにする
 * （「確認できなかった」と「確認して間違っていた」を混ぜない）。
 *
 * 出典は出版社が登録する書誌データベース（openBD）。EC サイトのレビューや
 * 個人ブログは事実確認の根拠にしない。
 *
 * 応答は build/.cache/openbd/ に置く。再実行しても API へ行かないので、
 * 生成の再現性が保てる（キャッシュは git に入れない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { isPlaceholder } from './lib/record-type.mjs';
import { FACT_FIELDS, recordKey } from './lib/verification.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'data', 'verification.json');
const CACHE = path.join(ROOT, 'build', '.cache', 'openbd');
const PUBLISHERS = path.join(ROOT, 'build', 'data', 'publishers.json');

const DRY = process.argv.includes('--dry');
const OFFLINE = process.argv.includes('--offline');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

const UA = 'route-taizen-verification/1 (+https://route-taizen.com)';
const BATCH = 60;          /* openBD はカンマ区切りで複数 ISBN を受ける */
const TIMEOUT_MS = 20000;
const PAUSE_MS = 400;      /* 相手サイトへ負荷をかけない */
const TODAY = new Date().toISOString().slice(0, 10);
const SOURCE_KIND = 'bibliography';
const sourceUrl = isbn => `https://api.openbd.jp/v1/get?isbn=${isbn}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 比較のための正規化 ---------- */

/** 全角・半角、記号、空白のゆれを潰す。書名の一致判定に使う */
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/[［］\[\]（）()〈〉<>【】「」『』　\s・･,，.。/／\-‐―–—~〜_"'’”]/g, '')
    .toLowerCase();
}

/**
 * 2 つの書名の近さ（文字 2-gram の Dice 係数、0〜1）。
 *
 * 書誌データベースの書名は「関正生のThe Rules英語長文問題集 : 大学入試 1」のように
 * 副題の位置と語順が違うことが多い。含まれるかどうかだけで判定すると、同じ本を
 * 「別の本」と呼んでしまう。**「突き合わせられなかった」と「別の本だ」を混ぜない**
 * ために、近さを測って表記ゆれと未照合を分ける。
 */
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/** これ以上なら「同じ本の表記ゆれ」とみなす。下回ったら判断せず未照合として残す */
const TITLE_SIMILAR = 0.55;

/** 出版社名の別名。BOOKS の pub と書誌データベースの表記を突き合わせる */
function publisherAliases() {
  const raw = JSON.parse(fs.readFileSync(PUBLISHERS, 'utf8'));
  const map = new Map();
  for (const p of raw.publishers) {
    const keys = [p.name, ...(p.aliases || [])].map(norm);
    for (const k of keys) map.set(k, norm(p.name));
  }
  return map;
}

/* ---------- 取得 ---------- */

function cachePath(isbn) { return path.join(CACHE, `${isbn}.json`); }

function readCache(isbn) {
  const p = cachePath(isbn);
  if (!fs.existsSync(p)) return undefined;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return undefined; }
}

function writeCache(isbn, value) {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cachePath(isbn), JSON.stringify(value));
}

/** openBD に問い合わせる。失敗は例外にせず null を返す（部分的な失敗で全体を止めない） */
async function fetchBatch(isbns) {
  const url = `https://api.openbd.jp/v1/get?isbn=${isbns.join(',')}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** openBD のレコードから、比べたい 3 つを取り出す */
function pick(rec) {
  if (!rec) return null;
  const s = rec.summary || {};
  const d = (rec.onix && rec.onix.DescriptiveDetail) || {};
  const title = s.title
    || (d.TitleDetail && d.TitleDetail.TitleElement && d.TitleDetail.TitleElement.TitleText
      && d.TitleDetail.TitleElement.TitleText.content) || '';
  const pub = s.publisher || '';
  const year = String(s.pubdate || '').slice(0, 4);
  return { title, pub, year: year ? Number(year) : null };
}

/* ---------- 判定 ---------- */

/**
 * 収録データと API の値を突き合わせる。
 * 一致したら verified、食い違ったら mismatch、判断材料が無ければ unverified。
 */
function compare(book, got) {
  const aliases = compare._aliases || (compare._aliases = publisherAliases());
  const fields = {};
  const isbn = String(book.isbn13);

  fields.isbn13 = {
    status: 'verified', sourceKind: SOURCE_KIND, sourceUrl: sourceUrl(isbn), checkedAt: TODAY,
  };

  const ourTitle = norm(book.official || book.name);
  const ourShort = norm(book.name);
  const theirTitle = norm(got.title);
  if (theirTitle && ourTitle) {
    const full = theirTitle.includes(ourTitle) || ourTitle.includes(theirTitle);
    /* 書誌データベースは「書名 : 副題」の形で返し、「改訂版」「5訂版」を書名に含めない
       ことが多い。略称が含まれていれば **同じ本を指してはいる** ので、
       「別の本を指している可能性」と「版・副題の表記ゆれ」を分けて記録する。
       どちらの場合も official は verified にしない（完全一致していないため）。 */
    const contained = ourShort && (theirTitle.includes(ourShort) || ourShort.includes(theirTitle));
    const near = Math.max(dice(ourTitle, theirTitle), dice(ourShort, theirTitle));
    const variant = !full && (contained || near >= TITLE_SIMILAR);
    fields.official = full
      ? { status: 'verified', sourceKind: SOURCE_KIND, sourceUrl: sourceUrl(isbn), checkedAt: TODAY }
      : { status: 'unverified',
          /* variant  … 同じ本だが版・副題の書き方が違う（表記の問題）
             unmatched … 突き合わせられなかった。**別の本だと断定はしない**。人が見る */
          mismatch: { kind: variant ? 'variant' : 'unmatched',
                      similarity: Math.round(near * 100) / 100,
                      ours: book.official || book.name, theirs: got.title },
          checkedAt: TODAY };
  } else {
    fields.official = { status: 'unverified' };
  }

  const ourPub = aliases.get(norm(book.pub)) || norm(book.pub);
  const theirPub = aliases.get(norm(got.pub)) || norm(got.pub);
  if (ourPub && theirPub) {
    const ok = theirPub.includes(ourPub) || ourPub.includes(theirPub);
    fields.pub = ok
      ? { status: 'verified', sourceKind: SOURCE_KIND, sourceUrl: sourceUrl(isbn), checkedAt: TODAY }
      : { status: 'unverified', mismatch: { kind: 'publisher', ours: book.pub, theirs: got.pub }, checkedAt: TODAY };
  } else {
    fields.pub = { status: 'unverified' };
  }

  if (got.year && book.year) {
    fields.year = got.year === book.year
      ? { status: 'verified', sourceKind: SOURCE_KIND, sourceUrl: sourceUrl(isbn), checkedAt: TODAY }
      : { status: 'unverified', mismatch: { kind: 'year', ours: book.year, theirs: got.year }, checkedAt: TODAY };
  } else {
    fields.year = { status: 'unverified' };
  }

  return fields;
}

/* ---------- 本体 ---------- */

async function main() {
  const books = [];
  for (const s of SUBJECTS) {
    for (const b of extractSubject(ROOT, s.dir).books) {
      books.push({ dir: s.dir, b });
    }
  }

  const targets = books.filter(({ b }) => !isPlaceholder(b) && /^\d{13}$/.test(String(b.isbn13 || '')));
  const list = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`書誌情報を照合する: ${list.length} 冊（枠と ISBN 無しは対象外）`);

  /* キャッシュに無い ISBN だけ取りに行く */
  const need = [...new Set(list.map(({ b }) => String(b.isbn13)).filter(i => readCache(i) === undefined))];
  if (need.length && !OFFLINE) {
    console.log(`  API へ問い合わせる: ${need.length} 冊（キャッシュ済み ${list.length - need.length} 冊）`);
    for (let i = 0; i < need.length; i += BATCH) {
      const chunk = need.slice(i, i + BATCH);
      const res = await fetchBatch(chunk);
      if (res === null) {
        console.warn(`  取得できなかった: ${chunk[0]} 〜（${chunk.length} 冊）。未確認のまま残す`);
        continue;   /* 失敗は未確認のまま。推測で埋めない */
      }
      chunk.forEach((isbn, j) => writeCache(isbn, pick(res[j])));
      process.stdout.write(`\r  ${Math.min(i + BATCH, need.length)} / ${need.length}`);
      await sleep(PAUSE_MS);
    }
    process.stdout.write('\n');
  } else if (need.length) {
    console.log(`  --offline なので ${need.length} 冊は未確認のまま`);
  }

  const records = {};
  const tally = { verified: 0, partial: 0, unverified: 0, notApplicable: 0 };
  let mismatches = 0, noRecord = 0, different = 0;

  for (const { dir, b } of books) {
    const key = recordKey(dir, b.id);
    if (isPlaceholder(b)) {
      records[key] = { status: 'notApplicable', checkedAt: TODAY, physicalReview: false, fields: {} };
      tally.notApplicable++;
      continue;
    }
    const isbn = String(b.isbn13 || '');
    const got = /^\d{13}$/.test(isbn) ? readCache(isbn) : undefined;
    if (got === undefined || got === null) {
      if (got === null) noRecord++;
      records[key] = { status: 'unverified', checkedAt: null, physicalReview: false, fields: {} };
      tally.unverified++;
      continue;
    }
    const fields = compare(b, got);
    for (const f of Object.values(fields)) if (f.mismatch) { mismatches++; if (f.mismatch.kind === 'unmatched') different++; }
    const applicable = FACT_FIELDS.filter(f => fields[f]);
    const nv = applicable.filter(f => fields[f].status === 'verified').length;
    const status = nv === 0 ? 'unverified' : nv === applicable.length ? 'verified' : 'partial';
    tally[status]++;
    records[key] = {
      status, checkedAt: TODAY,
      // 現物確認は人が実物を見たときだけ。API の照合では立てない
      physicalReview: false,
      fields,
    };
  }

  const out = {
    schemaVersion: 1,
    _note: '生成物。node build/fetch-verification.mjs が作る。手で編集するときは sourceUrl と checkedAt を必ず付ける（それが無いものを verified にしない）。',
    _provenance: {
      source: 'openBD API (https://api.openbd.jp/v1/get)',
      method: '収録データの official / pub / year を API の値と突き合わせ、一致した項目だけ verified にする。食い違いは mismatch として残し verified にしない。応答が無い ISBN は未確認のままにする。',
      policy: '推測で確認済みにしない。EC サイトのレビューや個人ブログは事実確認の根拠にしない。現物確認（physicalReview）はここでは立てない。',
      checkedAt: TODAY,
    },
    records,
  };

  console.log(`  verified ${tally.verified} / partial ${tally.partial} / unverified ${tally.unverified} / 対象外 ${tally.notApplicable}`);
  console.log(`  食い違い ${mismatches} 件（うち書名を突き合わせられなかったもの ${different} 件）・書誌データベースに記載なし ${noRecord} 冊`);

  if (DRY) { console.log('--dry なので書き込まない'); return; }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`build/data/verification.json を書いた（${Object.keys(records).length} 件）`);
}

main().catch(e => { console.error(e); process.exit(1); });
