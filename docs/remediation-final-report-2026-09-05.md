# 未解決事項 8 件の対応 — 最終報告

作成日: 2026-09-05
実装指示書: `/Users/ikedadaichi/Downloads/ルート大全未解決事項実装指示書.md`
進捗台帳: `docs/remediation-progress.md`

**数値はすべてコマンド出力の写し。実施していない項目は「未実施」と書く。**
**「ほぼ完了」を「完了」と書かない。**

---

## 実装結果

- **Base SHA**: `dabdb86de0f201ecf8d8d26da1f7c9367d179552`（`origin/main`）
- **Final SHA**: `6363f94f4ebde639038c5bf10f77af6a53db2923`（main へのマージコミット）
- **ブランチ**: `fix/unresolved-items`
- **DONE**: 未解決事項 8 件のうち **8 件**（うち 3 件に外部作業が残る）
- **BLOCKED_EXTERNAL**: 4 件（実機 QA / KPI の実数 / 書影の利用条件 / GitHub の Description）
- **FAILED**: 0 件
- **目標未達**: 性能 3 指標（Performance 80 / LCP 4.0s / CLS 0.10）。原因は特定済み

## 未解決事項 8 件の対応状況

| # | 事項 | 状態 | 根拠（コミット / 証跡ファイル） |
|---|---|---|---|
| 1 | 科目データの分離 | **DONE**（性能目標は未達） | `9d4f6a85` `4ec7d262` `8c46c52d` `c1d732f3` `92d09408` `377f5a8f` `a7f4f2ad` `7f596b06` `70b07c22` `a893ad6c` `b44ab537` / `docs/performance-report.md` |
| 2 | 進捗管理の拡張 | **DONE** | `a28dc50a` / `assets/js/progress.js`・`/progress/`・`test/progress.test.mjs`（28 件）・`e2e/progress.spec.mjs`（11 件） |
| 3 | 任意の追加質問 | **DONE** | `23cf9908` / `assets/js/refine.js`・`e2e/refine.spec.mjs`（8 件） |
| 4 | 検索の絞り込み拡張 | **DONE** | `cc7e8c0a` / `assets/generated/search-facets.json`・`/search/`・`test/search-facets.test.mjs`（21 件）・`e2e/search.spec.mjs`（13 件） |
| 5 | 書影の出所台帳 | **DONE** ＋ BLOCKED_EXTERNAL（利用条件の確認） | `2eb15283` / `docs/cover-policy.md`・`build/data/cover-*.json`・`test/covers.test.mjs`（14 件） |
| 6 | 手動 QA | **DONE**（自動）＋ BLOCKED_EXTERNAL（実機） | `aaf345ea` / `docs/qa-report-2026-09-05.md`・`e2e/cross-browser.spec.mjs`（10 件 × 3 ブラウザ） |
| 7 | Best Practices 77 の原因分離 | **DONE** | `741a5a65` / `docs/performance-report.md` §5.4・`docs/perf/lighthouse-mobile-no3p-s10-no3p.json` |
| 8 | KPI 基準値 | **DONE**（機構）＋ BLOCKED_EXTERNAL（実数の投入） | `fafc5849` / `build/import-kpi.mjs`・`docs/kpi-import-guide.md`・`test/kpi-import.test.mjs`（18 件） |

## 変更ファイル

### 科目データ・ビルド

```
data/subjects/{english,japanese,math,science,social,joho,shoron}/   正本 6 ファイル × 7 科目
assets/generated/subjects/<科目>.{core,books,routes,unis,guides}.json  配信 5 本 × 7 科目
assets/js/subject-<科目>.js                                          描画コード 7 本
assets/js/subject-loader.js                                          データを取って起動する
build/lib/load-subject-data.mjs                                      唯一の読み書き口（新）
build/lib/subject-assets.mjs / subject-split.mjs                     配信アセットの形（新）
build/generate-subject-assets.mjs                                    配信アセット生成（新）
build/lib/extract.mjs                                                extractSubject() を削除
build/apply-new-books.mjs / apply-book-text.mjs                      書き口を canonical へ
build/{check-data,check-links,check-site,gen-ogp,gen-x-posts,        読み口を 1 本化（19 本）
       generate-*,apply-count,report-data-quality,fetch-*,
       prerender-tops,snapshot-subject-data}.mjs
build/lib/updated.mjs                                                subjectContentDate() を追加
```

