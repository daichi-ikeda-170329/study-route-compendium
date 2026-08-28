/**
 * F 型（新刊速報）の投稿文を作る。
 *
 *   node build/gen-x-newbook.mjs         未投稿の新刊ぶんを作る
 *   node build/gen-x-newbook.mjs --all   投稿済みも作り直す
 *   node build/gen-x-newbook.mjs --dry   書かずに結果だけ出す
 *
 * 設計は docs/new-books-plan.md の 9 節。投稿タイプの一覧は docs/x-account-plan.md の 4 節。
 *
 * A〜E 型は月次でまとめて作る（build/gen-x-posts.mjs）。**新刊をそれに載せると
 * 投稿が最大 1 か月遅れ、速報としての価値が消える**ので、掲載のたびに単発で作る。
 *
 * **難易度も向いている人も書かない。** 新刊は現物を読んでいないので、書けるのは
 * 書名・出版社・刊行年・役割・サイトの書籍ページ URL だけである。ここで無理に
 * 中身を語ると、サイト側で「評価準備中」と出していることと食い違う。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, SUB_LABELS } from './lib/extract.mjs';
import { loadNewBooks } from './lib/newbooks.mjs';
import { weightedLen, fitLines, trackedUrl, X_LIMIT } from './gen-x-posts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'x-posts', 'new');
const POSTED_FILE = path.join(OUT_DIR, 'posted.json');

/** F 型の投稿時刻。速報なので他の型より早い時間に置く */
export const SLOT = '20:00';

/**
 * 1 冊ぶんの投稿文。
 *
 * @param {object} b        new-books.json の 1 件
 * @param {object} sub      SUBJECTS の 1 科目
 * @param {object} stages   その科目の STAGES
 */
export function postF(b, sub, stages) {
  const st = stages[b.stage] || {};
  const url = trackedUrl(`/${sub.dir}/books/${b.id}/`, 'rt_f_new');
  const field = b.sub ? (SUB_LABELS[b.sub] || '') : '';

  const head = `【新刊】${b.name}（${b.pub}）`;
  // 落としてよい順に後ろへ置く。文字数に収まらない月でも体裁が崩れないようにする
  const optional = [
    `${sub.ja}${field ? `（${field}）` : ''}／${st.label || st.short || '—'}`,
    b.year ? `${b.year}年 刊行` : null,
    '難易度の評価はまだしていません。現物を確認してから書きます。',
  ].filter(Boolean);
  const tail = `\n▼ 図鑑に追加しました\n${url}`;

  const text = fitLines(head, optional, tail);
  return text ? { text, note: `${sub.ja} / ${b.id}` } : null;
}

function readPosted() {
  try {
    return new Set(JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8')).posted || []);
  } catch {
    return new Set();
  }
}

function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const dry = args.includes('--dry');

  const books = loadNewBooks(ROOT);
  if (!books.length) {
    console.log('承認済みの新刊が無い。build/data/new-books.json に足してから流す');
    return;
  }

  const posted = readPosted();
  const stagesOf = new Map();
  for (const s of SUBJECTS) stagesOf.set(s.dir, extractSubject(ROOT, s.dir).stages);

  let made = 0;
  const newlyMade = [];
  for (const b of books) {
    const key = `${b.subject}:${b.id}`;
    if (!all && posted.has(key)) continue;
    const sub = SUBJECTS.find(s => s.dir === b.subject);
    if (!sub) throw new Error(`new-books.json: ${b.id} の subject が科目名でない — ${b.subject}`);

    const p = postF(b, sub, stagesOf.get(sub.dir));
    if (!p) {
      // 書名が長すぎて、落とせる行を全部落としても収まらない場合。
      // 黙って飛ばすと投稿が 1 本消えるので、必ず報せる
      console.error(`収まらない: ${key}（書名を短くするか手で書く）`);
      continue;
    }

    const file = path.join(OUT_DIR, `${b.subject}-${b.id}.md`);
    const md = [
      `# F 型（新刊速報） — ${b.name}`,
      '',
      '`node build/gen-x-newbook.mjs` が生成した。設計は [new-books-plan.md](../../new-books-plan.md)。',
      '',
      `投稿の目安は ${SLOT}。ブラウザ版の予約投稿に貼る（アプリからは予約できない）。`,
      '',
      '```',
      p.text,
      '```',
      '',
      `文字数 ${weightedLen(p.text)} / ${X_LIMIT}`,
      '',
      '投稿したら `docs/x-posts/new/posted.json` の `posted` に',
      `\`${key}\` を足す（次回から作られなくなる）。`,
      '',
    ].join('\n');

    if (dry) {
      console.log(`--- ${file} ---\n${p.text}\n（${weightedLen(p.text)} / ${X_LIMIT}）`);
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(file, md, 'utf8');
      console.log(`${path.relative(ROOT, file)} を生成（${weightedLen(p.text)} / ${X_LIMIT}）`);
    }
    made++;
    newlyMade.push(key);
  }

  if (!made) {
    console.log(`未投稿の新刊は無い（承認済み ${books.length} 冊はすべて投稿済み）。作り直すなら --all`);
    return;
  }
  if (dry) { console.log(`${made} 本（--dry なので書き込んでいない）`); return; }

  // 投稿済みの記録は池田さんが投稿したあとに手で足す。ここで自動的に足すと、
  // 生成しただけで投稿していない本が「投稿済み」になってしまう
  if (!fs.existsSync(POSTED_FILE)) {
    fs.writeFileSync(POSTED_FILE, `${JSON.stringify({
      note: 'X に投稿し終えた新刊。生成のたびに自動では足さない（生成 = 投稿ではないため）。投稿したら手で足す',
      posted: [],
    }, null, 2)}\n`, 'utf8');
  }
  console.log(`${made} 本を生成した。投稿したら docs/x-posts/new/posted.json に足す`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
