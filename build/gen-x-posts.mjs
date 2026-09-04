/**
 * X の投稿案を生成する（docs/x-account-plan.md の 7 節）。
 *
 * 投稿タイプは 5 つある。このスクリプトが作るのは、BOOKS から機械的に組み立てられる
 * 2 つだけである。
 *
 *   A 図鑑カード — 1 冊を役割・難易度・量・ペースで紹介する定型
 *   E エンタメ   — 収録データから出る事実（最多の出版社、最長の学習時間など）
 *   F 新刊速報   — build/data/new-books.json に入った新刊。掲載済みのものだけ
 *
 * 残る B（ルート提示）・C（判断基準）・D（対決）は判断が要るので Claude が書く。
 * そのための材料も「候補データ」として同じファイルに出す。**科目トップの HTML は
 * 1 枚が大きく、5 枚読ませるとトークンを浪費するため、Claude に渡すのはこの候補
 * データだけにする。**
 *
 * 新刊の調査も同じ月次セッションで行う。手順は生成物の「新刊調査」節に出る
 * （設計は docs/new-books-plan.md）。調査 → 掲載 → このスクリプトを --force で
 * 流し直す、の順で回すと F 型が入った月次ファイルになる。
 *
 * 使い方
 *   node build/gen-x-posts.mjs            # 翌月分
 *   node build/gen-x-posts.mjs 2026-09    # 月を指定
 *   node build/gen-x-posts.mjs 2026-09 --force   # 既にあっても作り直す
 *
 * 出力は docs/x-posts/YYYY-MM.md。既に出した本は docs/x-posts/used.json に記録し、
 * 翌月以降に重複して出さない。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, SUB_LABELS, ORIGIN } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { tally } from './lib/tally.mjs';
import { searchName } from './lib/booktitle.mjs';
import { isProvisional, loadNewBooks } from './lib/newbooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'x-posts');
const USED_FILE = path.join(OUT_DIR, 'used.json');
const PUBLISHERS_FILE = path.join(ROOT, 'build', 'data', 'publishers.json');

/**
 * 1 か月に作る本数。合計 28 本＝4 週間ぶん。
 *
 * F（新刊速報）は月によって本数が変わる。掲載した新刊の数だけ A（図鑑カード）を
 * 減らして合計 28 本を保つ。**F が A を押しのける**のは、新刊は鮮度が価値であり、
 * 図鑑カードは翌月以降でも同じ価値を出せるためである。
 */
const PLAN = { A: 12, E: 4, B: 4, C: 4, D: 4 };

/** F 型の上限。新刊が大量に出た月に、月次ファイルが新刊だらけになるのを防ぐ */
const F_MAX = 4;

/** 投稿の時間帯。受験生が X を見る時間（勉強を終えた夜）に寄せる */
const SLOTS = { A: '22:00', E: '21:00', B: '22:30', C: '22:00', D: '21:30', F: '20:00' };

/**
 * A 型（図鑑カード）に出さない style。
 *
 * 赤本などの過去問は志望校ルートでの採用回数が最も多くなるが、中身が志望校ごとに
 * 違い、収録内容を紹介できない。全受験生が既に知っているため投稿としての価値も低い。
 * 採用回数だけで並べると、この種類が上位を独占して初月が過去問だらけになる。
 */
const A_EXCLUDE_STYLES = ['過去問', '過去問研究', '過去問講義'];

/* ============================================================
   X の文字数
   ============================================================ */

/**
 * X の重み付き文字数。上限は 280 で、全角 1 文字が 2 と数えられるため実質 140 字。
 * URL は実際の長さによらず t.co の 23 文字として数えられる。
 *
 * ここを間違えると、コピペした投稿がその場で弾かれて手戻りになる。X の仕様では
 * 次のコードポイント範囲だけが重み 1 で、それ以外（日本語・全角記号・絵文字）は 2。
 */
export const X_LIMIT = 280;
export const URL_WEIGHT = 23;
const LIGHT_RANGES = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

export function weightedLen(text) {
  const urls = text.match(/https?:\/\/\S+/g) || [];
  const rest = text.replace(/https?:\/\/\S+/g, '');
  let n = urls.length * URL_WEIGHT;
  for (const ch of rest) {
    const cp = ch.codePointAt(0);
    n += LIGHT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2;
  }
  return n;
}