### 進捗

```
assets/js/progress.js / progress-control.js / progress-page.js
build/generate-progress.mjs、/progress/
assets/js/pace.js（残り時間へ進捗を反映）
```

### 追加質問

```
assets/js/refine.js、assets/js/share.js（共有されないものを明示）
```

### 検索

```
assets/js/search-core.js / search-page.js
build/generate-search-facets.mjs / generate-search-page.mjs、/search/
assets/js/search.js（候補の末尾に詳細検索への導線）
```

### 書影台帳

```
build/data/cover-provider-policies.json / cover-ledger.json
build/generate-cover-ledger.mjs / check-covers.mjs
assets/js/cover-resolver.js / cover-policies.js、build/lib/cover.mjs
docs/cover-policy.md
```

### QA / CI

```
e2e/cross-browser.spec.mjs、playwright.config.mjs（Firefox / WebKit の project）
e2e/helpers.mjs（waitForApp・第三者ノイズ・RT_DEBUG_ERRORS）
.github/workflows/test.yml / production.yml / links.yml
build/check-production.mjs、docs/deployment-runbook.md
test/performance-budget.test.mjs、build/audit-performance.mjs
docs/qa-report-template.md / qa-report-2026-09-05.md
```

### KPI / 文書

```
build/import-kpi.mjs、build/data/kpi-schema.json
docs/kpi-import-guide.md / kpi-baseline.json / kpi-baseline.md / kpi-baseline.example.json
.gitignore（private/）
docs/remediation-progress.md / baseline-2026-09-05.md / performance-report.md
docs/style-guide.md（年度表記を site-meta.json 参照へ）
README.md（配信手順と OWNER ACTION）
```

## 不変条件の確認

| 項目 | 結果 |
|---|---|
| 総冊数 | **1,390**（改修前と同じ） |
| 科目別冊数 | english 252 / japanese 192 / math 162 / science 373 / social 293 / joho 29 / shoron 89（**すべて改修前と同じ**） |
| ID / URL の変更 | **無し。** 書籍 ID・科目 ID・ルート ID・stage ID・公開 URL は 1 つも変えていない |
| 共有 URL fixture | `test/share.test.mjs`（31 件）・`test/uni-share.test.mjs` が通過。`e2e/flows.spec.mjs` の「旧い共有 URL を開いても同じルートが出る」も通過 |
| localStorage の移行 | `rt_saved_routes` / `rt_pace` は**触っていない**。進捗は別キー `rt_learning_progress`（version 1）。`test/progress.test.mjs` の「既存のキーに触らない」が固定 |
| アフィリエイト開示 | **全 1,390 冊の書籍ページに出ている。** 購入リンクの `tag=` と楽天の経路 ID、`rel="sponsored"` も残っている（`test/affiliate-disclosure.test.mjs` 11 件） |
| スナップショット | `npm run check:shape` 通過。**仕様変更が無いので取り直していない** |

## 性能

測定条件は次のとおり。**localhost であり、本番ではない。**

| 項目 | 値 |
|---|---|
| 対象 URL | `http://127.0.0.1:4193/science/`（`build/serve.mjs` がリポジトリ直下を配信） |
| Lighthouse | 13.4.1 |
| Chrome | Google Chrome 152.0.7977.76 |
| form factor | mobile / throttling `simulate`（Lighthouse mobile 既定） |
| 実行回数 | 改修前 5 回・改修後 9 回、いずれも**中央値** |
| 第三者 | 通常どおり読み込んだ（遮断条件は別に測った） |

