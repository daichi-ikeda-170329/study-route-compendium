#!/usr/bin/env node
// Search Console API から監視キーワードの平均掲載順位・表示回数・クリック数を取る。
//
// 終了コード（build/import-kpi.mjs の流儀に合わせる）
//   0 取得できた
//   1 取得を試みたが失敗した（認証エラー・API エラー・キーワード 0 件）
//   2 未実施。認証情報が無い（= まだセットアップされていない）
//
// 2 を「順位が取れなかった」と読まない。「そもそも測っていない」の意味。
//
// 使い方
//   node fetch_gsc_ranks.mjs --repo <REPO_PATH> --append      # 28 日窓を rank-history へ追記
//   node fetch_gsc_ranks.mjs --repo <REPO_PATH> --days 7      # 7 日窓を表示のみ
//
// 認証情報の置き場所（どちらか）
//   環境変数 GSC_SERVICE_ACCOUNT_JSON にサービスアカウント JSON のパス
//   <REPO_PATH>/private/gsc-service-account.json
// private/ は .gitignore 済み。鍵の中身はこのスクリプトから一切出力しない。
//
// プライバシー: watchwords.json に登録済みのキーワードだけを rank-history.json に
// 書く。未登録クエリは標準出力に出すだけで、ファイルには残さない。
// 生の検索クエリをリポジトリに入れない方針（docs/kpi-import-guide.md「2. 取り込んではいけないもの」）を守るため。

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { join, resolve } from 'node:path';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function parseArgs(argv) {
  const out = { repo: process.cwd(), append: false, days: 28 };
  for (const a of argv.slice(2)) {
    if (a === '--append') out.append = true;
    else if (a.startsWith('--repo=')) out.repo = a.slice('--repo='.length);
    else if (a.startsWith('--days=')) out.days = Number(a.slice('--days='.length));
    else if (a === '--repo' || a === '--days') out._pending = a;
    else if (out._pending === '--repo') { out.repo = a; out._pending = null; }
    else if (out._pending === '--days') { out.days = Number(a); out._pending = null; }
  }
  if (!Number.isInteger(out.days) || out.days < 1) {
    console.error('--days には 1 以上の整数を渡す');
    process.exit(1);
  }
  out.repo = resolve(out.repo);
  return out;
}

function findCredentials(repo) {
  const fromEnv = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const inRepo = join(repo, 'private', 'gsc-service-account.json');
  if (existsSync(inRepo)) return inRepo;
  return null;
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(credPath) {
  const cred = JSON.parse(readFileSync(credPath, 'utf-8'));
  if (!cred.client_email || !cred.private_key) {
    throw new Error('サービスアカウント JSON に client_email / private_key が無い');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: cred.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = base64url(signer.sign(cred.private_key));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    // 本文に鍵は含まれないが、念のため先頭 200 字だけ出す
    throw new Error(`トークン取得に失敗 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error('トークン応答に access_token が無い');
  return body.access_token;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// GSC は当日・前日ぶんがまだ揃わない。3 日前を終端にする。
function windowFor(days) {
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: ymd(start), end: ymd(end) };
}

async function queryRows(token, site, start, end) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      startDate: start,
      endDate: end,
      dimensions: ['query'],
      rowLimit: 5000,
      dataState: 'final',
    }),
  });
  if (!res.ok) {
    throw new Error(`searchAnalytics に失敗 (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()).rows ?? [];
}

// 全角・半角・空白・大小文字の揺れを吸収して突き合わせる
function normalize(s) {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

async function main() {
  const args = parseArgs(process.argv);
  const watchPath = join(args.repo, 'data', 'seo', 'watchwords.json');
  if (!existsSync(watchPath)) {
    console.error(`監視キーワードが無い: ${watchPath}`);
    process.exit(2);
  }
  const watch = JSON.parse(readFileSync(watchPath, 'utf-8'));
  const site = watch.gscProperty;
  if (!site) {
    console.error('watchwords.json に gscProperty が無い（例: "sc-domain:route-taizen.com"）');
    process.exit(2);
  }

  const credPath = findCredentials(args.repo);
  if (!credPath) {
    console.error('未実施: Search Console の認証情報が無い。');
    console.error('  GSC_SERVICE_ACCOUNT_JSON にパスを渡すか、private/gsc-service-account.json に置く。');
    console.error('  設定手順は .claude/skills/seo-rank-watch/SKILL.md の「GSC を有効にする」を参照。');
    process.exit(2);
  }

  const { start, end } = windowFor(args.days);
  let rows;
  try {
    const token = await getAccessToken(credPath);
    rows = await queryRows(token, site, start, end);
  } catch (err) {
    console.error(`取得に失敗: ${err.message}`);
    process.exit(1);
  }

  const byQuery = new Map(rows.map((r) => [normalize(r.keys[0]), r]));
  const measurements = [];
  for (const kw of watch.keywords) {
    const row = byQuery.get(normalize(kw.keyword));
    measurements.push({
      keyword: kw.keyword,
      rank: row ? Number(row.position.toFixed(1)) : null,
      impressions: row ? row.impressions : 0,
      clicks: row ? row.clicks : 0,
    });
  }

  const registered = new Set(watch.keywords.map((k) => normalize(k.keyword)));
  const unregistered = rows
    .filter((r) => !registered.has(normalize(r.keys[0])) && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  console.log(`期間: ${start} 〜 ${end} (${args.days} 日) / プロパティ: ${site}`);
  console.log('');
  console.log('登録済みキーワード');
  for (const m of measurements) {
    console.log(`  ${m.rank === null ? '  --' : String(m.rank).padStart(4)}位  imp ${String(m.impressions).padStart(5)}  clicks ${String(m.clicks).padStart(4)}  ${m.keyword}`);
  }
  if (unregistered.length > 0) {
    console.log('');
    console.log('未登録クエリ（表示のみ。ファイルには書かない）');
    for (const r of unregistered) {
      console.log(`  ${r.position.toFixed(1).padStart(5)}位  imp ${String(r.impressions).padStart(5)}  ${r.keys[0]}`);
    }
  }

  if (args.append) {
    const historyPath = join(args.repo, 'data', 'seo', 'rank-history.json');
    const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    history.entries.push({
      date: ymd(new Date()),
      source: 'gsc',
      window: { start, end, days: args.days },
      measurements,
    });
    writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf-8');
    console.log('');
    console.log(`rank-history.json に ${measurements.length} 件を追記した。`);
  }

  const measured = measurements.filter((m) => m.rank !== null).length;
  process.exit(measured > 0 ? 0 : 1);
}

main();
