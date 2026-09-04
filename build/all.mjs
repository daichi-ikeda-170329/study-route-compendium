/**
 * ビルドの唯一の入口。
 *
 *   node build/all.mjs             すべて作る
 *   node build/all.mjs --check     作らず、ずれているかだけ見る
 *   node build/all.mjs --no-ogp    OGP 画像を飛ばす（依存パッケージが要るため）
 *
 * これまで、生成は 10 個ほどのスクリプトを手で順に流す前提だった。順番を間違えると
 * 「古い件数のまま sitemap を作る」ような取り違えが起きるので、順序をここに固定する。
 * **同じ処理の入口を 2 つ作らない。** README と CI もこのコマンドを指す。
 *
 * 順序に意味があるところ
 *   - データ検証を最初に置く。壊れたデータから 1,390 ページを作らないため。
 *   - 件数（apply-count）は全ページを作り終えたあと。生成ページにも件数が出る。
 *   - sitemap は最後から 2 番目。作り終えたページだけを載せる。
 *   - dist/ は最後。上のすべてが終わった状態を写す。
 *
 * **データを変えたあとは、差分が出なくなるまで流す（通常は 2 回）。**
 * 一覧ページの更新日は「科目トップの中身が変わった日」なので、1 回目で科目
 * トップが書き換わると、2 回目でそれを読む一覧ページの日付が動く。2 回目で
 * 必ず収まる。収まらないなら、生成が入力以外のもの（時刻・git・環境）に
 * 依存している箇所があるので、そこを直す。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const NO_OGP = process.argv.includes('--no-ogp');

/**
 * step: 表示名 / script: build/ 以下のファイル名 / args: 追加引数
 * checkArgs: --check のときに渡す引数。null なら --check では飛ばす
 */
const STEPS = [
  { name: 'データ検証',            script: 'check-data.mjs',        checkArgs: [] },
  { name: '科目データの形',        script: 'snapshot-subject-data.mjs', checkArgs: ['--check'] },
  { name: '年度表記',              script: 'apply-site-meta.mjs',   checkArgs: ['--check'] },
  { name: '書籍ページ',            script: 'generate-books.mjs',    checkArgs: null },
  { name: '索引・おすすめ',        script: 'generate-index.mjs',    checkArgs: null },
  { name: 'おすすめ',              script: 'generate-picks.mjs',    checkArgs: null },
  { name: '志望校別ルート',        script: 'generate-routes.mjs',   checkArgs: null },
  { name: '解説記事',              script: 'generate-articles.mjs', checkArgs: null },
  { name: '法務・信頼性ページ',    script: 'generate-legal.mjs',    checkArgs: null },
  { name: '学習の記録ページ',      script: 'generate-progress.mjs', checkArgs: null },
  { name: '科目の配信アセット',    script: 'generate-subject-assets.mjs', checkArgs: ['--check'] },
  { name: '検索インデックス',      script: 'generate-search.mjs',   checkArgs: null },
  { name: '科目トップの事前描画',  script: 'prerender-tops.mjs',    checkArgs: ['--check'] },
  { name: '収録冊数',              script: 'apply-count.mjs',       checkArgs: ['--check'] },
  { name: 'sitemap',               script: 'generate-sitemap.mjs',  checkArgs: null },
  { name: 'データ品質レポート',    script: 'report-data-quality.mjs', checkArgs: null },
  { name: 'OGP 画像',              script: 'gen-ogp.mjs',           checkArgs: ['--check'], ogp: true },
  { name: '公開用 dist/',          script: 'build-public.mjs',      checkArgs: ['--check'] },
];

let failed = 0;
for (const s of STEPS) {
  if (s.ogp && NO_OGP) { console.log(`— ${s.name}: 飛ばす（--no-ogp）`); continue; }
  const args = CHECK ? s.checkArgs : (s.args || []);
  if (CHECK && args === null) { console.log(`— ${s.name}: --check では見ない（生成のみ）`); continue; }

  const label = `${CHECK ? '検査' : '生成'}: ${s.name}`;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build', s.script), ...args], {
    cwd: ROOT, stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`✗ ${label} で落ちた（build/${s.script}）`);
    failed++;
    // データ検証で落ちたら、その先を作らない（壊れたデータから 1,390 ページを作らない）
    if (s.script === 'check-data.mjs') break;
  } else {
    console.log(`✓ ${label}`);
  }
}

if (failed) {
  console.error(`\n${failed} 件のステップが落ちた`);
  process.exit(1);
}
console.log(`\nすべて${CHECK ? '検査' : '生成'}した（${STEPS.length} ステップ）`);
