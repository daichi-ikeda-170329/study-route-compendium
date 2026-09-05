/**
 * 書影の出所と到達を確かめる。
 *
 *   node build/check-covers.mjs           取得元の整合だけを見る（外部へ出ない）
 *   node build/check-covers.mjs --live    実際に HTTP で取りに行く
 *   node build/check-covers.mjs --live --limit=50   先頭 50 冊だけ
 *   node build/check-covers.mjs --json    機械可読な結果を出す
 *
 * ## 2 つを分ける理由
 *
 * **整合の検査（offline）は必須ゲートにする。** 外部へ 1 回も出ないので、
 * 何度流しても同じ答えになる。ここで見るのは
 *
 *   - 公開 HTML に出ている書影の URL が、すべて既知の取得元に対応づいているか
 *   - `enabled: false` の取得元の URL が公開 HTML に出ていないか
 *   - 台帳（cover-ledger.json）が実データと食い違っていないか
 *
 * **到達の検査（--live）は必須ゲートにしない。** 相手のサイトの調子で結果が変わる。
 * 外部障害で全 CI が赤くなると、本当の欠損に気づけなくなる（build/check-links.mjs と同じ考え方）。
 * 週次の workflow か手動で流し、恒久 404 と一時障害を分けて記録する。
 *
 * ## 相手に負荷をかけない
 *
 * timeout・低い同時実行数・再試行の上限・識別できる User-Agent を付ける。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { coverSrcs, providerOf, COVER_POLICIES } from './lib/cover.mjs';
import { listDist } from './build-public.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const LIVE = ARGS.includes('--live');
const JSON_OUT = ARGS.includes('--json');
const LIMIT = Number((ARGS.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);

const LEDGER_PATH = path.join(ROOT, 'build', 'data', 'cover-ledger.json');

/* 相手サイトへの当たり方。build/check-links.mjs と同じ水準にそろえる */
const LANES = 4;
const TIMEOUT = 12000;
const RETRY = 1;
const UA = 'route-taizen-covercheck/1.0 (+https://route-taizen.com/)';

const problems = [];
const warn = [];
const bad = (m) => problems.push(m);

/* ============================================================
   整合の検査（外部へ出ない）
   ============================================================ */

function offlineChecks() {
  const policies = COVER_POLICIES.providers;

  // 1. 取得元の設定そのもの
  for (const [id, p] of Object.entries(policies)) {
    if (typeof p.enabled !== 'boolean') bad(`policy ${id}: enabled が真偽値でない`);
    if (typeof p.termsReviewed !== 'boolean') bad(`policy ${id}: termsReviewed が真偽値でない`);
    if (p.termsReviewed && !p.usageBasis) {
      bad(`policy ${id}: termsReviewed が true なのに usageBasis が空。`
        + ' **規約を読んだのなら、その根拠を書く。** 読んでいないなら termsReviewed を false に戻す');
    }
    if (p.termsReviewed && !p.lastReviewedAt) bad(`policy ${id}: termsReviewed が true なのに lastReviewedAt が空`);
    /* **停止中の取得元は「未確認」に数えない。** enabled:false の provider は候補に入らないので、
       規約を読んでも読まなくても公開物は変わらない。ここに混ぜると、運営者の完了判定
       （未確認 0 件）が永久に達成できなくなり、確認すべき取得元が埋もれる。
       停止していることは別行で必ず出す（黙って消さない）。 */
    if (!p.enabled) {
      warn.push(`${id}（${p.displayName}）: **停止中**（enabled:false）。候補に入らない`);
    } else if (!p.termsReviewed) {
      warn.push(`${id}（${p.displayName}）: 利用条件が未確認。docs/cover-policy.md の OWNER ACTION`);
    }
  }

  // 2. 台帳が実データと合っているか
  if (!fs.existsSync(LEDGER_PATH)) {
    bad('build/data/cover-ledger.json が無い。node build/generate-cover-ledger.mjs を流す');
    return;
  }
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  let books = 0;
  for (const s of SUBJECTS) {
    for (const b of loadSubjectData(ROOT, s.dir).books) {
      books++;
      const key = `${s.dir}:${b.id}`;
      const rec = ledger.records[key];
      if (!rec) { bad(`台帳に ${key} が無い`); continue; }
      const want = coverSrcs(b).map(u => providerOf(u));
      if (JSON.stringify(rec.providers) !== JSON.stringify(want)) {
        bad(`${key}: 台帳の取得元が実データと食い違う。node build/generate-cover-ledger.mjs を流す`);
      }
      // **認証情報や token を持ち込んでいないか**
      const text = JSON.stringify(rec);
      if (/token|secret|password|api[-_]?key/i.test(text)) bad(`${key}: 台帳に認証情報らしい語がある`);
    }
  }
  const extra = Object.keys(ledger.records).filter(k => !k.includes(':') || false).length;
  if (Object.keys(ledger.records).length !== books) {
    bad(`台帳の件数が実データと合わない（台帳 ${Object.keys(ledger.records).length} / 実データ ${books}）`);
  }
  if (extra) bad(`台帳に形の違うキーが ${extra} 件ある`);

  // 3. 公開 HTML に、無効な取得元・未知の取得元の URL が出ていないか
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) {
    warn.push('dist/ が無いので公開 HTML の検査を飛ばした（npm run build を先に流す）');
    return;
  }
  const disabled = Object.entries(policies).filter(([, p]) => !p.enabled).map(([id]) => id);
  const knownHosts = new Set();
  for (const p of Object.values(policies)) for (const h of p.hostPatterns || []) knownHosts.add(h);

  const seenHosts = new Map();
  const files = listDist().filter(f => f.endsWith('.html'));
  for (const rel of files) {
    const src = fs.readFileSync(path.join(dist, rel), 'utf8');
    for (const m of src.matchAll(/data-srcs="([^"]*)"/g)) {
      for (const url of m[1].split('|')) {
        const u = url.replace(/&amp;/g, '&');
        if (!u) continue;
        let host;
        try { host = new URL(u).host; } catch { bad(`${rel}: 書影の URL を解釈できない — ${u.slice(0, 80)}`); continue; }
        seenHosts.set(host, (seenHosts.get(host) || 0) + 1);
      }
    }
    for (const m of src.matchAll(/<img[^>]*\bsrc="(https?:[^"]*)"/g)) {
      let host;
      try { host = new URL(m[1]).host; } catch { continue; }
      if (knownHosts.has(host)) seenHosts.set(host, (seenHosts.get(host) || 0) + 1);
    }
  }

  for (const id of disabled) {
    for (const h of policies[id].hostPatterns || []) {
      if (seenHosts.has(h)) {
        bad(`取得元 ${id} は enabled:false なのに、公開 HTML に ${h} の URL が ${seenHosts.get(h)} 件ある`);
      }
    }
  }

  /* 個別指定（BOOKS[].cover）のホストは policy にまとめられない。
     **未知のホストが増えたことに気づけるよう、一覧を出す。** */
  const explicitHosts = [...seenHosts.keys()].filter(h => !knownHosts.has(h)).sort();
  if (explicitHosts.length) {
    warn.push(`個別指定（BOOKS[].cover）のホスト ${explicitHosts.length} 件: ${explicitHosts.join(', ')}`);
  }
}

