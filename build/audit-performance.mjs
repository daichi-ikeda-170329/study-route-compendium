/**
 * Lighthouse を決まった手順で流し、中央値と各 run を JSON と Markdown へ残す。
 *
 *   node build/audit-performance.mjs                          既定（mobile / science）
 *   node build/audit-performance.mjs --path=/ --path=/math/   対象ページを足す
 *   node build/audit-performance.mjs --runs=3                 実行回数
 *   node build/audit-performance.mjs --preset=desktop         desktop で測る
 *   node build/audit-performance.mjs --label=after-s5         出力ファイル名に付く札
 *   node build/audit-performance.mjs --block-third-party      第三者 request を遮断して測る
 *   node build/audit-performance.mjs --out=docs/perf/x.json   出力先を明示する
 *   node build/audit-performance.mjs --commit=<sha>            記録する commit SHA
 *
 * **commit SHA はここで git を呼んで取らない。** build/ 以下の生成スクリプトが git の
 * 履歴に触ることは test/data-integrity.test.mjs が禁じている（浅いクローンでは全ファイルが
 * 「今日」になり、手元と CI で生成物が食い違うため）。この検査は build/ 全体を見ているので、
 * 測定用のこのスクリプトも例外にしない。SHA は --commit か GITHUB_SHA から受け取り、
 * どちらも無ければ null を書く。**推測で埋めない。**
 *
 * **CI の必須ゲートにしない。** ネットワークと機械の揺らぎで値がぶれるので、
 * 赤くするのは決定的な検査（test/performance-budget.test.mjs）に任せ、
 * ここは「測って記録する」だけにする。
 *
 * 終了コード
 *   0 … 測れた
 *   1 … 測ろうとして落ちた
 *   2 … 測れる環境が無い（Lighthouse か Chrome が無い）。**成功と偽らない**
 *
 * 測り方を固定するために、次を必ず出力へ書く。
 *   実行日 / commit SHA / Lighthouse と Chrome のバージョン / 対象 URL /
 *   form factor と throttling / 実行回数 / 各 run の値 / 中央値
 * これが無いと、あとで「良くなったのか」を比べられない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);

const arg = (name, fallback) => {
  const hit = ARGS.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const argAll = name => ARGS.filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3));

const PORT = Number(arg('port', 4173));
const RUNS = Math.max(1, Number(arg('runs', 3)));
const PRESET = arg('preset', 'mobile'); // mobile | desktop
const LABEL = arg('label', '');
const BLOCK_3P = ARGS.includes('--block-third-party');
const SERVE_DIR = arg('serve', '.');
const PATHS = argAll('path').length ? argAll('path') : ['/science/'];
const BASE_URL = arg('base', `http://127.0.0.1:${PORT}`);
const EXTERNAL_BASE = ARGS.some(a => a.startsWith('--base='));
const COMMIT = arg('commit', process.env.GITHUB_SHA || null);

/**
 * 遮断する第三者。**解析と広告だけを止める。**
 *
 * e2e/helpers.mjs の blockThirdParty() と同じ範囲にそろえてある
 * （googletagmanager / google-analytics / googlesyndication / doubleclick /
 *   adsbygoogle / pagead）。
 *
 * **Google Fonts（fonts.googleapis.com / fonts.gstatic.com）は含めない。**
 * ここで見たいのは「解析と広告を外したら何が残るか」であって、
 * 書体はサイトの見た目そのものなので外す対象ではない。
 * 実際、以前 `*gstatic.com*` を入れていたときは書体の取得が止まったまま
 * ページが落ち着かず、LCP が 24 秒になって計測が壊れていた。
 */
const THIRD_PARTY_PATTERNS = [
  '*googletagmanager.com*', '*google-analytics.com*', '*analytics.google.com*',
  '*googlesyndication.com*', '*googleadservices.com*', '*doubleclick.net*',
  '*adtrafficquality.google*', '*pagead*', '*adsbygoogle*',
];

/** 実行できるかを先に確かめる。無いなら「未実施」で終える */
function probeEnvironment() {
  const lh = spawnSync('npx', ['--no-install', 'lighthouse', '--version'], { cwd: ROOT, encoding: 'utf8' });
  if (lh.status !== 0) {
    return { ok: false, why: 'lighthouse が見つからない（npx --no-install lighthouse --version が落ちた）' };
  }
  const chromePath = findChrome();
  if (!chromePath) return { ok: false, why: 'Chrome / Chromium が見つからない' };
  const cv = spawnSync(chromePath, ['--version'], { encoding: 'utf8' });
  return {
    ok: true,
    lighthouseVersion: lh.stdout.trim(),
    chromePath,
    chromeVersion: (cv.stdout || '').trim() || 'unknown',
  };
}

/** Chrome の場所。CHROME_PATH が最優先 */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

