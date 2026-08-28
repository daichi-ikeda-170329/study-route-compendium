/**
 * 楽天ブックス書籍検索 API で新刊を拾い、未収録のものを候補として書き出す。
 *
 *   node build/fetch-new-books.mjs           直近の新刊を拾って候補ファイルを作る
 *   node build/fetch-new-books.mjs --genres  学参系のジャンル ID を引き直す
 *   node build/fetch-new-books.mjs --days 60 発売日の範囲を変える（既定 45 日）
 *   node build/fetch-new-books.mjs --dry     ファイルを書かずに結果だけ出す
 *
 * 設計は docs/new-books-plan.md の 4 節。
 *
 * 認証は環境変数から取る。アプリ ID は CONFIG.rakutenId のアフィリエイト ID とは別物で、
 * Rakuten Developers で無料取得する。
 *
 *   RAKUTEN_APP_ID     applicationId
 *   RAKUTEN_ACCESS_KEY accessKey
 *
 * 確認済みの API 仕様（2026-08-28 時点・公式ドキュメント）
 *   - sort に "-releaseDate"（発売日が新しい順）がある
 *   - **発売日で絞り込むパラメータは無い。** 新しい順に取り、日付の判定は自前で行う
 *   - hits は 1〜30、page は 1〜100
 *   - salesDate は文字列で粒度が可変（「2026年」「2026年08月」「2026年08月28日」、
 *     さらに上旬・中旬・下旬・頃・以降などが付く）
 *   - レート制限の数値は明記が無い。429 が返る旨の記載のみ
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';

const { normalize } = createRequire(import.meta.url)('../assets/js/search.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'new-books');
const SEEN_FILE = path.join(OUT_DIR, 'seen.json');
const GENRE_FILE = path.join(ROOT, 'build', 'data', 'rakuten-genres.json');
const FILTER_FILE = path.join(ROOT, 'build', 'data', 'new-books-filter.json');

const API = 'https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const GENRE_API = 'https://app.rakuten.co.jp/services/api/BooksGenre/Search/20121128';

/** 楽天ブックスの「本」直下。ここから学参系までたどる */
const BOOKS_ROOT_GENRE = '001';

/** ジャンル名にこの語を含む枝を学参系とみなす */
const GENRE_HINTS = ['学参', '高校', '大学受験', '受験'];

/** 1 リクエストあたりの待ち。レート制限の明記が無いので保守的に置く */
const SLEEP_MS = 1200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ============================================================
   発売日
   ============================================================ */

/**
 * salesDate を Date にする。粒度が可変なので、取れたところまでで作る。
 *
 *   2026年08月28日   → 2026-08-28
 *   2026年08月下旬   → 2026-08-01（旬は捨て、月初として扱う）
 *   2026年08月       → 2026-08-01
 *   2026年           → 2026-01-01
 *   それ以外          → null
 *
 * **パースできないものを候補から外さない。** 外すと取りこぼしに気づけない。
 * 呼び出し側は null を「発売日不明」として残す。
 */
export function parseSalesDate(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/(\d{4})年(?:\s*(\d{1,2})月)?(?:\s*(\d{1,2})日)?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/** ISO 週番号。候補ファイルの名前に使う */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));   // その週の木曜へ寄せる
  const y = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return { year: y, week };
}

/* ============================================================
   API
   ============================================================ */

function credentials() {
  const applicationId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!applicationId) {
    console.error('RAKUTEN_APP_ID が無い。Rakuten Developers でアプリ ID を取り、環境変数に入れる');
    console.error('（CONFIG.rakutenId のアフィリエイト ID とは別物。docs/new-books-plan.md の 11 節）');
    process.exit(1);
  }
  // ドキュメントには accessKey も必須とあるが、実運用で不要なら空でも通る。
  // 無いこと自体は止めず、警告にとどめて 401 を実際に見てから判断する
  if (!accessKey) console.warn('警告: RAKUTEN_ACCESS_KEY が無い。401 が返るならこれが原因');
  return { applicationId, accessKey };
}