| 対象 | 改修前 | 改修後 | 判定 |
|---|---:|---:|---|
| science HTML bytes | 977,442 | **157,273** | −83.9%。250,000 と 200,000 の予算に入った |
| social HTML bytes | 874,633 | **150,361** | −82.8% |
| english HTML bytes | 607,760 | **143,242** | −76.4% |
| japanese HTML bytes | 586,352 | **142,418** | −75.7% |
| math HTML bytes | 471,171 | **136,775** | −71.0% |
| shoron HTML bytes | 225,578 | **92,022** | −59.2% |
| joho HTML bytes | 153,728 | **91,063** | −40.8% |
| science Perf median (mobile) | 47 | **53** | 改善。**目標 80 に未達** |
| science LCP median | 12.09s | **10.99s** | 改善。**目標 4.0s に未達** |
| science CLS median | 0.217 | **0.216** | 悪化なし。**目標 0.10 に未達** |
| science Speed Index median | 7.53s | **4.56s** | −39.4% |
| Best Practices 第三者 on / off | 77 / — | **77 / 100** | 自サイト由来の失敗 0 |

**未達 3 件の原因は Google Fonts のスタイルシート 1 本に帰着する。**
描画をブロックする資源は 5 本 4,676ms から 1 本 2,889ms（Google Fonts のみ）になり、
自前のスクリプトはすべて critical path から外れた。CLS 0.216 も
Lighthouse が挙げる原因はすべて Web font で、広告・解析ではない（遮断しても変わらない）。
残りを詰めるには `display=optional` への変更か自前配信が要るが、
どちらも**初回訪問者に見せる書体が変わる**ので運営者の判断とした
（`docs/performance-report.md` §6）。

## テスト

| command | result | tests/pass/fail/skip | note |
|---|---|---|---|
| `npm ci` | ok | — | |
| `npm run build`（1 回目・2 回目） | ok | — | |
| `git diff --exit-code` | **差分ゼロ** | — | 生成が入力以外に依存していない |
| `git status --porcelain` | **空** | — | 追跡外の生成物なし |
| `npm run check:data` | ok | — | 1,390 件のレコードと確認状態 |
| `npm run check:counts` | ok | — | |
| `npm run check:shape` | ok | — | スナップショット無変更 |
| `npm run check:site` | ok | — | HTML 1,485 枚・書籍 1,390 冊・警告 0 |
| `npm run check:links` | ok | — | 外部リンク（落とさない設計） |
| `npm run check:generated` | ok | — | |
| `npm run check:budgets` | ok | 9 / 9 / 0 / 0 | |
| `npm run check:covers` | ok | — | 未確認の取得元 8 件を報告 |
| `npm test` | ok | **370 / 370 / 0 / 0** | |
| `npx playwright test`（Chromium 4 幅） | ok | **332 / 332 / 0 / 0** | |
| `npm run test:cross-browser` | ok | **30 / 30 / 0 / 0** | Firefox / WebKit / WebKit mobile |
| `npm run ogp:check` | ok | — | |
| `npm run report:quality` | ok | — | verified 402 / partial 727 / unverified 257 |
| `npm run audit:performance` | ok | — | 上の性能表 |
| `npm run check:production` | ok | 19 / 0 / 0 | **マージと Pages 反映のあとに本番へ実行**（下の「公開確認」） |

## QA

| 項目 | 結果 |
|---|---|
| Chromium | 151.0.7922.34（Playwright 同梱）。4 幅で 332 件 pass |
| Firefox | 153.0（Playwright 同梱）。主要フロー 10 件 pass |
| WebKit | 26.5（Playwright 同梱）。desktop と iPhone 14 で各 10 件 pass |
| **Safari 実機** | **未実施。** この環境に実機が無い（BLOCKED_EXTERNAL） |
| 実機 Firefox / iPhone / iPad | **未実施。**（同上） |
| 自サイト由来 error | **0**（4 ブラウザ構成すべて） |
| 第三者由来 error | AdSense が Error でない値を投げるもの、Google Fonts の取得失敗。`THIRD_PARTY_NOISE` で分離済み |
| axe critical / serious | **0**（主要 12 ページ × 4 幅） |
| 横方向のオーバーフロー | **0**（320 / 375 / 768 / 1366px） |

詳細は `docs/qa-report-2026-09-05.md`。

## 公開確認（マージ後に実施）

