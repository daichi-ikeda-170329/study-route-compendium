/**
 * 書影の出所台帳と、画面側へ渡す取得元の設定を作る。
 *
 *   node build/generate-cover-ledger.mjs
 *   node build/generate-cover-ledger.mjs --check
 *
 * 出力は 2 つ。
 *
 *   build/data/cover-ledger.json … 1 冊ごとに「どこの画像を、どの鍵で参照しているか」
 *                                   （公開しない。`data/` と `build/` は dist へ出ない）
 *   assets/js/cover-policies.js  … 画面側が読む取得元の設定（公開する）
 *
 * ## 台帳に入れないもの
 *
 * **認証情報や query token を保存しない。** ここに残すのは、どの provider の
 * どの鍵（ISBN10 / ISBN13）を使っているかと、最後に到達を確かめた結果だけ。
 *
 * ## 到達確認は別
 *
 * 実際に HTTP で取りに行くのは `build/check-covers.mjs --live`。
 * こちらは外部へ 1 回も出ない（生成は毎回のビルドで走るため）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { coverSrcs, providerOf, COVER_POLICIES } from './lib/cover.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const LEDGER = path.join(ROOT, 'build', 'data', 'cover-ledger.json');
const POLICY_JS = path.join(ROOT, 'assets', 'js', 'cover-policies.js');

/** 画面側は enabled と hostPatterns しか要らない。確認状況は公開しない */
function runtimePolicies() {
  const out = { schemaVersion: 1, providers: {} };
  for (const [id, p] of Object.entries(COVER_POLICIES.providers)) {
    out.providers[id] = { enabled: Boolean(p.enabled), hostPatterns: p.hostPatterns || [] };
  }
  return out;
}

function buildLedger() {
  const prev = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { records: {} };
  const records = {};

  for (const s of SUBJECTS) {
    const d = loadSubjectData(ROOT, s.dir);
    for (const b of d.books) {
      const key = `${s.dir}:${b.id}`;
      const srcs = coverSrcs(b);
      const before = prev.records ? prev.records[key] : null;

      records[key] = {
        // どの provider を、どの順で試すか
        providers: srcs.map(u => providerOf(u)),
        // 出所の識別子。**URL そのものは持たない**（query が付いた形を残さないため）
        keys: {
          isbn10: b.isbn10 || null,
          isbn13: b.isbn13 || null,
          asin: b.asin || null,
        },
        // BOOKS[].cover（実在の本）／BOOKS[].coverExample（枠の見本）で個別に
        // 指定しているか。指定先のホストだけを持つ
        explicitHost: b.cover ? hostOf(b.cover) : (b.coverExample ? hostOf(b.coverExample) : null),
        // どこにも画像が無いと確認した本
        nocover: Boolean(b.nocover),
        // 到達確認の結果。build/check-covers.mjs --live が書く。**推測で埋めない**
        availability: (before && before.availability) || { status: 'unchecked', httpStatus: null, checkedAt: null },
      };
    }
  }

  return {
    note: '書影の出所台帳。build/generate-cover-ledger.mjs が書く。手で編集しない。'
      + ' availability は build/check-covers.mjs --live が更新する。',
    note2: '認証情報や query token は保存しない。持つのは provider と鍵（ISBN）と到達結果だけ。',
    schemaVersion: 1,
    records,
  };
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return null; }
}

const ledger = buildLedger();
const ledgerText = `${JSON.stringify(ledger, null, 1)}\n`;
const policyText = '/* 自動生成 — build/generate-cover-ledger.mjs が出力する。手で編集しない。\n'
  + '   取得元を変えるときは build/data/cover-provider-policies.json を直す。 */\n'
  + `window.RT_COVER_POLICIES=${JSON.stringify(runtimePolicies())};\n`;

if (CHECK) {
  const stale = [];
  if (!fs.existsSync(LEDGER) || fs.readFileSync(LEDGER, 'utf8') !== ledgerText) stale.push('build/data/cover-ledger.json');
  if (!fs.existsSync(POLICY_JS) || fs.readFileSync(POLICY_JS, 'utf8') !== policyText) stale.push('assets/js/cover-policies.js');
  if (stale.length) {
    console.error(`書影の台帳が古い。node build/generate-cover-ledger.mjs を流す: ${stale.join(' / ')}`);
    process.exit(1);
  }
  console.log('書影の台帳は最新');
} else {
  fs.writeFileSync(LEDGER, ledgerText);
  fs.writeFileSync(POLICY_JS, policyText);
  const n = Object.keys(ledger.records).length;
  const noCover = Object.values(ledger.records).filter(r => !r.providers.length).length;
  const enabled = Object.entries(COVER_POLICIES.providers).filter(([, p]) => p.enabled).map(([id]) => id);
  const unreviewed = Object.entries(COVER_POLICIES.providers).filter(([, p]) => !p.termsReviewed).map(([id]) => id);
  console.log(`  ✓ build/data/cover-ledger.json  (${n}冊 / 候補が 1 つも無い本 ${noCover}冊)`);
  console.log(`  ✓ assets/js/cover-policies.js   (参照中 ${enabled.join(', ') || 'なし'})`);
  if (unreviewed.length) {
    console.log(`    利用条件が未確認の取得元: ${unreviewed.join(', ')}（docs/cover-policy.md の OWNER ACTION）`);
  }
}