/** 中央値。偶数個なら中央 2 つの平均 */
function median(nums) {
  const xs = nums.filter(n => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const round = (n, d = 3) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Lighthouse の JSON から、比べたい値だけを抜く */
function pick(report) {
  const cat = report.categories || {};
  const a = report.audits || {};
  const num = id => (a[id] && typeof a[id].numericValue === 'number' ? a[id].numericValue : null);
  const score = id => (cat[id] && typeof cat[id].score === 'number' ? Math.round(cat[id].score * 100) : null);
  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    lcpMs: num('largest-contentful-paint'),
    fcpMs: num('first-contentful-paint'),
    cls: num('cumulative-layout-shift'),
    tbtMs: num('total-blocking-time'),
    speedIndexMs: num('speed-index'),
    ttiMs: num('interactive'),
    transferBytes: num('total-byte-weight'),
  };
}

/**
 * LCP になった要素と、改善余地の大きい項目を拾う。
 *
 * 「遅い」だけでは次の一手が決まらない。**何が LCP なのか**（自サイトの文字か、
 * 第三者の画像か）と、Lighthouse が挙げる節約見込みの大きい順を残す。
 */
function diagnostics(report) {
  const a = report.audits || {};
  /* Lighthouse 13 では LCP の要素は lcp-breakdown-insight の details に入る
     （旧 largest-contentful-paint-element は無くなっている）。
     取れなかったときは null のままにして、推測で埋めない。 */
  const items = a['lcp-breakdown-insight']?.details?.items || [];
  const node = items.find(x => x.type === 'node') || null;
  const breakdown = items.find(x => x.type === 'table')?.items || [];

  const opportunities = Object.values(a)
    .filter(x => x && x.details && typeof x.details.overallSavingsMs === 'number' && x.details.overallSavingsMs >= 50)
    .sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs)
    .slice(0, 8)
    .map(x => ({ id: x.id, title: x.title, savingsMs: Math.round(x.details.overallSavingsMs) }));

  return {
    lcpElement: node ? String(node.snippet || '').slice(0, 160) : null,
    lcpSelector: node ? String(node.selector || '').slice(0, 160) : null,
    lcpBreakdown: breakdown.map(x => ({ label: x.label, ms: Math.round((x.duration || 0) * 10) / 10 })),
    opportunities,
  };
}

/** best-practices の落ちている audit を、原因の切り分け用に列挙する */
function failedAudits(report, categoryId) {
  const cat = (report.categories || {})[categoryId];
  if (!cat) return [];
  return (cat.auditRefs || [])
    .map(r => report.audits[r.id])
    .filter(x => x && x.score !== null && x.score < 1 && x.scoreDisplayMode !== 'notApplicable')
    .map(x => ({ id: x.id, title: x.title, score: x.score }));
}

async function main() {
  const env = probeEnvironment();
  if (!env.ok) {
    console.error(`未実施: ${env.why}`);
    console.error('Lighthouse と Chrome がある環境で `npm run audit:performance` を流す。');
    process.exit(2);
  }

  if (!COMMIT) {
    console.warn('注意: commit SHA が不明。--commit=<sha> か GITHUB_SHA で渡すと出力に残る。');
  }
  const outDir = path.join(ROOT, 'docs', 'perf');
  fs.mkdirSync(outDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'rt-lh-'));

  let server = null;
  if (!EXTERNAL_BASE) {
    const { spawn } = await import('node:child_process');
    server = spawn(process.execPath, [path.join(ROOT, 'build', 'serve.mjs'), String(PORT), SERVE_DIR], {
      cwd: ROOT, stdio: 'ignore',
    });
    await new Promise(r => setTimeout(r, 700));
  }

  const result = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    commit: COMMIT,
    lighthouseVersion: env.lighthouseVersion,
    chromeVersion: env.chromeVersion,
    target: EXTERNAL_BASE ? 'external' : `localhost (build/serve.mjs, ${SERVE_DIR})`,
    baseUrl: BASE_URL,
    formFactor: PRESET,
    throttling: PRESET === 'desktop' ? 'lighthouse desktop preset' : 'simulate (lighthouse mobile default)',
    thirdParty: BLOCK_3P ? 'blocked' : 'allowed',
    runs: RUNS,
    pages: [],
  };

  try {
    for (const p of PATHS) {
      const url = `${BASE_URL}${p}`;
      const runs = [];
      let lastReport = null;
      for (let i = 1; i <= RUNS; i++) {
        const outPath = path.join(tmpDir, `lh-${p.replace(/\W+/g, '_')}-${i}.json`);
        const lhArgs = [
          '--no-install', 'lighthouse', url,
          '--output=json', `--output-path=${outPath}`, '--quiet',
          '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
        ];
        if (PRESET === 'desktop') lhArgs.push('--preset=desktop');
        else lhArgs.push('--form-factor=mobile', '--throttling-method=simulate', '--screenEmulation.mobile');
        /* **1 つの引数へカンマで並べない。** Lighthouse はこの指定を配列として受け取るので、
           カンマ区切りで渡すと「カンマを含む 1 個のパターン」と解釈され、何も遮断されない
           （2026-09-05 に、遮断したはずなのに Best Practices が 77 のままで気づいた）。 */
        if (BLOCK_3P) for (const pat of THIRD_PARTY_PATTERNS) lhArgs.push(`--blocked-url-patterns=${pat}`);

        process.stderr.write(`  ${url} run ${i}/${RUNS} … `);
        const r = spawnSync('npx', lhArgs, {
          cwd: ROOT, encoding: 'utf8',
          env: { ...process.env, CHROME_PATH: env.chromePath },
        });
        if (r.status !== 0 || !fs.existsSync(outPath)) {
          process.stderr.write('落ちた\n');
          console.error((r.stderr || '').split('\n').slice(-8).join('\n'));
          process.exitCode = 1;
          continue;
        }
        const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        lastReport = report;
        const v = pick(report);
        runs.push(v);
        process.stderr.write(`perf ${v.performance} / LCP ${round(v.lcpMs / 1000, 2)}s / CLS ${round(v.cls, 3)}\n`);
      }

      if (!runs.length) continue;
      const keys = Object.keys(runs[0]);
      const med = {};
      for (const k of keys) med[k] = round(median(runs.map(x => x[k])), 3);
      result.pages.push({
        path: p, url, runs,
        median: med,
        failedBestPractices: lastReport ? failedAudits(lastReport, 'best-practices') : [],
        diagnostics: lastReport ? diagnostics(lastReport) : null,
      });
    }
  } finally {
    if (server) server.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const slug = [PRESET, BLOCK_3P ? 'no3p' : 'with3p', LABEL].filter(Boolean).join('-');
  const jsonOut = arg('out', path.join(outDir, `lighthouse-${slug}.json`));
  fs.writeFileSync(path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut), JSON.stringify(result, null, 2) + '\n');
  const mdPath = (path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut)).replace(/\.json$/, '.md');
  fs.writeFileSync(mdPath, toMarkdown(result));
  console.log(`\n書いた: ${path.relative(ROOT, path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut))}`);
  console.log(`書いた: ${path.relative(ROOT, mdPath)}`);
}