| 項目 | 状態 |
|---|---|
| PR | [#8](https://github.com/daichi-ikeda-170329/study-route-compendium/pull/8)。CI は build / counts / test / e2e すべて pass（e2e は Firefox・WebKit 込みで 11m37s） |
| マージ | `6363f94f4ebde639038c5bf10f77af6a53db2923`（main） |
| Pages workflow | 「Pages 公開」success（45s）。run `33923016966` |
| production parity | **`npm run check:production` が 19 / 0 / 0 で通過**（終了コード 0） |
| 新しいページ | `/search/` `/progress/` とも HTTP 200 |
| 配信アセット | `assets/generated/subjects/science.books.json`・`assets/generated/search-facets.json`・`assets/js/subject-science.js`・`progress.js`・`cover-resolver.js` すべて 200 |
| 本番の科目 HTML | science 157,273 / social 150,361 / english 143,242 / japanese 142,418 / math 136,775 / joho 91,063 / shoron 92,022 バイト（手元と一致） |
| ブラウザでの動作 | `/science/` 図鑑 373 枚・ルート 8 本・コンソールエラー 0。`/search/` は 1,390 → 数学 162 冊に絞れる。`/progress/` は `noindex,follow` |
| GitHub description | **未更新。** `参考書1,052冊` のまま（OWNER ACTION 1） |

### 本番の性能は「測れていない」

マージ後に本番を 5 回測ったが、**この環境からの計測は信頼できない。**
5 run のうち 4 run で LCP が 19〜20 秒に張り付き、1 run だけ 5.1 秒だった。
この機械から Google Fonts・AdSense への通信が不安定なためで、サイトの側の問題ではない
（同じコードが localhost では安定して Performance 53 / Speed Index 4.56 秒を出す）。

**外れ値を避けて都合のよい数字を採ることもしない。**
本番の実力は PageSpeed Insights か Search Console の Core Web Vitals で見る。
詳細は `docs/performance-report.md` §6.5。

## OWNER ACTION

> **この節は 2026-09-05 の報告時点の記録。**
> その後 `chore/owner-actions` で 1・2・6 を実施し、3 の下調べと `ndl` の停止を行った。
> **いまの状態は `docs/remediation-progress.md` の OWNER ACTION 表が正本。**


1. **GitHub リポジトリの Description を実態に合わせる。**
   いま `ルート大全 — 大学受験の参考書1,052冊を科目別に図鑑化・ルート化した無料サイト` で、
   実際の 1,390 冊と食い違う。手元の `gh` に `repo` scope はあるが、
   公開リポジトリの外向き設定なので実行していない。
   ```bash
   gh repo edit daichi-ikeda-170329/study-route-compendium \
     --description "大学受験の参考書を科目・目的別に整理し、学習ルートと進捗管理を提供する静的サイト"
   ```
   完了判定: `gh repo view --json description` の出力に `1,052` が含まれない。

2. **Topics を設定する。**
   ```bash
   gh repo edit daichi-ikeda-170329/study-route-compendium \
     --add-topic static-site --add-topic github-pages --add-topic education --add-topic japanese
   ```
   完了判定: `gh repo view --json repositoryTopics` が `null` でない。

3. **書影の利用条件を確認する。** 6 種類（Amazon / 学参ドットコム / 国立国会図書館サーチ /
   Google Books / openBD / 個別指定 16 ホスト）はいま `termsReviewed: false`。
   規約を人が読み、`build/data/cover-provider-policies.json` の該当 provider に
   `termsUrl` / `usageBasis` / `lastReviewedAt` を書いて `termsReviewed: true` にする。
   条件を満たせないものは `enabled: false` にして `npm run build`。
   完了判定: `node build/check-covers.mjs` の「利用条件が未確認の取得元」が 0 件。
   詳細は `docs/cover-policy.md` §6。

4. **実機での QA。** macOS Safari / iPhone Safari / iPad Safari / 実機 Firefox。
   確かめる項目は `docs/qa-report-template.md` の必須フロー 1〜9。
   とくに ①共有リンクを別端末で開いて同じルートが出るか ②`/progress/` の記録が
   ブラウザを閉じても残るか ③`/search/` を指で操作できるか。
   完了判定: `docs/qa-report-YYYY-MM-DD.md` の「実機での確認」表が埋まる。
   **個人の受験情報を screenshot やログに残さないこと。**

5. **KPI の実数を入れる。** Search Console / GA4 / AdSense を**同じ 28 日間**で
   エクスポートし、`private/kpi-input/` へ置いて
   `npm run import:kpi -- --start=YYYY-MM-DD --end=YYYY-MM-DD`。
   手順は `docs/kpi-import-guide.md`。
   完了判定: `docs/kpi-baseline.json` の値が `null` でなくなり、
   `docs/kpi-plan.md` の基準値欄が埋まる。

6. **書体の読み込み方針を決める。** CLS 0.216 の原因は Google Fonts の差し替え。
   `&display=swap` を `&display=optional` にすればほぼ 0 になるが、
   **初回訪問・回線が遅いときに指定の書体が出なくなる**（代替は Hiragino / Yu Gothic / Noto Sans JP）。
   完了判定: 変更後に `npm run audit:performance -- --runs=9 --path=/science/` の
   CLS 中央値が 0.10 以下。詳細は `docs/performance-report.md` §6。

7. **本番の性能を、信頼できる方法で測る。**
   この環境からの Lighthouse は外部通信が不安定で判断に使えなかった（上の「公開確認」）。
   `https://pagespeed.web.dev/` に `https://route-taizen.com/science/` を入れるか、
   Search Console の「ウェブに関する主な指標」で実際の訪問者の値を見る。
   完了判定: どちらかの数字を `docs/performance-report.md` へ追記する。
   （マージ後の公開状態そのものは `npm run check:production` で確認済み・19/19 通過）

8. **同意管理（CMP）の方針。** 未判断のまま（`README.md`）。
   Best Practices の残差は AdSense の第三者 cookie 1 件だが、
   **cookie 警告を消すためだけにサービスを削除しない。**
   CMP を入れるかどうかは対象地域と運営者の同意方針を確かめたうえでの判断。

## 既知の制約

1. **性能の目標 3 件が未達。** Performance 53（目標 80）/ LCP 10.99s（目標 4.0s）/
   CLS 0.216（目標 0.10）。原因は Google Fonts に特定済みで、次の一手は OWNER ACTION 6。
   **バイト予算（全科目 250,000 未満・理科 200,000 未満）は達成している。**

2. **`<style>` の外部化をしていない。** 実装指示書 §28.2 の想定と違う。
   実測でインライン `<style>` はネットワークの critical path に乗っておらず、
   外部化すると描画ブロックのリクエストが 1 本増える。理由は
   `docs/performance-report.md` §5.1。

3. **アセットの取得はタブ単位ではなく、初期表示のあとに 5 本まとめて。**
   実装指示書 §21 の表と違う。科目アプリは同期前提の 1 スコープで、タブ単位の遅延にすると
   7 本の app それぞれで描画の入口を書き換えることになる。LCP を決めているのは
   事前描画済みのカードと CSS なので、どちらでも同じ。アセットはファイル単位に
   分けてあるので、必要になればタブ単位へ進める。

4. **書影の `enabled` は「参照中」であって「確認済み」ではない。**
   実装指示書 §44 は未確認なら `enabled: false` としているが、そのとおりにすると
   1,390 冊ぶんの書影がいま全部消える。公開中の見た目を大きく変える判断なので
   運営者へ回した（OWNER ACTION 3）。`termsReviewed` を別に持たせてある。

5. **追加質問のうち 2 問を出していない。**「苦手分野 → 優先補強候補」と
   「学校教材との重複」は、人手で確かめた対応表がリポジトリに無い。
   分野名から教材を機械的に結び付けると推測になるので、質問そのものを出さない。

6. **localhost の値を本番の値として報告していない。** 性能・QA はすべて localhost。
   本番との突き合わせは OWNER ACTION 7。

7. **`npm run check:covers --live` と `npm run check:production` は必須ゲートにしていない。**
   ネットワークに依存し、外部障害で CI が赤くなり続けると本当の欠損に気づけなくなるため。
   週次と手動で流す。