/* ============================================================
   到達の検査（--live のときだけ）
   ============================================================ */

function classify(status) {
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 200 && status < 300) return 'ok';
  return 'transient_error';
}

async function probe(url) {
  for (let attempt = 0; attempt <= RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET', redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { 'user-agent': UA },
      });
      // Amazon は画像を持たない ISBN に 1x1 を 200 で返す。長さで見分ける
      const len = Number(res.headers.get('content-length') || 0);
      if (res.ok && len > 0 && len < 100) return { status: res.status, kind: 'not_found', note: '1x1 相当' };
      return { status: res.status, kind: classify(res.status) };
    } catch (e) {
      if (attempt === RETRY) return { status: null, kind: 'transient_error', note: e.name || 'error' };
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));   // バックオフ
    }
  }
  return { status: null, kind: 'transient_error' };
}

async function liveChecks() {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const targets = [];
  for (const s of SUBJECTS) {
    for (const b of loadSubjectData(ROOT, s.dir).books) {
      const srcs = coverSrcs(b);
      if (!srcs.length) continue;
      targets.push({ key: `${s.dir}:${b.id}`, url: srcs[0] });   // 先頭の候補だけを見る
    }
  }
  const list = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`到達を確かめる: ${list.length} 冊（先頭の候補だけ / 同時 ${LANES} 本）`);

  const counts = { ok: 0, not_found: 0, transient_error: 0 };
  let i = 0;
  const now = new Date().toISOString().slice(0, 10);
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (i < list.length) {
      const t = list[i++];
      const r = await probe(t.url);
      counts[r.kind]++;
      const rec = ledger.records[t.key];
      if (rec) rec.availability = { status: r.kind, httpStatus: r.status, checkedAt: now };
    }
  }));

  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 1)}\n`);
  console.log(`到達 ${counts.ok} / 見つからない ${counts.not_found} / 一時的な失敗 ${counts.transient_error}`);
  console.log('台帳の availability を更新した。**恒久的に見つからない本はデータを直す対象**、'
    + '一時的な失敗は次回の再確認に回す。');
  return counts;
}

/* ============================================================
   実行
   ============================================================ */

offlineChecks();

if (JSON_OUT) {
  console.log(JSON.stringify({ problems, warn }, null, 2));
} else {
  for (const w of warn) console.log(`  − ${w}`);
  for (const p of problems.slice(0, 30)) console.error(`  ✗ ${p}`);
}

if (problems.length) {
  console.error(`\n書影の取得元の整合で ${problems.length} 件見つかった`);
  process.exit(1);
}
/* 運営者の完了判定はこの数を見る。**停止中の取得元を混ぜない。**
   混ぜると「未確認 0 件」に到達できず、判定が意味を失う */
const unreviewed = Object.values(COVER_POLICIES.providers)
  .filter(p => p.enabled && !p.termsReviewed).length;
console.log(`書影の取得元は整合している（利用条件が未確認の取得元 ${unreviewed} 件。詳細は上）`);

if (LIVE) {
  const counts = await liveChecks();
  /* **到達の失敗では落とさない。** 外部の調子で CI が赤くなると、
     本当の欠損に気づけなくなる。結果は台帳とログに残す */
  if (counts.not_found) {
    console.log(`\n見つからない書影が ${counts.not_found} 件ある。`
      + ' BOOKS[].cover に出版社の商品画像を入れるか、どこにも無いと確認できたら BOOKS[].nocover を立てる。');
  }
}