function toMarkdown(r) {
  const L = [];
  L.push(`# Lighthouse 計測 (${r.formFactor} / 第三者 ${r.thirdParty === 'blocked' ? '遮断' : '含む'})`);
  L.push('');
  L.push('## 測定条件');
  L.push('');
  L.push(`- 実行日時: ${r.collectedAt}`);
  L.push(`- commit: ${r.commit ? '`' + r.commit + '`' : '不明（--commit で渡されなかった）'}`);
  L.push(`- Lighthouse: ${r.lighthouseVersion}`);
  L.push(`- Chrome: ${r.chromeVersion}`);
  L.push(`- 対象: ${r.target}`);
  L.push(`- base URL: ${r.baseUrl}`);
  L.push(`- form factor: ${r.formFactor} / throttling: ${r.throttling}`);
  L.push(`- 第三者スクリプト: ${r.thirdParty === 'blocked' ? '遮断した' : '通常どおり読み込んだ'}`);
  L.push(`- 実行回数: ${r.runs}（中央値を採る）`);
  L.push('');
  for (const p of r.pages) {
    L.push(`## ${p.path}`);
    L.push('');
    L.push('| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    p.runs.forEach((v, i) => {
      L.push(`| ${i + 1} | ${v.performance} | ${v.accessibility} | ${v.bestPractices} | ${v.seo} | ${round(v.lcpMs / 1000, 2)} | ${round(v.cls, 3)} | ${round(v.tbtMs, 0)} | ${round(v.speedIndexMs / 1000, 2)} |`);
    });
    const m = p.median;
    L.push(`| **中央値** | **${m.performance}** | **${m.accessibility}** | **${m.bestPractices}** | **${m.seo}** | **${round(m.lcpMs / 1000, 2)}** | **${round(m.cls, 3)}** | **${round(m.tbtMs, 0)}** | **${round(m.speedIndexMs / 1000, 2)}** |`);
    L.push('');
    if (p.diagnostics) {
      L.push('### 診断（最終 run）');
      L.push('');
      L.push(`- LCP になった要素: ${p.diagnostics.lcpElement ? '`' + p.diagnostics.lcpElement.replace(/`/g, '') + '`' : '取得できず'}`);
      if (p.diagnostics.lcpSelector) L.push(`- その位置: \`${p.diagnostics.lcpSelector}\``);
      if (p.diagnostics.lcpBreakdown.length) {
        L.push(`- LCP の内訳: ${p.diagnostics.lcpBreakdown.map(x => `${x.label} ${x.ms}ms`).join(' / ')}`);
      }
      if (p.diagnostics.opportunities.length) {
        L.push('- 節約見込みの大きい順:');
        for (const o of p.diagnostics.opportunities) L.push(`  - \`${o.id}\` ${o.title} — 約 ${o.savingsMs}ms`);
      }
      L.push('');
    }
    if (p.failedBestPractices.length) {
      L.push('### Best Practices で落ちた audit（最終 run）');
      L.push('');
      for (const a of p.failedBestPractices) L.push(`- \`${a.id}\` — ${a.title}`);
      L.push('');
    }
  }
  return L.join('\n') + '\n';
}

main().catch(e => { console.error(e); process.exit(1); });
