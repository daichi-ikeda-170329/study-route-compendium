/**
 * 学習の進み具合をまとめて見る `/progress/` を作る。
 *
 *   node build/generate-progress.mjs
 *
 * ## このページの性格
 *
 * 中身は**この端末の localStorage にしかない**。サーバーには何も無い。
 * だから生成するのは器だけで、実際に並ぶ内容は `assets/js/progress-page.js` が
 * 端末の中のデータから描く。
 *
 * **`noindex,follow`** にする。個人の状態を表示するページなので検索結果に載せない。
 * `follow` は残す（ここから科目ページへ辿れることまで否定する必要は無い）。
 * `build/generate-sitemap.mjs` は `noindex` のページを自動で外すので、
 * こちらで除外リストを持つ必要は無い（`test/dist.test.mjs` が突き合わせる）。
 *
 * ## 公開経路（実装指示書 §4.4）
 *
 *   1. `build/all.mjs` の STEPS に入れる            … 済
 *   2. `build/build-public.mjs` の ALLOW_DIRS に足す … 済（'progress'）
 *   3. noindex なので sitemap から外れる            … 自動
 *   4. title / h1 / canonical を入れる              … 下の render()
 *   5. 内部リンクを張り、孤立ページにしない          … フッターの「学習の記録」
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, ORIGIN, esc } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, portalHeader, footer, crumbs, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { ADMISSION_LABEL } from './lib/site-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 科目の並びと表示名。画面側は fetch せず、この一覧だけで動く */
function subjectMeta() {
  return SUBJECTS.map(s => ({ id: s.dir, label: s.ja, color: s.color }));
}