/* ============================================================
   URL
   ============================================================ */

/** 自分の投稿に貼る URL にだけ utm を付ける。ユーザーの共有由来（utm 無し）と切り分けるため */
export function trackedUrl(pathname, campaign) {
  return `${ORIGIN}${pathname}?utm_source=x&utm_medium=social&utm_campaign=${campaign}`;
}

/* ============================================================
   A 型：図鑑カード
   ============================================================ */

/**
 * 難易度の表記。BOOKS の diff は **1〜10 の 10 段階**である（5 段階ではない）。
 * サイト側（build/lib/cards.mjs）も 10 本のバーと「難易度 N」で出しているので、
 * 投稿でも同じ尺度で書く。星 5 つに丸めると、サイトを開いた読者の見る数字と食い違う。
 */
const DIFF_MAX = 10;
const diffLabel = d => `難易度 ${Number(d) || '—'}/${DIFF_MAX}`;

/**
 * 上限に収まるまで、優先度の低い行から落とす。
 * 落とす順を固定しておかないと、月によって載る項目が変わって体裁が崩れる。
 */
export function fitLines(head, optional, tail) {
  for (let drop = 0; drop <= optional.length; drop++) {
    const kept = optional.slice(0, optional.length - drop).filter(Boolean);
    const body = [head, ...kept, tail].filter(Boolean).join('\n');
    if (weightedLen(body) <= X_LIMIT) return body;
  }
  return null;
}

function postA(b, sub, adopt) {
  const name = searchName(b, sub.dir);
  const url = trackedUrl(`/${sub.dir}/books/${b.id}/`, 'rt_a_catalog');

  const head = `【今日の1冊】${name}（${b.pub}）`;
  // 落としてよい順に後ろへ置く
  const optional = [
    `${sub.ja}／${b.style || '—'}　${diffLabel(b.diff)}`,
    b.hensachi ? `到達目安：${b.hensachi}` : null,
    b.problems ? `量：${b.problems}` : null,
    b.hours ? `ペース：${b.hours}` : null,
    adopt ? `志望校ルートでの採用：${adopt}回` : null,
    b.bestFor ? `向いている人：${b.bestFor}` : null,
  ].filter(Boolean);
  const tail = `\n▼ 役割と接続先はこちら\n${url}`;

  const text = fitLines(head, optional, tail);
  return text ? { type: 'A', text, note: `${sub.ja} / ${b.id}` } : null;
}

/* ============================================================
   F 型：新刊速報
   ============================================================ */

/**
 * 掲載したばかりの新刊 1 冊を知らせる。
 *
 * **難易度も向いている人も書かない。** 新刊は現物を読んでいないので、書けるのは
 * 書名・出版社・刊行年・役割・書籍ページの URL だけである。ここで中身を語ると、
 * サイト側で「評価準備中」と出していることと食い違う。
 *
 * @param {object} b      new-books.json の 1 件
 * @param {object} sub    SUBJECTS の 1 科目
 * @param {object} stages その科目の STAGES
 */
export function postF(b, sub, stages) {
  const st = stages[b.stage] || {};
  const url = trackedUrl(`/${sub.dir}/books/${b.id}/`, 'rt_f_new');
  const field = b.sub ? (SUB_LABELS[b.sub] || '') : '';

  const head = `【新刊】${b.name}（${b.pub}）`;
  // 落としてよい順に後ろへ置く
  const optional = [
    `${sub.ja}${field ? `（${field}）` : ''}／${st.label || st.short || '—'}`,
    b.year ? `${b.year}年 刊行` : null,
    b.subjects ? `収録：${b.subjects}` : null,
    '難易度の評価はまだしていません。現物を確認してから書きます。',
  ].filter(Boolean);
  const tail = `\n▼ 図鑑に追加しました\n${url}`;

  const text = fitLines(head, optional, tail);
  return text ? { type: 'F', text, note: `${sub.ja} / ${b.id}` } : null;
}

/* ============================================================
   E 型：データから出る事実
   ============================================================ */

