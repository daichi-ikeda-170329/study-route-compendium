/**
 * 公開サイトが、いまの main と同じものを配信しているかを読み取り専用で確かめる。
 *
 *   node build/check-production.mjs                     https://route-taizen.com/ を見る
 *   node build/check-production.mjs --url=http://…      別の配信元を見る（切り戻しの確認など）
 *   node build/check-production.mjs --json              機械可読な結果を出す
 *   node build/check-production.mjs --timeout=20000     1 リクエストの上限（ミリ秒）
 *
 * **CI の必須ゲートにしない。** ネットワークと CDN のキャッシュに左右されるので、
 * push のたびに赤くすると本当の不具合に気づけなくなる。workflow_dispatch と
 * scheduled でだけ流す（.github/workflows/production.yml）。
 *
 * 終了コード
 *   0 … 全項目が通った
 *   1 … 公開状態がリポジトリと食い違う（直す対象）
 *   2 … 検査していない（ネットワークが無い / 相手に届かない）。**成功と偽らない**
 *
 * 「届かなかった」を 1 ではなく 2 にするのは、配信の不具合と、こちらの実行環境に
 * ネットワークが無いことを混同しないため。2 を見たら「まだ確かめていない」と読む。
 *
 * ## キャッシュを掴まないための工夫
 *
 * GitHub Pages はレスポンスヘッダーを制御できず、CDN が短時間だけ古い HTML を返すことがある。
 * 反映待ちを「コードの不具合」と読み違えないよう、検査 URL に毎回違う query
 * （`?_pc=<timestamp>`）を付けて取得し、`cache-control` と `age` も一緒に記録する。
 * **query 付き URL は canonical や sitemap には出さない。この検査の中だけで使う。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = ARGS.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = (arg('url', 'https://route-taizen.com')).replace(/\/+$/, '');
const JSON_OUT = ARGS.includes('--json');
const TIMEOUT = Number(arg('timeout', 15000));
const UA = 'route-taizen-production-check/1.0 (+https://route-taizen.com/)';

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/site-meta.json'), 'utf8'));
const counts = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/count-state.json'), 'utf8'));

/** 総冊数の表記ゆれ（1390 と 1,390）をどちらも受ける */
function countVariants(n) {
  return [String(n), Number(n).toLocaleString('en-US')];
}

const results = [];
let unreachable = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

/**
 * 取得する。キャッシュを避けるため query を足し、リダイレクトは追う。
 * ネットワーク側の失敗は null を返す（= 検査できなかった）。
 */
async function get(pathname, { bust = true } = {}) {
  const url = `${BASE}${pathname}${bust ? (pathname.includes('?') ? '&' : '?') + '_pc=' + Date.now() : ''}`;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'user-agent': UA, 'cache-control': 'no-cache' },
    });
    const body = res.headers.get('content-type')?.includes('image/') ? '' : await res.text();
    return {
      url, status: res.status, body,
      cacheControl: res.headers.get('cache-control'),
      age: res.headers.get('age'),
      contentType: res.headers.get('content-type'),
    };
  } catch (e) {
    unreachable++;
    return null;
  }
}

/** 200 を期待する */
async function expectOk(pathname, label = pathname) {
  const r = await get(pathname);
  if (!r) { record(`${label} が届く`, null, 'ネットワークで届かなかった'); return null; }
  record(`${label} が 200`, r.status === 200, `HTTP ${r.status}`);
  return r;
}

/**
 * 404 を期待する。**`dist/` 配信に切り替わっている証拠**になる。
 * リポジトリ直下を配信していると、これらが 200 で取れてしまう。
 */
async function expectNotFound(pathname) {
  const r = await get(pathname);
  if (!r) { record(`${pathname} が 404`, null, 'ネットワークで届かなかった'); return; }
  // GitHub Pages の 404 ページは 404 を返す。200 なら中身が公開されている
  record(`${pathname} が 404（dist/ 配信の証拠）`, r.status === 404,
    `HTTP ${r.status}${r.status === 200 ? ' — リポジトリ直下が配信されている' : ''}`);
}

