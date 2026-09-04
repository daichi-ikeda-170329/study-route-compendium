/**
 * データ品質のレポートを作る。
 *
 *   node build/report-data-quality.mjs            docs/data-quality.md と .json を書く
 *   node build/report-data-quality.mjs --stdout   標準出力に出すだけ
 *
 * 何を確認すべきかを、印象ではなく件数で決めるためのもの。**確認の優先順位は
 * 「受験生が実際に踏む順」** にしてある。ルートに採用した教材が最優先で、
 * 誰も見ないページの空欄はいちばん後ろでよい。
 *
 * 出典は build/data/verification.json（openBD との照合結果）と、
 * BOOKS の本文に残っている「要確認 / 未確認 / 不明」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { tally } from './lib/tally.mjs';
import { isPlaceholder } from './lib/record-type.mjs';
import { verificationOf, loadVerification, UNVERIFIED_MARK, FACT_FIELDS } from './lib/verification.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STDOUT = process.argv.includes('--stdout');
const TODAY = new Date().toISOString().slice(0, 10);
const STALE_DAYS = 365;

/** 確認の優先順位。上ほど先に確かめる */
const PRIORITY = [
  // 3 分診断の結果に出る教材はルートから引くので、1 番目と同じ集合になる。
  // 別の行にすると必ず 0 件になり、読む人を惑わせるのでまとめてある
  { key: 'route', label: 'ルートに採用している教材（3 分診断の結果に出るものを含む）' },
  { key: 'joho', label: '情報科（市販書が少なく、記載の確度が低い）' },
  { key: 'curriculum', label: '新課程対応が要確認の教材' },
  { key: 'other', label: 'その他' },
];

