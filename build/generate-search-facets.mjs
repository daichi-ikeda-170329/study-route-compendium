/**
 * 詳細検索（`/search/`）が使う索引を作る。
 *
 *   node build/generate-search-facets.mjs
 *   node build/generate-search-facets.mjs --check
 *
 * ## なぜ既存の索引と分けるか
 *
 * `assets/js/book-index.js` は 235,925 バイトあり、**全ページのヘッダー検索**が
 * 検索欄に最初に触れたときに読む。ここへ出版社・著者・難易度帯・出版年・確認状態を
 * 足すと 400KB を超え、ヘッダー検索の初回応答が悪くなる。
 * だから**用途で分ける**。
 *
 *   assets/js/book-index.js（v1・そのまま） … 全ページ。書名の候補出しだけ
 *   assets/generated/search-facets.json（v2） … /search/ でだけ読む
 *
 * `test/performance-budget.test.mjs` が v1 の 300,000 バイト上限を守っている。
 *
 * ## 欠損を推測で埋めない
 *
 * 著者が分からない本は `authors: []`、難易度が無い本は `diff: null`、
 * 刊行年が無い本は `year: null` にする。**0 や空文字で埋めない。**
 * 画面側は「不明・確認中」として区別して出し、絞り込みを指定していないときは
 * 検索対象から外さない。
 *
 * ## 確認状態は複製しない
 *
 * 正本は `build/data/verification.json`。ここでは**その状態を参照するだけ**で、
 * 科目データ側へ書き戻さない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, SUB_LABELS } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { authorsOf, searchName } from './lib/booktitle.mjs';
import { seriesOf } from './lib/series.mjs';
import { hensachiRange } from './lib/rank.mjs';
import { verificationOf, STATUS_LABEL } from './lib/verification.mjs';
import { recordType } from './lib/record-type.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const OUT = path.join(ROOT, 'assets', 'generated', 'search-facets.json');

/**
 * 難易度帯。`diff`（1〜10）をそのまま出すより、幅で選べるほうが選びやすい。
 * **`diff` を持たない本は `null`。** 「未設定＝やさしい」にしない。
 */
export const DIFF_BANDS = [
  { id: 'intro', label: '入門（1〜2）', min: 1, max: 2 },
  { id: 'basic', label: '基礎（3〜4）', min: 3, max: 4 },
  { id: 'std', label: '標準（5〜6）', min: 5, max: 6 },
  { id: 'adv', label: '応用（7〜8）', min: 7, max: 8 },
  { id: 'top', label: '最難関（9〜10）', min: 9, max: 10 },
];

export function diffBand(diff) {
  if (typeof diff !== 'number' || !isFinite(diff)) return null;
  const b = DIFF_BANDS.find(x => diff >= x.min && diff <= x.max);
  return b ? b.id : null;
}

/** 刊行年の帯。年が分からない本は null */
export function yearBand(year) {
  if (typeof year !== 'number' || !isFinite(year)) return null;
  if (year >= 2024) return 'y2024';
  if (year >= 2020) return 'y2020';
  if (year >= 2015) return 'y2015';
  return 'yold';
}

export const YEAR_BANDS = [
  { id: 'y2024', label: '2024年以降' },
  { id: 'y2020', label: '2020〜2023年' },
  { id: 'y2015', label: '2015〜2019年' },
  { id: 'yold', label: '2014年以前' },
];

function build() {
  const subjects = SUBJECTS.map(s => ({ id: s.dir, label: s.ja, mark: s.mark, color: s.color }));
  const subjectIndex = Object.fromEntries(SUBJECTS.map((s, i) => [s.dir, i]));

  const books = [];
  const publishers = new Set();
  const authorSet = new Set();

  for (const s of SUBJECTS) {
    const d = loadSubjectData(ROOT, s.dir);
    for (const b of d.books) {
      const v = verificationOf(s.dir, b);
      const authors = authorsOf(s.dir, b.id);
      const series = seriesOf(b);
      const [lo, hi] = hensachiRange(b);

      authors.forEach(a => authorSet.add(a));
      if (b.pub) publishers.add(b.pub);

      books.push({
        s: subjectIndex[s.dir],
        id: b.id,
        n: searchName(b, s.dir),
        // 分からないものは null のまま。0 や空文字で埋めない
        pub: b.pub || null,
        au: authors,
        // 分野（現代文・物理 など）。持たない科目もある
        sub: b.sub ? (SUB_LABELS[b.sub] || b.sub) : null,
        stage: b.stage || null,
        diff: typeof b.diff === 'number' ? b.diff : null,
        db: diffBand(b.diff),
        // 目安偏差値。数値で書かれていない本（「共テ7割〜9割」など）は null
        hen: lo === 999 ? null : [lo, hi],
        year: typeof b.year === 'number' ? b.year : null,
        yb: yearBand(b.year),
        // 確認状態の正本は build/data/verification.json。ここは参照するだけ
        vs: v.status,
        /* 同名シリーズ・巻違いの取り違えを防ぐための手がかり。
           seriesOf() は「レベル別 3 巻」「4 冊構成」「全レベル（調べ先）」を返す。
           該当しなければ null（無理に埋めない） */
        ser: series ? series.label : null,
        serKind: series ? series.kind : null,
        // ルート上の枠（実在の 1 冊ではないもの）を区別する
        rt: recordType(b),
      });
    }
  }

  return {
    schemaVersion: 2,
    subjects,
    diffBands: DIFF_BANDS,
    yearBands: YEAR_BANDS,
    statusLabel: STATUS_LABEL,
    publishers: [...publishers].sort((a, b) => a.localeCompare(b, 'ja')),
    authors: [...authorSet].sort((a, b) => a.localeCompare(b, 'ja')),
    books,
  };
}

const data = build();
const text = JSON.stringify(data) + '\n';

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) {
    console.error('検索の絞り込み索引が古い。node build/generate-search-facets.mjs を流す');
    process.exit(1);
  }
  console.log('検索の絞り込み索引は最新');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  const missing = {
    pub: data.books.filter(b => !b.pub).length,
    author: data.books.filter(b => !b.au.length).length,
    diff: data.books.filter(b => b.diff === null).length,
    year: data.books.filter(b => b.year === null).length,
  };
  console.log(`  ✓ assets/generated/search-facets.json  (${data.books.length}冊 / ${(text.length / 1024).toFixed(1)}KB)`);
  console.log(`    出版社 ${data.publishers.length} / 著者 ${data.authors.length}`);
  console.log(`    不明のまま残した項目: 出版社 ${missing.pub} / 著者 ${missing.author} / 難易度 ${missing.diff} / 刊行年 ${missing.year}`);
}