async function main() {
  console.log(`公開サイトを検査する: ${BASE}`);
  console.log('（読み取りだけ。書き込みも送信もしない）\n');

  // 1. 主要ページが届く
  const top = await expectOk('/', 'トップ');
  const science = await expectOk('/science/', '/science/');

  // 2. 年度ラベルと総冊数がリポジトリの正本と一致する
  if (top) {
    const hasYear = top.body.includes(meta.admissionLabel) || top.body.includes(meta.admissionLabelShort);
    record('トップの年度ラベルが site-meta.json と一致',
      hasYear, hasYear ? meta.admissionLabel : `"${meta.admissionLabel}" も "${meta.admissionLabelShort}" も無い`);

    const variants = countVariants(counts.total);
    const hasCount = variants.some(v => top.body.includes(`${v}${meta.countUnitLabel}`));
    record('トップの総冊数が count-state.json と一致',
      hasCount, hasCount ? `${variants[1]}${meta.countUnitLabel}` : `${variants.join(' / ')} が見つからない`);

    // 3. 古い年度表記が残っていない
    const stale = /2026年度入試対応|2026 ?入試対応/.test(top.body);
    record('トップに 2026年度入試対応 が残っていない', !stale, stale ? '古い表記が残っている' : '無し');

    // 4. 古い冊数が残っていない
    const staleCount = /1,?052/.test(top.body);
    record('トップに古い冊数 1,052 が残っていない', !staleCount, staleCount ? '残っている' : '無し');
  }

  if (science) {
    const variants = countVariants(counts.subjects.science);
    const hasCount = variants.some(v => science.body.includes(`${v}${meta.countUnitLabel}`));
    record('/science/ の冊数が count-state.json と一致',
      hasCount, hasCount ? `${variants[0]}${meta.countUnitLabel}` : `${variants.join(' / ')} が見つからない`);
  }

  // 5. dist/ 配信に切り替わっている証拠。リポジトリ直下配信なら 200 で取れてしまう
  for (const p of ['/package.json', '/build/all.mjs', '/test/dist.test.mjs',
                   '/playwright.config.mjs', '/README.md', '/data/_backup/README.md']) {
    await expectNotFound(p);
  }

  // 6. 代表的な配信アセットが生きている
  for (const p of ['/assets/site.css', '/assets/js/book-index.js', '/assets/js/search.js',
                   '/sitemap.xml', '/robots.txt', '/ads.txt']) {
    await expectOk(p);
  }

  // 7. キャッシュの状況を記録する（判定はしない。反映待ちの切り分け用）
  if (top) {
    console.log(`\nキャッシュ: cache-control=${top.cacheControl ?? '(無し)'} age=${top.age ?? '(無し)'}`);
  }

  // ---- 集計 ----
  const skipped = results.filter(r => r.ok === null);
  const failed = results.filter(r => r.ok === false);
  const passed = results.filter(r => r.ok === true);

  console.log('');
  for (const r of results) {
    const mark = r.ok === true ? '✓' : r.ok === false ? '✗' : '−';
    console.log(`${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }

  if (JSON_OUT) {
    console.log('\n' + JSON.stringify({
      base: BASE, checkedAt: new Date().toISOString(),
      passed: passed.length, failed: failed.length, skipped: skipped.length,
      results,
    }, null, 2));
  }

  console.log(`\n通過 ${passed.length} / 不一致 ${failed.length} / 未検査 ${skipped.length}`);

  // 1 つでも届かなかったら「検査していない」。成功と偽らない
  if (skipped.length && !failed.length) {
    console.error('\n未実施: ネットワークで届かなかった項目がある。判定を出せない。');
    process.exit(2);
  }
  if (failed.length) {
    console.error('\n公開状態がリポジトリと食い違っている。docs/deployment-runbook.md を見る。');
    process.exit(1);
  }
  console.log('公開サイトはリポジトリと一致している。');
}

main().catch(e => {
  console.error(`未実施: ${e.message}`);
  process.exit(2);
});