async function callApi(url, params) {
  const { applicationId, accessKey } = credentials();
  const q = new URLSearchParams({ format: 'json', applicationId, ...params });
  if (accessKey) q.set('accessKey', accessKey);
  const res = await fetch(`${url}?${q}`);
  if (res.status === 429) throw new Error('429 — レート制限。間隔を空けて流し直す');
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* ============================================================
   ジャンル ID の解決
   ============================================================ */

/**
 * 学参系のジャンルを引き直して build/data/rakuten-genres.json に書く。
 *
 * ID を直書きしないのは、楽天側のジャンル改編でツリーが変わるためである。
 * 取得方法をコードに残しておけば、変わったときに引き直すだけで済む。
 */
async function updateGenres(dry) {
  const found = [];
  const seen = new Set();

  // 「本」直下 → その子、の 2 階層だけ見る。学参はこの深さに現れる
  const roots = await callApi(GENRE_API, { booksGenreId: BOOKS_ROOT_GENRE });
  const children = roots.children || [];
  for (const c of children) {
    const g = c.child || c;
    const name = g.booksGenreName || '';
    const id = g.booksGenreId;
    if (!id || seen.has(id)) continue;
    if (GENRE_HINTS.some(h => name.includes(h))) {
      seen.add(id);
      found.push({ id, name });
      continue;
    }
    // 学参は「語学・学習参考書」のような親の下にあることがある。1 段だけ潜る
    await sleep(SLEEP_MS);
    const sub = await callApi(GENRE_API, { booksGenreId: id });
    for (const cc of sub.children || []) {
      const gg = cc.child || cc;
      const nm = gg.booksGenreName || '';
      if (gg.booksGenreId && !seen.has(gg.booksGenreId) && GENRE_HINTS.some(h => nm.includes(h))) {
        seen.add(gg.booksGenreId);
        found.push({ id: gg.booksGenreId, name: `${name} > ${nm}` });
      }
    }
  }

  console.log(`学参系ジャンル ${found.length} 件`);
  for (const g of found) console.log(`  ${g.id}  ${g.name}`);
  if (!found.length) {
    console.error('1 件も見つからない。楽天側のジャンル改編か、GENRE_HINTS が古い。');
    console.error('https://webservice.rakuten.co.jp/documentation/books-genre-search で階層を確かめる');
    process.exit(1);
  }
  if (dry) { console.log('--dry なので書き込んでいない'); return; }

  const prev = JSON.parse(fs.readFileSync(GENRE_FILE, 'utf8'));
  fs.writeFileSync(GENRE_FILE, `${JSON.stringify({
    ...prev,
    _provenance: { ...prev._provenance, fetchedAt: new Date().toISOString().slice(0, 10) },
    genres: found,
  }, null, 2)}\n`, 'utf8');
  console.log(`${path.relative(ROOT, GENRE_FILE)} を更新した`);
}

/* ============================================================
   候補の収集
   ============================================================ */

/** 書名が除外語に当たるか */
export function excluded(title, words) {
  return words.some(w => title.includes(w));
}

/** 既存 1,052 冊。ISBN と、書名の正規化形の 2 本で突き合わせる */
function knownBooks() {
  const isbn = new Set();
  const names = new Set();
  for (const s of SUBJECTS) {
    for (const b of extractSubject(ROOT, s.dir).books) {
      if (b.isbn13) isbn.add(String(b.isbn13).replace(/[^0-9X]/gi, ''));
      names.add(normalize(b.name));
      if (b.official) names.add(normalize(b.official));
    }
  }
  return { isbn, names };
}

function readSeen() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')).seen || []);
  } catch {
    return new Set();
  }
}