function main() {
  const led = loadVerification();
  const rows = [];
  const byStatus = { verified: 0, partial: 0, unverified: 0, notApplicable: 0 };
  const bySubject = {};
  const fieldGaps = {};
  const isbnSeen = new Map();
  const mismatches = { official: [], pub: [], year: [] };
  const staleChecks = [];

  for (const s of SUBJECTS) {
    const d = extractSubject(ROOT, s.dir);
    const inRoute = s.catalogOnly ? new Map() : tally(d.routes, d.tiers).main;
    bySubject[s.dir] = { total: d.books.length, verified: 0, partial: 0, unverified: 0, notApplicable: 0 };

    for (const b of d.books) {
      const v = verificationOf(s.dir, b);
      byStatus[v.status]++;
      bySubject[s.dir][v.status]++;
      for (const f of v.unverifiedFields) fieldGaps[f] = (fieldGaps[f] || 0) + 1;

      if (b.isbn13) {
        const k = String(b.isbn13);
        if (!isbnSeen.has(k)) isbnSeen.set(k, []);
        isbnSeen.get(k).push(`${s.dir}:${b.id}`);
      }

      const rec = led.records[`${s.dir}:${b.id}`] || {};
      for (const [f, x] of Object.entries(rec.fields || {})) {
        if (x.mismatch && mismatches[f]) {
          mismatches[f].push({ key: `${s.dir}:${b.id}`, ...x.mismatch });
        }
      }
      if (v.checkedAt) {
        const age = (Date.parse(TODAY) - Date.parse(v.checkedAt)) / 86400000;
        if (age > STALE_DAYS) staleChecks.push({ key: `${s.dir}:${b.id}`, checkedAt: v.checkedAt });
      }

      const text = [b.desc, b.problems, ...(b.cons || []), ...(b.pros || [])].join(' ');
      const curriculum = /新課程/.test(text) && UNVERIFIED_MARK.test(text);
      const priority = (inRoute.get(b.id) || 0) > 0 ? 'route'
        : s.dir === 'joho' ? 'joho'
          : curriculum ? 'curriculum' : 'other';

      rows.push({
        key: `${s.dir}:${b.id}`, subject: s.dir, name: b.name,
        status: v.status, priority,
        unverifiedFields: v.unverifiedFields,
        inRoute: inRoute.get(b.id) || 0,
        placeholder: isPlaceholder(b),
        textMark: UNVERIFIED_MARK.test(text),
      });
    }
  }

  const dupIsbn = [...isbnSeen.entries()].filter(([, v]) => v.length > 1);
  const byPriority = {};
  for (const p of PRIORITY) {
    const list = rows.filter(r => r.priority === p.key);
    byPriority[p.key] = {
      label: p.label,
      total: list.length,
      unverified: list.filter(r => r.status === 'unverified').length,
      partial: list.filter(r => r.status === 'partial').length,
      verified: list.filter(r => r.status === 'verified').length,
    };
  }

  const json = {
    generatedAt: TODAY,
    total: rows.length,
    byStatus, bySubject, fieldGaps, byPriority,
    duplicateIsbn: dupIsbn.map(([isbn, keys]) => ({ isbn, keys })),
    mismatchCounts: Object.fromEntries(Object.entries(mismatches).map(([k, v]) => [k, v.length])),
    staleChecks: staleChecks.length,
    textMarkRemaining: rows.filter(r => r.textMark).length,
  };

  const pct = (n) => `${Math.round((n / rows.length) * 1000) / 10}%`;
  const md = [
    '# データ品質レポート',
    '',
    '生成物。`node build/report-data-quality.mjs` が作る。手で編集しない。',
    '',
    `- 生成日: ${TODAY}`,
    `- 収録レコード: ${rows.length} 件`,
    '',
    '## 確認状態',
    '',
    '| 状態 | 件数 | 割合 |',
    '|---|---:|---:|',
    `| verified（出典と確認日がある） | ${byStatus.verified} | ${pct(byStatus.verified)} |`,
    `| partial（一部の項目だけ確認） | ${byStatus.partial} | ${pct(byStatus.partial)} |`,
    `| unverified（確認していない） | ${byStatus.unverified} | ${pct(byStatus.unverified)} |`,
    `| notApplicable（ルート上の枠） | ${byStatus.notApplicable} | ${pct(byStatus.notApplicable)} |`,
    '',
    '「verified」は公開されている書誌情報と一致したという意味であり、**現物を確認したという意味ではない**。',
    '現物確認（physicalReview）は 1 件も立てていない。',
    '',
    '## 科目別',
    '',
    '| 科目 | 収録 | verified | partial | unverified |',
    '|---|---:|---:|---:|---:|',
    ...SUBJECTS.map(s => {
      const x = bySubject[s.dir];
      return `| ${s.ja} | ${x.total} | ${x.verified} | ${x.partial} | ${x.unverified} |`;
    }),
    '',
    '## 未確認の項目',
    '',
    '| 項目 | 未確認の件数 |',
    '|---|---:|',
    ...FACT_FIELDS.map(f => `| ${f} | ${fieldGaps[f] || 0} |`),
    '',
    '## 確認の優先順位',
    '',
    '受験生が実際に踏む順に並べる。ルートに採用した教材から確かめる。',
    '',
    '| 優先 | 対象 | 件数 | unverified | partial |',
    '|---:|---|---:|---:|---:|',
    ...PRIORITY.map((p, i) => {
      const x = byPriority[p.key];
      return `| ${i + 1} | ${x.label} | ${x.total} | ${x.unverified} | ${x.partial} |`;
    }),
    '',
    '## 書誌データベースとの食い違い',
    '',
    'openBD が返した値と収録データが一致しなかったもの。**どちらが正しいかは確かめていない**ので、',
    'いずれも verified にしていない。版・副題の書き方の違いが多い。',
    '',
    '| 項目 | 件数 |',
    '|---|---:|',
    ...Object.entries(json.mismatchCounts).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## そのほか',
    '',
    `- ISBN の重複: ${dupIsbn.length} 件${dupIsbn.length ? `（${dupIsbn.map(([i]) => i).join(', ')}）` : ''}`,
    `- 確認日が ${STALE_DAYS} 日を超えたレコード: ${staleChecks.length} 件`,
    `- 本文に「要確認 / 未確認 / 不明」が残っているレコード: ${json.textMarkRemaining} 件`,
    '',
    '本文の「要確認」は、状態を構造化データへ移したあとも読み手への注記として残している。',
    '消す前に `build/data/verification.json` 側で状態を持てていることを確かめる。',
    '',
  ].join('\n');

  if (STDOUT) { console.log(md); return; }
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'data-quality.md'), md);
  fs.writeFileSync(path.join(ROOT, 'docs', 'data-quality.json'), `${JSON.stringify(json, null, 1)}\n`);
  console.log(`docs/data-quality.md と .json を書いた（${rows.length} 件 / verified ${byStatus.verified} / partial ${byStatus.partial} / unverified ${byStatus.unverified}）`);
}

main();
