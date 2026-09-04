/**
 * 外部のリソースが生きているかを確かめる。**外部へ大量に問い合わせるので、
 * push のたびではなく週 1 回だけ流す**（.github/workflows/links.yml）。
 *
 *   node build/check-links.mjs             全部見る
 *   node build/check-links.mjs --covers    書影だけ
 *   node build/check-links.mjs --stores    Amazon / 楽天の商品ページだけ
 *   node build/check-links.mjs --limit=50  先頭 50 冊だけ（手元での確認用）
 *   node build/check-links.mjs --json      機械可読な結果を標準出力へ出す
 *   node build/check-links.mjs --internal  内部リンクだけを見る（外部へ出ない・落ちる）
 *
 * 見つかった不備は一覧で出す。**外部リンクでは終了コードを 0 のままにする。**
 * 外部サービスの一時的な不調で毎週ジョブが赤くなると、本当の欠損に気づけなくなる。
 * 結果は GitHub Actions のログとサマリで読む。
 *
 * **内部リンク切れは別扱い。**こちらは自分たちの不備なので `--internal` で
 * 検査し、見つかれば終了コード 1 で落とす（生成の取りこぼしを見逃さないため）。
 *
 * 不備は 3 つに分ける。混ぜると「毎週同じ赤」になって読まれなくなる。
 *   persistent … 404 が続いている。データを直す対象
 *   transient  … 429 / 5xx / タイムアウト。相手側の一時的な不調
 *   mismatch   … 応答はあるが別の商品を指している可能性
 *
 * 書影が全候補とも駄目な本は、BOOKS[].nocover を立てるか、出版社の商品画像を
 * BOOKS[].cover に入れる（README の「書影」の節）。
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { coverSrcs } from './lib/cover.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const only = { covers: ARGS.includes('--covers'), stores: ARGS.includes('--stores') };
const all = !only.covers && !only.stores;
const LIMIT = Number((ARGS.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const JSON_OUT = ARGS.includes('--json');
const INTERNAL = ARGS.includes('--internal');

/** 不備の分類。持続的なものだけがデータを直す対象になる */
const KIND = { persistent: 'persistent', transient: 'transient', mismatch: 'mismatch' };

/** HTTP の状態から分類する */
function classify(status) {
  if (status === '404' || status === '410') return KIND.persistent;
  return KIND.transient;
}

const LANES = 6;
const TIMEOUT = 12000;

/** HEAD を投げて状態を見る。HEAD を受けないサーバーには GET で聞き直す */
async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method, redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { 'user-agent': 'route-taizen-linkcheck/1.0 (+https://route-taizen.com/)' },
      });
      if (res.status === 405 || res.status === 501) continue;   // HEAD 非対応
      // Amazon は画像を持たない ISBN に 43 バイトほどの 1x1 画像を 200 で返す。
      // 表示側と同じく「小さすぎる画像は無い」とみなす
      const len = Number(res.headers.get('content-length') || 0);
      if (res.ok && len && len < 200) return { ok: false, status: `${res.status}（${len}B の空画像）` };
      return { ok: res.ok, status: String(res.status) };
    } catch (e) {
      if (method === 'GET') return { ok: false, status: e.name === 'TimeoutError' ? 'タイムアウト' : e.message };
    }
  }
  return { ok: false, status: '不明' };
}

/** 並行して走らせる。外部サービスに負荷をかけないよう本数を絞る */
async function run(items, fn) {
  let done = 0;
  const worker = async queue => {
    for (const it of queue) {
      await fn(it);
      if (++done % 50 === 0) process.stdout.write(`\r  ${done} / ${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: LANES }, (_, i) =>
    worker(items.filter((_, k) => k % LANES === i))));
  process.stdout.write('\r');
}

const books = [];
for (const s of SUBJECTS) {
  for (const b of extractSubject(ROOT, s.dir).books) books.push({ dir: s.dir, b });
}
const targets = LIMIT ? books.slice(0, LIMIT) : books;
console.log(`${targets.length} 冊を確認する`);

/** {kind, target, url, status, message} の並び */
const problems = [];
const note = (kind, target, message, extra = {}) => problems.push({ kind, target, message, ...extra });

if (all || only.covers) {
  console.log('書影:');
  const withCover = targets.filter(t => coverSrcs(t.b).length);
  const nocover = targets.filter(t => !coverSrcs(t.b).length);
  await run(withCover, async t => {
    // 候補は順に試される。1 本でも生きていれば表示できる
    for (const url of coverSrcs(t.b)) {
      const r = await probe(url);
      if (r.ok) return;
    }
    note(KIND.persistent, `${t.dir}/${t.b.id}`, `書影が 1 本も取れない（${t.b.name}）`);
  });
  console.log(`  候補あり ${withCover.length} 冊 / nocover 指定 ${nocover.length} 冊 / 取れない ${problems.length} 冊`);
}

if (all || only.stores) {
  console.log('Amazon の商品ページ:');
  const withKey = targets.filter(t => t.b.isbn10 || t.b.asin);
  const before = problems.length;
  await run(withKey, async t => {
    const key = t.b.isbn10 || t.b.asin;
    const r = await probe(`https://www.amazon.co.jp/dp/${key}`);
    // Amazon は自動アクセスに 503 を返すことがある。404 だけを欠損として扱う
    if (r.status === '404') note(KIND.persistent, `${t.dir}/${t.b.id}`, `Amazon に商品ページが無い（${key}）`, { status: r.status });
    else if (!r.ok) note(KIND.transient, `${t.dir}/${t.b.id}`, `応答が返らない（${r.status}）`, { status: r.status });
  });
  console.log(`  ${withKey.length} 冊を確認 / 見つからない ${problems.length - before} 冊`);
}

const byKind = {
  persistent: problems.filter(p => p.kind === KIND.persistent),
  transient: problems.filter(p => p.kind === KIND.transient),
  mismatch: problems.filter(p => p.kind === KIND.mismatch),
};

if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify({
    checkedAt: new Date().toISOString().slice(0, 10),
    checked: targets.length,
    counts: { persistent: byKind.persistent.length, transient: byKind.transient.length, mismatch: byKind.mismatch.length },
    problems,
  }, null, 1)}\n`);
} else {
  console.log('');
  if (!problems.length) {
    console.log('外部リソースの欠損は見つからなかった');
  } else {
    console.log(`持続的な欠損 ${byKind.persistent.length} 件 / 一時的な不調 ${byKind.transient.length} 件 / 商品の不一致 ${byKind.mismatch.length} 件`);
    for (const p of byKind.persistent) console.log(`  - [持続] ${p.target}: ${p.message}`);
    for (const p of byKind.transient.slice(0, 20)) console.log(`  - [一時] ${p.target}: ${p.message}`);
    if (byKind.transient.length > 20) console.log(`  … ほか一時的なもの ${byKind.transient.length - 20} 件`);
    console.log('\n書影が取れない本は、出版社の商品画像を BOOKS[].cover に入れるか、');
    console.log('どこにも画像が無いと確認できたら BOOKS[].nocover を立てる（README の「書影」の節）。');
    console.log('一時的な不調（429 / 5xx / タイムアウト）はデータの不備ではない。翌週の結果と見比べる。');
  }
}

/* 外部リンクでは落とさない（相手側の不調で毎週赤くなると読まれなくなる）。
   内部リンクだけは自分たちの不備なので落とす */
if (INTERNAL && byKind.persistent.length) process.exit(1);