async function collect(days, dry) {
  const genres = JSON.parse(fs.readFileSync(GENRE_FILE, 'utf8')).genres || [];
  if (!genres.length) {
    console.error('学参系のジャンル ID が未取得。先に node build/fetch-new-books.mjs --genres を流す');
    process.exit(1);
  }
  const { excludeWords } = JSON.parse(fs.readFileSync(FILTER_FILE, 'utf8'));
  const known = knownBooks();
  const seen = readSeen();

  const since = new Date(Date.now() - days * 86400000);
  const stats = { fetched: 0, tooOld: 0, excluded: 0, known: 0, alreadySeen: 0 };
  const hits = [];

  for (const g of genres) {
    // 発売日が新しい順に取り、範囲より古いものが続いたらそのジャンルは打ち切る。
    // 日付で絞り込むパラメータが無いのでこうするしかない
    let stale = 0;
    for (let page = 1; page <= 4 && stale < 2; page++) {
      await sleep(SLEEP_MS);
      const json = await callApi(API, {
        booksGenreId: g.id, sort: '-releaseDate', hits: '30', page: String(page),
      });
      const items = (json.Items || []).map(x => x.Item || x);
      if (!items.length) break;

      let freshOnPage = 0;
      for (const it of items) {
        stats.fetched++;
        const title = it.title || '';
        const date = parseSalesDate(it.salesDate);
        // パースできないものは日付で切らない。取りこぼしに気づけなくなるため
        if (date && date < since) { stats.tooOld++; continue; }
        freshOnPage++;
        if (excluded(title, excludeWords)) { stats.excluded++; continue; }
        const isbn = String(it.isbn || '').replace(/[^0-9X]/gi, '');
        if ((isbn && known.isbn.has(isbn)) || known.names.has(normalize(title))) { stats.known++; continue; }
        if (isbn && seen.has(isbn)) { stats.alreadySeen++; continue; }
        hits.push({
          isbn, title, author: it.author || '',
          pub: it.publisherName || '',
          salesDate: it.salesDate || '',
          date, url: it.itemUrl || '', genre: g.name,
        });
      }
      if (!freshOnPage) stale++; else stale = 0;
    }
  }

  // ISBN で重複を落とす（ジャンルをまたいで同じ本が出る）
  const uniq = [];
  const dedupe = new Set();
  for (const h of hits) {
    const k = h.isbn || normalize(h.title);
    if (dedupe.has(k)) continue;
    dedupe.add(k);
    uniq.push(h);
  }
  uniq.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

  console.log(`取得 ${stats.fetched} 件`);
  console.log(`  範囲外（${days} 日より前）で除外: ${stats.tooOld} 件`);
  console.log(`  除外語で除外: ${stats.excluded} 件`);
  console.log(`  既に収録済み: ${stats.known} 件`);
  console.log(`  既に候補に出した: ${stats.alreadySeen} 件`);
  console.log(`残った候補: ${uniq.length} 件`);

  if (dry) { console.log('--dry なので書き込んでいない'); return; }

  const { year, week } = isoWeek(new Date());
  const file = path.join(OUT_DIR, `${year}-W${String(week).padStart(2, '0')}.md`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(file, renderCandidates(uniq, { days, stats, year, week }), 'utf8');

  for (const h of uniq) if (h.isbn) seen.add(h.isbn);
  fs.writeFileSync(SEEN_FILE, `${JSON.stringify({
    note: '一度候補に出した ISBN。掲載しないと決めた本が毎週出続けないための記録。docs/x-posts/used.json と同じ考え方',
    seen: [...seen].sort(),
  }, null, 2)}\n`, 'utf8');

  console.log(`${path.relative(ROOT, file)} を生成した`);
}

export function renderCandidates(list, { days, stats, year, week }) {
  const md = [];
  md.push(`# 新刊候補 ${year}-W${String(week).padStart(2, '0')}`);
  md.push('');
  md.push('`node build/fetch-new-books.mjs` が生成した。設計は [new-books-plan.md](../new-books-plan.md)。');
  md.push('');
  md.push('## 掲載するには');
  md.push('');
  md.push('1. 下の表から掲載する本を選ぶ');
  md.push('2. `build/data/new-books.json` の `books` に足す。`stage`（役割）は必ず決める');
  md.push('3. 難易度・到達目安・強み・注意点・向いている人は**空のままにする**。現物を読んでいないため');
  md.push('4. 再生成する');
  md.push('');
  md.push('```bash');
  md.push('node build/apply-new-books.mjs');
  md.push('node build/generate-books.mjs && node build/generate-index.mjs && node build/generate-picks.mjs');
  md.push('node build/generate-routes.mjs && node build/generate-articles.mjs && node build/generate-search.mjs');
  md.push('node build/apply-count.mjs');
  md.push('node build/generate-sitemap.mjs');
  md.push('node build/gen-x-newbook.mjs');
  md.push('```');
  md.push('');
  md.push(`発売日が直近 ${days} 日以内のものを拾った。`);
  md.push(`取得 ${stats.fetched} 件のうち、範囲外 ${stats.tooOld} 件・除外語 ${stats.excluded} 件・`
    + `収録済み ${stats.known} 件・既出 ${stats.alreadySeen} 件を落とした。`);
  md.push('');
  md.push('**除外語で落とした数が多すぎるときは `build/data/new-books-filter.json` を疑う。**');
  md.push('大学受験向けの本まで巻き込んでいる可能性がある。');
  md.push('');
  if (!list.length) {
    md.push('## 候補');
    md.push('');
    md.push('今週は候補なし。');
    return `${md.join('\n')}\n`;
  }
  md.push(`## 候補 ${list.length} 件`);
  md.push('');
  md.push('| 発売日 | 書名 | 出版社 | 著者 | ISBN |');
  md.push('|---|---|---|---|---|');
  for (const h of list) {
    const d = h.date ? h.salesDate : `${h.salesDate || '不明'}（**日付不明**）`;
    const esc = s => String(s).replace(/\|/g, '\\|');
    md.push(`| ${esc(d)} | [${esc(h.title)}](${h.url}) | ${esc(h.pub)} | ${esc(h.author)} | ${h.isbn || '—'} |`);
  }
  md.push('');
  return `${md.join('\n')}\n`;
}

/* ============================================================
   入口
   ============================================================ */

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  if (args.includes('--genres')) return updateGenres(dry);
  const di = args.indexOf('--days');
  const days = di >= 0 && args[di + 1] ? Number(args[di + 1]) : 45;
  if (!Number.isFinite(days) || days <= 0) {
    console.error(`--days の指定が不正: ${args[di + 1]}`);
    process.exit(1);
  }
  return collect(days, dry);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