function render(counts) {
  const url = `${ORIGIN}/progress/`;
  const title = '学習の記録｜この端末だけに残る進み具合 - ルート大全';
  const desc = '読んでいる参考書の状態（未着手・学習中・完了・保留）をこの端末の中だけに記録します。'
    + 'サーバーへは送らず、JSON で取り出しと取り込みができます。';

  const crumbItems = [
    { name: 'ルート大全', url: `${ORIGIN}/` },
    { name: '学習の記録', url },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  const subjects = subjectMeta();

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, noindex: true, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#2F6E4F}
.pg-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:18px 0}
.pg-sum div{background:var(--card);border:1px solid var(--line-2);border-radius:6px;padding:12px 14px}
.pg-sum dt{font-size:11.5px;color:var(--muted-2);font-family:var(--mono);letter-spacing:.06em}
.pg-sum dd{font-size:22px;font-weight:800;margin-top:2px}
.pg-list{display:flex;flex-direction:column;gap:10px;margin:14px 0}
.pg-row{background:var(--card);border:1px solid var(--line-2);border-radius:6px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}
.pg-row__name{font-weight:700;flex:1 1 220px;min-width:0;overflow-wrap:anywhere}
.pg-row__sub{font-size:11.5px;color:var(--muted-2);font-family:var(--mono)}
.pg-row__st{font-size:12.5px;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid var(--line)}
.pg-row__st[data-st="in_progress"]{background:#EAF2FB;border-color:#9DBEE3;color:#1B3E6B}
.pg-row__st[data-st="completed"]{background:#E9F4EE;border-color:#9CCDB1;color:#1D5236}
.pg-row__st[data-st="on_hold"]{background:#F6F1E6;border-color:#D8C79E;color:#5C4A1E}
.pg-row__st[data-st="not_started"]{background:var(--surface-3);color:var(--ink-2)}
.pg-row__loc{font-size:12.5px;color:var(--ink-2);flex-basis:100%}
.pg-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.pg-btn{min-height:44px;min-width:44px;padding:10px 16px;border-radius:6px;border:1px solid var(--line);background:var(--bg);font:inherit;font-weight:700;cursor:pointer;color:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.pg-btn:hover{background:var(--card)}
.pg-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.pg-btn--danger{border-color:#B5432A;color:#8C2437}
.pg-note{background:var(--surface-2);border:1px solid var(--line-2);border-radius:6px;padding:12px 14px;font-size:13px;line-height:1.8;margin:14px 0}
.pg-empty{padding:22px 16px;text-align:center;color:var(--muted);font-size:14px}
.pg-goal{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0}
.pg-goal input,.pg-goal select{min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;background:var(--bg);color:inherit}
.pg-pick{background:var(--card);border:1px solid var(--line-2);border-radius:6px;padding:12px 14px;margin:8px 0}
.pg-pick b{display:block;margin-bottom:2px}
.pg-diff{font-family:var(--mono);font-size:12.5px;line-height:1.9}
.pg-live{min-height:1.6em}
@media(max-width:520px){.pg-row{gap:6px 10px}}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <article>
    <div class="art-head">
      <div class="eyebrow">Progress</div>
      <h1 class="art-h1">学習の記録</h1>
      <p class="art-lead">読んでいる参考書の状態を、<b>この端末の中だけ</b>に記録します。アカウントは要りません。サーバーへは何も送らないので、ブラウザのデータを消すと記録も消えます。大切な記録は下の「JSON で取り出す」で控えを取ってください。</p>
    </div>

    <div id="pgStatus" class="pg-live" role="status" aria-live="polite"></div>

    <section class="block">
      <h2 class="sec">いまの状態</h2>
      <dl class="pg-sum" id="pgSummary"></dl>
    </section>

    <section class="block">
      <h2 class="sec">今週みるところ</h2>
      <p>記録した中から、<b>学習中を先に、次に未着手</b>の順で最大 3 件を出します。並び方は決まっているので、開くたびに変わることはありません。</p>
      <div id="pgWeekly"></div>
      <div class="pg-goal">
        <label for="pgGoalValue">週の目標</label>
        <input id="pgGoalValue" type="number" min="1" max="10000" step="1" inputmode="numeric" style="width:7em">
        <label for="pgGoalUnit" class="visually-hidden">単位</label>
        <select id="pgGoalUnit">
          <option value="hours">時間</option>
          <option value="pages">ページ</option>
          <option value="questions">問</option>
          <option value="chapters">章</option>
        </select>
        <button type="button" class="pg-btn" id="pgGoalSave">目標を保存</button>
        <button type="button" class="pg-btn" id="pgGoalClear">目標を消す</button>
      </div>
      <p class="pg-note">週の目標は<b>目安</b>です。届かなかった週があっても、それ自体は問題ではありません。体調や学校の予定で使える時間は動きます。記録は「いまどこにいるか」を確かめるためのもので、できなかったことを数えるためのものではありません。</p>
    </section>

    <section class="block">
      <h2 class="sec">記録している参考書</h2>
      <div id="pgList" class="pg-list"></div>
    </section>

    <section class="block">
      <h2 class="sec">取り出しと取り込み</h2>
      <p>記録は JSON で取り出せます。別の端末へ移すときや、ブラウザのデータを消す前の控えに使ってください。<b>取り出した中身に、診断の回答・検索した言葉・解析の ID は入りません。</b></p>
      <div class="pg-actions">
        <button type="button" class="pg-btn" id="pgExport">JSON で取り出す</button>
        <label class="pg-btn" for="pgImportFile">JSON を読み込む</label>
        <input id="pgImportFile" type="file" accept="application/json,.json" aria-label="取り込む JSON ファイルを選ぶ" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">
      </div>
      <div id="pgImportPreview"></div>
      <p class="pg-note">読み込むときは、<b>先に件数と差分を表示します</b>。そこで「既存へ統合」か「置き換え」を選ぶまで、いまの記録は変わりません。掲載していない参考書の ID は件数だけ出して取り込みません。</p>
    </section>

    <section class="block">
      <h2 class="sec">記録を消す</h2>
      <p>消えるのは<b>学習の記録だけ</b>です。保存したルート（<code>rt_saved_routes</code>）と学習ペースの設定（<code>rt_pace</code>）は残ります。</p>
      <div class="pg-actions">
        <button type="button" class="pg-btn pg-btn--danger" id="pgClear">学習の記録をすべて消す</button>
      </div>
      <div id="pgClearConfirm"></div>
    </section>

    <div class="note">
      <h3>記録の付け方</h3>
      <p>参考書の状態は、各科目の<b>参考書図鑑</b>と<b>書籍ページ</b>から変えられます。${subjects.map(s => `<a href="/${s.id}/">${esc(s.label)}</a>`).join(' ／ ')}</p>
    </div>
  </article>
</main>

${footer('', counts)}

${jsonLd(ld)}

<script>window.RT_PROGRESS_SUBJECTS=${JSON.stringify(subjects)};</` + `script>
<script src="/assets/js/progress.js" defer></` + `script>
<script src="/assets/js/progress-page.js" defer></` + `script>

</body>
</html>
`;
}

const counts = {};
for (const s of SUBJECTS) counts[s.dir] = loadSubjectData(ROOT, s.dir).books.length;

const dir = path.join(ROOT, 'progress');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), render(counts));
console.log(`  ✓ /progress/（noindex,follow。年度表記の正本は site-meta.json: ${ADMISSION_LABEL}）`);