/**
 * BOOKS から実際に取れる事実だけを使う。推測で面白くしない。
 * 読者が確かめられるよう、母数（そのとき収録している冊数・ルート数）と切り口を
 * 本文に書く。母数は BOOKS / ROUTES から数えるので、ここに冊数は書かない。
 */
function postsE(data) {
  const all = SUBJECTS.flatMap(s => data[s.dir].books.map(b => ({ ...b, _sub: s })));
  const out = [];

  const push = (headline, lines, pathname) => {
    const url = trackedUrl(pathname, 'rt_e_fun');
    const text = fitLines(headline, lines, `\n${url}`);
    if (text) out.push({ type: 'E', text, note: headline.slice(0, 26) });
  };

  // 1. 収録冊数が最も多い出版社
  const byPub = new Map();
  for (const b of all) byPub.set(b.pub, (byPub.get(b.pub) || 0) + 1);
  const pubTop = [...byPub].sort((a, b) => b[1] - a[1]).slice(0, 3);
  push(
    `参考書${all.length.toLocaleString('en-US')}冊を出版社で数えてみた。`,
    pubTop.map(([p, n], i) => `${i + 1}位 ${p}　${n}冊`),
    '/',
  );

  // 2. 想定学習時間が最も長い 1 冊
  const longest = all.filter(b => Number(b.h) > 0).sort((a, b) => b.h - a.h)[0];
  if (longest) {
    push(
      `${all.length.toLocaleString('en-US')}冊で最も時間がかかる参考書はこれ。`,
      [
        `${searchName(longest, longest._sub.dir)}（${longest.pub}）`,
        `想定学習時間 ${longest.h}時間`,
        longest.hours ? `目安：${longest.hours}` : null,
      ],
      `/${longest._sub.dir}/books/${longest.id}/`,
    );
  }

  // 3. 難易度が最高（10 段階の 10）の本の数
  const hardest = all.filter(b => Number(b.diff) === DIFF_MAX);
  const bySubHard = SUBJECTS
    .map(s => [s.ja, hardest.filter(b => b._sub.dir === s.dir).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  push(
    `難易度を10段階で付けて、最高の10になったのは${all.length.toLocaleString('en-US')}冊中${hardest.length}冊だった。`,
    bySubHard.map(([ja, n]) => `${ja}　${n}冊`),
    '/',
  );

  // 4. 刊行年が最も古い 1 冊
  const oldest = all.filter(b => Number(b.year) > 1900).sort((a, b) => a.year - b.year)[0];
  if (oldest) {
    push(
      `${all.length.toLocaleString('en-US')}冊で最も古くから読み継がれている参考書。`,
      [
        `${searchName(oldest, oldest._sub.dir)}（${oldest.pub}）`,
        `${oldest.year}年刊`,
        'いまも志望校ルートに載っている。',
      ],
      `/${oldest._sub.dir}/books/${oldest.id}/`,
    );
  }

  // 5. ルート採用回数が最も多い 1 冊
  // 「何本のルートを組んだか」は志望レベルの総数。README の冊数と同じく、
  // 数え方をここに書かずデータから出す（データが増えたときに文面が古くならない）
  const tierTotal = SUBJECTS.reduce((n, s) => n + data[s.dir].tiers.length, 0);
  const adoptTop = SUBJECTS
    .map(s => {
      const d = data[s.dir];
      const t = tally(d.routes, d.tiers);
      const top = [...t.main].sort((a, b) => b[1] - a[1])[0];
      if (!top) return null;
      const b = d.books.find(x => x.id === top[0]);
      return b ? { b, sub: s, n: top[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.n - a.n)[0];
  if (adoptTop) {
    push(
      `志望校別ルート${tierTotal}本を組んで、最も多く登場した参考書。`,
      [
        `${searchName(adoptTop.b, adoptTop.sub.dir)}（${adoptTop.b.pub}）`,
        `${adoptTop.n}本のルートで採用。`,
        '志望校が違っても、ここは通る。',
      ],
      `/${adoptTop.sub.dir}/books/${adoptTop.b.id}/`,
    );
  }

  return out;
}

/* ============================================================
   新刊調査（月次セッションの最初にやること）
   ============================================================ */

/**
 * 新刊を調べるための材料と手順。
 *
 * 検知は自動化していない。楽天ブックス書籍検索 API を使う案は、登録アプリごとに
 * IP 許可制であることが分かった時点で捨てた（GitHub Actions は実行 IP が
 * 7,000 以上のレンジから割り当てられ、登録しきれない）。代わりに、B・C・D 型を
 * 書く月 1 回のセッションで Claude が調べる。設計は docs/new-books-plan.md。
 *
 * ここに出すのは「調べに行く先」と「いま何が収録されているか」だけにする。
 * 収録している本を全部読ませるとトークンを浪費するため、判断に要る集計だけを渡す。
 */
function survey(data, publishers) {
  const lines = [];
  const all = SUBJECTS.flatMap(s => data[s.dir].books);

  lines.push('## 新刊調査（Claude がやる）');
  lines.push('');
  lines.push('**B・C・D 型を書く前に、まずこれをやる。** 新刊が見つかったら F 型の枠が');
  lines.push('増え、その分 A 型が減るので、順番を逆にすると作り直しになる。');
  lines.push('');
  lines.push('### 手順');
  lines.push('');
  lines.push('1. 下の出版社の新刊ページを見る。あわせて検索でも拾う（両方やる）');
  lines.push('2. 見つけた本が下の「収録済みの出版社」の冊数に照らして未収録かを確かめる。');
  lines.push('   判断がつかないものはサイトの検索（`assets/js/book-index.js`）で書名を引く');
  lines.push('3. 掲載する本を `build/data/new-books.json` に足す。**必須は id・subject・');
  lines.push('   name・official・pub・year・stage の 7 つ**');
  lines.push('4. **難易度・到達目安・強み・注意点・向いている人は書かない。** 現物を');
  lines.push('   読んでいないため。`provisional: true` を立てて「評価準備中」で出す');
  lines.push('5. 再生成する');
  lines.push('');
  lines.push('```bash');
  lines.push('node build/apply-new-books.mjs');
  lines.push('node build/generate-books.mjs && node build/generate-index.mjs && node build/generate-picks.mjs');
  lines.push('node build/generate-routes.mjs && node build/generate-articles.mjs && node build/generate-search.mjs');
  lines.push('node build/apply-count.mjs');
  lines.push('node build/generate-sitemap.mjs');
  lines.push('node build/gen-x-posts.mjs <この月> --force   # F 型が入った状態で作り直す');
  lines.push('```');
  lines.push('');
  lines.push('`--force` で作り直しても **A 型の中身は変わらない**（used.json の byMonth が');
  lines.push('この月の分を覚えているため）。安心して流し直してよい。');
  lines.push('');
  lines.push('### 見つけても掲載しないもの');
  lines.push('');
  lines.push('- 大学受験以外（小中学・高校入試・英検などの資格・専門学校・大学院）');
  lines.push('- 改訂版のうち、**同じ本が既に収録されているもの**（版が変わっただけなら既存の year を直す）');
  lines.push('- 赤本・青本などの大学別過去問（毎年出るうえ、収録済みの枠で足りている）');
  lines.push('- 学校専売で一般に買えないもの（書影も取れず、読者が入手できない）');
  lines.push('');
  lines.push('### 調べに行く先');
  lines.push('');
  for (const pub of publishers.publishers) {
    lines.push(`- **${pub.name}** — ${pub.url}`);
  }
  lines.push('');
  lines.push('**開けない URL があったら `build/data/publishers.json` を直す。**');
  lines.push('放置すると、その出版社だけ静かに調査から抜け落ちる。');
  lines.push('');
  lines.push('検索でも拾う。');
  lines.push('');
  for (const q of publishers.searchQueries) lines.push(`- \`${q}\``);
  lines.push('');

  lines.push('### いま収録している出版社（冊数順・上位 20）');
  lines.push('');
  lines.push('未収録かどうかの当たりを付けるために出している。');
  lines.push('**冊数が多い出版社ほど、新刊も拾えている可能性が高い。**');
  lines.push('');
  const byPub = new Map();
  for (const b of all) byPub.set(b.pub, (byPub.get(b.pub) || 0) + 1);
  const top = [...byPub].sort((a, b) => b[1] - a[1]).slice(0, 20);
  lines.push(top.map(([n, c]) => `${n} ${c}`).join('｜'));
  lines.push('');

  lines.push('### 収録している刊行年の分布（新しい順・上位 6 年）');
  lines.push('');
  lines.push('**直近の年の冊数が少なければ、新刊を取りこぼしている。**');
  lines.push('');
  const byYear = new Map();
  for (const b of all) if (Number(b.year) > 1900) byYear.set(b.year, (byYear.get(b.year) || 0) + 1);
  const years = [...byYear].sort((a, b) => b[0] - a[0]).slice(0, 6);
  lines.push('| 刊行年 | 冊数 |');
  lines.push('|---|---|');
  for (const [yy, c] of years) lines.push(`| ${yy} | ${c} |`);
  lines.push('');
  lines.push(`収録は全 ${all.length.toLocaleString('en-US')} 冊。`);
  lines.push('');

  return lines.join('\n');
}

/* ============================================================
   B・C・D 型のための候補データ
   ============================================================ */

/**
 * Claude が B（ルート提示）・C（判断基準）・D（対決）を書くための材料。
 * 科目トップの HTML を読ませずに済ませることがこの節の目的なので、
 * **書くのに必要な最小限だけ**を出す。冊数を増やすとトークンが増える。
 */
/**
 * 同じシリーズの分冊どうしか。
 *
 * 「宇宙一わかりやすい高校物理 力学・波動」と「電磁気・熱・原子」のような組は、
 * 役割も難易度も同じだが競合ではなく併用する本なので、対決にならない。
 * 書名の先頭が長く一致することを手がかりに弾く。
 *
 * 著者が同じで内容が補完関係にある組（「村瀬 系統地理」と「村瀬 地誌」など）は
 * 書名が短く、この手がかりでは弾けない。候補はあくまで下書きであり、
 * 最終的にどれを使うかは書き手が選ぶ前提で残してある。
 *
 * 閾値の 5 は現在の収録データに合わせた経験則である（「名問の森 」が 5 文字で一致する）。
 * 収録が増えて取りこぼしが目立つようになったら、書名ではなく収録範囲の
 * 補完関係で判定する方法に替える。
 */
const SERIES_PREFIX = 5;

function sameSeries(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= SERIES_PREFIX;
}

function candidates(data) {
  const lines = [];

  lines.push('### 志望レベル（B 型のルート提示に使う）');
  lines.push('');
  for (const s of SUBJECTS) {
    const names = data[s.dir].tiers.map(t => t.name).join('・');
    lines.push(`- **${s.ja}** — ${names}`);
  }

  lines.push('');
  lines.push('### 対決の候補（D 型に使う）');
  lines.push('');
  lines.push('同じ分野・同じ役割・同じ難易度で並び、どちらもルートに採用されている本のペア。');
  lines.push('');
  lines.push('**そのまま使わず、書き手が選ぶこと。** 同じ著者による補完関係の組');
  lines.push('（系統地理と地誌など）が混ざることがある。併用する本どうしは対決にならない。');
  lines.push('');
  for (const s of SUBJECTS) {
    const d = data[s.dir];
    const t = tally(d.routes, d.tiers);
    const groups = new Map();
    for (const b of d.books) {
      const n = t.main.get(b.id) || 0;
      if (n === 0) continue;             // ルートに載らない本は争点にならない
      // 分野（現代文 / 古文、物理 / 化学 …）をまたぐと対決にならないので key に含める。
      // 役割（stage）と難易度が同じでも、分野が違えば読者にとって比べる対象ではない
      const key = `${b.sub || ''}:${b.stage}:${b.diff}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ b, n });
    }
    const pairs = [...groups.values()]
      .filter(g => g.length >= 2)
      .map(g => g.sort((x, y) => y.n - x.n).slice(0, 2))
      .filter(([x, y]) => !sameSeries(searchName(x.b, s.dir), searchName(y.b, s.dir)))
      .sort((a, b) => (b[0].n + b[1].n) - (a[0].n + a[1].n))
      .slice(0, 3);
    if (!pairs.length) continue;
    lines.push(`**${s.ja}**`);
    lines.push('');
    for (const [x, y] of pairs) {
      const nx = searchName(x.b, s.dir);
      const ny = searchName(y.b, s.dir);
      lines.push(`- ${nx}（採用${x.n}回） vs ${ny}（採用${y.n}回）／難易度 ${x.b.diff} 対 ${y.b.diff}`);
      lines.push(`  - ${nx}: ${x.b.problems || '—'}／${x.b.hours || '—'}／向く人: ${x.b.bestFor || '—'}`);
      lines.push(`  - ${ny}: ${y.b.problems || '—'}／${y.b.hours || '—'}／向く人: ${y.b.bestFor || '—'}`);
    }
    lines.push('');
  }

  lines.push('### ルート採用が多い本（B・C 型の根拠に使う）');
  lines.push('');
  for (const s of SUBJECTS) {
    const d = data[s.dir];
    const t = tally(d.routes, d.tiers);
    const top = [...t.main].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => {
        const b = d.books.find(x => x.id === id);
        return b ? `${searchName(b, s.dir)}（${n}回）` : null;
      }).filter(Boolean);
    lines.push(`- **${s.ja}** — ${top.join('、')}`);
  }

  return lines.join('\n');
}

/* ============================================================
   組み立て
   ============================================================ */

/**
 * 既出の記録を読む。
 *
 * `used` は A 型で出した本、`newPosted` は F 型で出した新刊。
 * `byMonth` はどの月に出したかで、**同じ月を作り直したときに内容が入れ替わるのを
 * 防ぐために持つ**。これが無いと、--force で流し直すたびに A 型が別の本になり、
 * 「新刊を調べてから月次ファイルを作り直す」という運用が成り立たない。
 *
 * byMonth を持たない古い形式のファイルも読める（初回は空として扱う）。
 */
function readUsed() {
  try {
    const j = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'));
    return {
      used: new Set(j.used || []),
      newPosted: new Set(j.newPosted || []),
      byMonth: j.byMonth || {},
    };
  } catch {
    return { used: new Set(), newPosted: new Set(), byMonth: {} };   // 初回は記録が無い
  }
}

/** 「YYYY-MM」を解釈する。省略時は翌月 */
function targetMonth(arg) {
  if (arg && /^\d{4}-\d{2}$/.test(arg)) {
    const [y, m] = arg.split('-').map(Number);
    if (m >= 1 && m <= 12) return { y, m };
  }
  if (arg) {
    console.error(`月の指定が不正: ${arg}（YYYY-MM で渡す）`);
    process.exit(1);
  }
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

/** その月の投稿日を作る。1 日 1 本、月初から連番で埋める */
function schedule(y, m, count) {
  const days = new Date(y, m, 0).getDate();
  const wd = ['日', '月', '火', '水', '木', '金', '土'];
  const out = [];
  for (let i = 0; i < count && i < days; i++) {
    const d = new Date(y, m - 1, i + 1);
    out.push(`${m}/${i + 1}(${wd[d.getDay()]})`);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const { y, m } = targetMonth(args.find(a => a !== '--force'));
  const mm = String(m).padStart(2, '0');
  const outFile = path.join(OUT_DIR, `${y}-${mm}.md`);

  // 同じ月を作り直すと、前回出した本が used.json で「既出」になっているため
  // 別の本に入れ替わる。GitHub Actions のリトライや手動再実行で内容が黙って
  // 変わるのを避けるため、既にあるときは作らない。作り直すなら --force を付ける。
  if (fs.existsSync(outFile) && !force) {
    console.log(`${path.relative(ROOT, outFile)} は既にある。作り直すなら --force を付ける`);
    return;
  }

  const data = {};
  for (const s of SUBJECTS) data[s.dir] = loadSubjectData(ROOT, s.dir);

  const rec = readUsed();
  const month = `${y}-${mm}`;

  // この月に出した本は「既出」から外す。--force で作り直したときに、前回この月に
  // 選ばれた本がそのまま選ばれ直すようにするため。これが無いと、新刊を調べてから
  // 流し直すたびに A 型が総入れ替えになる
  const mine = new Set(rec.byMonth[month] || []);
  const used = new Set([...rec.used].filter(k => !mine.has(k)));
  const newPosted = new Set([...rec.newPosted].filter(k => !mine.has(k)));

  // F 型：掲載済みの新刊のうち、まだ投稿していないもの。
  // 新刊の鮮度が価値なので、A 型より先に枠を取る
  const stagesOf = new Map(SUBJECTS.map(s => [s.dir, data[s.dir].stages]));
  const postsF = [];
  const fKeys = [];
  for (const b of loadNewBooks(ROOT)) {
    if (postsF.length >= F_MAX) break;
    const key = `${b.subject}:${b.id}`;
    if (newPosted.has(key)) continue;
    const sub = SUBJECTS.find(x => x.dir === b.subject);
    if (!sub) throw new Error(`new-books.json: ${b.id} の subject が科目名でない — ${b.subject}`);
    const p = postF(b, sub, stagesOf.get(sub.dir));
    if (!p) {
      // 書名が長すぎて、落とせる行を全部落としても収まらない場合。
      // 黙って飛ばすと投稿が 1 本消えるので必ず報せる
      console.error(`F 型が文字数に収まらない: ${key}（書名を短くするか手で書く）`);
      continue;
    }
    postsF.push(p);
    fKeys.push(key);
  }
  const planA = Math.max(0, PLAN.A - postsF.length);

  // A 型：ルート採用回数の多い順に、まだ出していない本から取る。
  // よく使われる本から先に出したほうが読者の関心に近い。
  const ranked = [];
  for (const s of SUBJECTS) {
    const d = data[s.dir];
    const t = tally(d.routes, d.tiers);
    for (const b of d.books) {
      if (A_EXCLUDE_STYLES.includes(b.style)) continue;
      // 評価が未了の新刊は難易度も向いている人も書けないので図鑑カードにできない。
      // 新刊は F 型が扱う
      if (isProvisional(b)) continue;
      ranked.push({ b, sub: s, n: t.main.get(b.id) || 0 });
    }
  }
  ranked.sort((a, b) => b.n - a.n);

  const postsA = [];
  const newlyUsed = [];
  for (const r of ranked) {
    if (postsA.length >= planA) break;
    const key = `${r.sub.dir}:${r.b.id}`;
    if (used.has(key)) continue;
    const p = postA(r.b, r.sub, r.n);
    if (!p) continue;                    // 文字数に収まらない本は飛ばす
    postsA.push(p);
    newlyUsed.push(key);
  }

  // E 型は作れる数より使う数が少ない。毎月同じ 4 本にならないよう、
  // 月で開始位置をずらして一巡させる（同じ月を再生成すれば同じ結果になる）
  const eAll = postsE(data);
  const eOffset = eAll.length ? (y * 12 + m) % eAll.length : 0;
  const postsEsel = Array.from({ length: Math.min(PLAN.E, eAll.length) },
    (_, k) => eAll[(eOffset + k) % eAll.length]);

  // 日付を割り当てる。B・C・D は Claude が埋める枠として空で出す。
  // **F 型は月初に置く。** 新刊は鮮度が価値なので、月末に回すと意味が薄れる
  const total = PLAN.A + PLAN.E + PLAN.B + PLAN.C + PLAN.D;
  const dates = schedule(y, m, total);

  const rows = [];
  let i = 0;
  for (const p of postsF) rows.push({ date: dates[i++], type: 'F', post: p });
  for (const p of postsA) rows.push({ date: dates[i++], type: 'A', post: p });
  for (const p of postsEsel) rows.push({ date: dates[i++], type: 'E', post: p });
  for (const [type, n] of [['B', PLAN.B], ['C', PLAN.C], ['D', PLAN.D]]) {
    for (let k = 0; k < n; k++) rows.push({ date: dates[i++], type, post: null });
  }
  rows.sort((a, b) => dates.indexOf(a.date) - dates.indexOf(b.date));

  const md = [];
  md.push(`# X 投稿案 ${y}-${mm}`);
  md.push('');
  md.push('`node build/gen-x-posts.mjs` が生成した。設計は [x-account-plan.md](../x-account-plan.md)。');
  md.push('');
  md.push('## 使い方');
  md.push('');
  md.push('1. X をブラウザで開く。**予約投稿はブラウザ版でしか使えない**（アプリからは設定できない）');
  md.push('2. 下のコードブロックをそのままコピーして投稿画面に貼る');
  md.push('3. カレンダーのアイコンから日時を指定して予約する');
  md.push('');
  md.push(`文字数は X の重み付け（全角 2・半角 1・URL は一律 ${URL_WEIGHT}）で数えてある。上限は ${X_LIMIT}。`);
  md.push('');
  md.push('**B・C・D 型は空欄で出る。** 判断が要るので Claude に書いてもらう。その際は');
  md.push('このファイル末尾の「候補データ」だけを渡せばよい（科目トップの HTML は読ませない）。');
  md.push('');
  md.push('**あわせて新刊の調査も頼む。** 手順は次の節にある。**調査を先にやること。**');
  md.push('新刊が見つかると F 型の枠が増え、その分 A 型が減るため、後からだと作り直しになる。');
  md.push('');
  md.push(survey(data, JSON.parse(fs.readFileSync(PUBLISHERS_FILE, 'utf8'))));
  md.push('');
  md.push('## カレンダー');
  md.push('');
  md.push('| 日付 | 時刻 | 型 | 内容 |');
  md.push('|---|---|---|---|');
  for (const r of rows) {
    md.push(`| ${r.date} | ${SLOTS[r.type]} | ${r.type} | ${r.post ? r.post.note : '**要執筆（Claude）**'} |`);
  }
  md.push('');

  const section = (title, type) => {
    md.push(title);
    md.push('');
    for (const r of rows.filter(x => x.type === type)) {
      md.push(`### ${r.date} ${SLOTS[type]} — ${r.post ? r.post.note : `${type} 型`}`);
      md.push('');
      md.push('```');
      md.push(r.post ? r.post.text : '（未執筆）');
      md.push('```');
      md.push('');
      if (r.post) md.push(`文字数 ${weightedLen(r.post.text)} / ${X_LIMIT}`);
      if (r.post) md.push('');
    }
  };

  if (postsF.length) section('## F 型（新刊速報）', 'F');
  section('## A 型（図鑑カード）', 'A');
  section('## E 型（エンタメ）', 'E');
  md.push('## B・C・D 型（Claude が書く枠）');
  md.push('');
  for (const r of rows.filter(x => ['B', 'C', 'D'].includes(x.type))) {
    md.push(`### ${r.date} ${SLOTS[r.type]} — ${r.type} 型`);
    md.push('');
    md.push('```');
    md.push('（未執筆）');
    md.push('```');
    md.push('');
  }

  md.push('---');
  md.push('');
  md.push('## 候補データ（B・C・D 型を書くときに Claude へ渡す）');
  md.push('');
  md.push(candidates(data));
  md.push('');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, md.join('\n'), 'utf8');

  for (const k of newlyUsed) used.add(k);
  for (const k of fKeys) newPosted.add(k);
  fs.writeFileSync(USED_FILE, `${JSON.stringify({
    note: 'A 型で既に投稿案を作った本。翌月以降に重複して出さないための記録',
    note2: 'newPosted は F 型（新刊速報）で出した新刊。byMonth はどの月に出したかで、'
      + '同じ月を --force で作り直したときに内容が入れ替わるのを防ぐために持つ',
    used: [...used].sort(),
    newPosted: [...newPosted].sort(),
    byMonth: { ...rec.byMonth, [month]: [...newlyUsed, ...fKeys].sort() },
  }, null, 2)}\n`, 'utf8');

  const totalBooks = SUBJECTS.reduce((n, s) => n + data[s.dir].books.length, 0);
  console.log(`${path.relative(ROOT, outFile)} を生成（F ${postsF.length} 本 / A ${postsA.length} 本 / E ${postsEsel.length} 本 / 要執筆 ${PLAN.B + PLAN.C + PLAN.D} 本）`);
  console.log(`A 型の既出: ${used.size} 冊 / ${totalBooks} 冊`);
}

// 直接実行されたときだけ生成する。文字数の判定（weightedLen）を
// 手書きの投稿の検算にも使えるよう、import しただけでは走らせない
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
