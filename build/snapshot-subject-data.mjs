/**
 * 科目データのスナップショットを作る。
 *
 *   node build/snapshot-subject-data.mjs           作り直す
 *   node build/snapshot-subject-data.mjs --check   現状と食い違っていないか見る
 *
 * **データを別ファイルへ移す前の土台。**（指示書 13.1 の手順 1）
 * いまのデータは科目トップの HTML に <script> リテラルとして書かれている。
 * これを `data/subjects/<科目>/` 以下の JSON へ移すときに、「移したつもりで
 * 中身が変わっていた」を検出できるようにしておく。
 *
 * 中身そのものではなく、レコードごとのハッシュを持つ。全文を持つと 5MB を超え、
 * 差分が読めなくなるため。**どのレコードが変わったかが分かれば足りる。**
 * 変わった中身を見たいときは `--dump` で JSON を書き出して比べる。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { validateSubjectData, canonical } from './lib/validate-subject-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'data', 'subject-snapshot.json');
const CHECK = process.argv.includes('--check');
const DUMP = process.argv.includes('--dump');

const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex').slice(0, 16);

export function snapshot() {
  const out = { schemaVersion: 1, subjects: {} };
  const problems = [];
  for (const s of SUBJECTS) {
    const d = extractSubject(ROOT, s.dir);
    problems.push(...validateSubjectData(s.dir, d));
    out.subjects[s.dir] = {
      counts: {
        books: d.books.length, unis: d.unis.length,
        tiers: d.tiers.length, guides: d.guides.length,
      },
      // 構造ごとのハッシュ。どこが変わったかを大づかみに知る
      shape: {
        tiers: hash(d.tiers), routes: hash(d.routes),
        stages: hash(d.stages), unis: hash(d.unis), guides: hash(d.guides),
      },
      // レコードごとのハッシュ。どの本が変わったかを知る
      books: Object.fromEntries(d.books.map(b => [b.id, hash(b)])),
    };
  }
  return { out, problems };
}

function main() {
  const { out, problems } = snapshot();
  if (problems.length) {
    for (const p of problems.slice(0, 30)) console.error(`  ✗ ${p}`);
    console.error(`科目データの形の検証で ${problems.length} 件見つかった`);
    process.exit(1);
  }

  if (DUMP) {
    const dir = path.join(ROOT, 'build', '.cache', 'subject-dump');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of SUBJECTS) {
      const d = extractSubject(ROOT, s.dir);
      fs.writeFileSync(path.join(dir, `${s.dir}.json`), `${JSON.stringify(canonical(d), null, 1)}\n`);
    }
    console.log(`build/.cache/subject-dump/ に全文を書き出した（git には入らない）`);
  }

  const text = `${JSON.stringify(out, null, 1)}\n`;
  if (CHECK) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== text) {
      console.error('科目データがスナップショットと食い違っている。');
      console.error('意図した変更なら node build/snapshot-subject-data.mjs で取り直す。');
      console.error('意図していなければ、どのレコードが変わったかを差分で確かめる。');
      process.exit(1);
    }
    console.log('科目データはスナップショットと一致している');
    return;
  }
  fs.writeFileSync(OUT, text);
  const n = Object.values(out.subjects).reduce((a, x) => a + x.counts.books, 0);
  console.log(`スナップショットを取り直した（${n} レコード / ${SUBJECTS.length} 科目）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
