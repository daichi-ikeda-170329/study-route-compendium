# 未解決事項の対応状況

最終更新: 2026-09-05 / 対象 SHA: `dabdb86de0f201ecf8d8d26da1f7c9367d179552`（分岐元 `origin/main`）
実装指示書: `/Users/ikedadaichi/Downloads/ルート大全未解決事項実装指示書.md`
作業ブランチ: `fix/unresolved-items`

> **指示書のパスについて。** 依頼文では `~/Downloads/route-taizen-plan.md` と書かれていたが、
> 実ファイルは `~/Downloads/ルート大全未解決事項実装指示書.md` だった。Downloads 配下に他の候補が
> 無いため、こちらを指示書として扱う。文脈が切れたらこのパスから読み直す。

## チェックポイント

| CP | 名前 | 状態 | コミット | 証跡 | 備考 |
|---|---|---|---|---|---|
| S0 | 基準の固定と進捗台帳 | DONE | (このコミット) | `docs/baseline-2026-09-05.md` / `docs/perf/lighthouse-mobile-with3p-baseline-s0.json` | localhost が本番値を再現することを確認 |
| S1 | 公開物と main の一致 | DONE | (このコミット) | `build/check-production.mjs` / `docs/deployment-runbook.md` / `test/production-check.test.mjs` | Pages Source は 2026-09-04 に切替済み。本番検査 19/19 通過。Description 更新のみ OWNER ACTION |
| S2 | 科目データの読み書き口を 1 本化 | 未着手 | | | |
| S3 | 科目移行 前半（joho/shoron/math） | 未着手 | | | |
| S4 | 科目移行 後半（science/english/japanese/social） | 未着手 | | | |
| S5 | 性能予算の達成 | 未着手 | | | |
| S6 | 進捗管理 | 未着手 | | | |
| S7 | 任意の追加質問 | 未着手 | | | |
| S8 | 詳細検索 | 未着手 | | | |
| S9 | 書影の出所台帳 | 未着手 | | | |
| S10 | QA・Best Practices・KPI | 未着手 | | | |
| S11 | 最終検証と報告 | 未着手 | | | |

## 未解決事項 8 件との対応

| # | 事項 | 担当 CP | 状態 |
|---|---|---|---|
| 1 | 科目データの分離 | S1〜S5 | 進行中（S1 完了） |
| 2 | 進捗管理の拡張 | S6 | 未着手 |
| 3 | 任意の追加質問 | S7 | 未着手 |
| 4 | 検索の絞り込み拡張 | S8 | 未着手 |
| 5 | 書影の出所台帳 | S9 | 未着手 |
| 6 | 手動 QA | S10 | 未着手 |
| 7 | Best Practices 77 の原因分離 | S10 | 未着手 |
| 8 | KPI 基準値 | S10 | 未着手 |

## 次にやること（実行が切れたらここから再開する）

- S2 に着手する。`build/lib/load-subject-data.mjs`（科目データの唯一の読み書き口）を作り、
  §3.3 の 21 スクリプト・7 テストを `extractSubject()` から差し替える。**この時点では 1 科目も移さない。**
- その前に `test/affiliate-disclosure.test.mjs` を書いて、開示文の出力を先に固定する（指示書 §15.3）。

## OWNER ACTION（運営者しかできない。台帳で追跡する）

| # | 内容 | 必要な権限 | 手順 | 完了判定 | 状態 |
|---|---|---|---|---|---|
| 1 | GitHub リポジトリの Description が `参考書1,052冊` のまま（実際は 1,390 冊） | 対象リポジトリの admin | `gh repo edit daichi-ikeda-170329/study-route-compendium --description "大学受験の参考書を科目・目的別に整理し、学習ルートと進捗管理を提供する静的サイト"` | `gh repo view --json description` の出力に `1,052` が含まれない | 未実施 |
| 2 | GitHub リポジトリの Topics が未設定 | 同上 | `gh repo edit daichi-ikeda-170329/study-route-compendium --add-topic static-site --add-topic github-pages --add-topic education --add-topic japanese` | `gh repo view --json repositoryTopics` が `null` でない | 未実施 |

**1 と 2 は手元の `gh` に `repo` scope があるので技術的には実行できる。**
ただし公開リポジトリの外向き設定を変える操作なので、実行前に運営者の可否を確認する。
確認が取れたら実行し、この表を「実施済み」に書き換える。**確認前に「更新した」と書かない。**

## 引き継ぎメモ

### S0 で決めたこと

1. **`build/audit-performance.mjs` を S10 ではなく S0 で作った。**
   指示書は §51（S10）でこのスクリプトを作ることになっているが、S0 でも「測り方を固定した
   Lighthouse ベースライン」が要る。手打ちの `npx lighthouse` を S0 で使い S10 でスクリプト化すると、
   指示書 §3.1 の「同じ処理の入口を 2 つ作らない」に反し、S0 と S5/S10 で測り方がずれる。
   そこで S0 で作り、S10 では第三者遮断条件（`--block-third-party`）での再実行と報告に使う。
   スクリプトは既に `--block-third-party` を持っている。

2. **Lighthouse は 5 回流して中央値を採る（指示書 §7 の 3 回ではなく）。**
   3 回で測ったとき 1 run だけ LCP 23.32 秒・CLS 0 の外れ値が出た（第三者読み込みが詰まった run）。
   3 回だと外れ値が中央値の位置を動かすので 5 回に固定した。詳細は `docs/baseline-2026-09-05.md` §7。

3. **`build/audit-performance.mjs` は git を呼ばない。**
   `test/data-integrity.test.mjs` の「生成スクリプトが git のメタデータに依存していない」が
   `build/**` 全体の `spawnSync('git')` を禁じている（浅いクローンで生成物が環境依存になる事故の再発防止）。
   測定スクリプトも例外にせず、commit SHA は `--commit=` か `GITHUB_SHA` で受け取る。
   `package.json` の `audit:performance` が `git rev-parse HEAD` を渡す。
   **テストを緩めるのではなく、スクリプト側を規約に合わせた。**

4. **Lighthouse は localhost で測る。** 本番（`https://route-taizen.com/`）を毎回叩くと
   ネットワークとキャッシュで値がぶれ、改修の効果と切り分けられない。
   localhost 計測が本番の監査値（Performance 47 / Best Practices 77 / CLS 0.216）を再現したので
   （`docs/baseline-2026-09-05.md` §7）、比較は localhost で行い、本番との突き合わせは S10 で行う。
   **報告では必ず「localhost で測った」と書く。**

5. **Node は手元 v25.8.1 で作業する。** CI は 22 系。`build/*.mjs` は Node 標準 API しか使っておらず、
   22 と 25 で挙動が変わる箇所は見当たらない。CI（`test.yml`）が 22 で回るので、
   バージョン差で壊れるならそこで検出できる。

### S1 で決めたこと

1. **Pages Source の切替は `OWNER ACTION` ではなく完了済みとして扱う。**
   指示書 §10 は「まだ GitHub Actions ではない」を前提にしているが、README の
   「運営者が行う手動設定」に 2026-09-04 切替済みと書かれており、`npm run check:production` を
   本番へ流して 19 項目すべて通過することを実測した（`/package.json`・`/build/all.mjs`・
   `/README.md` などが 404）。指示書 §3 の「食い違ったら現行コードを正とする」に従う。

2. **`check-production.mjs` は必須ゲートにしない。**
   代わりに `test/production-check.test.mjs` が localhost に旧構成（リポジトリ直下配信）と
   新構成（`dist/` 配信）の 2 つを立て、**旧構成で終了コード 1 になること**を決定的に固定した。
   公開サイトへの HTTP は `.github/workflows/production.yml`（週次 + 手動）に置き、
   終了コード 2（未検査）では CI を赤くしない。

3. **README への引用 1 件を `count-ignore.json` に登録した。**
   OWNER ACTION の完了判定として、現在の GitHub Description（`参考書1,052冊`）を README に
   そのまま引用する必要がある。`apply-count.mjs` の `sweep()` がこれを「実データに無い冊数」として
   拾って `check:counts` が落ちたので、理由付きで登録した。**テストは緩めていない。**
   もう 1 件（`test/production-check.test.mjs` の `1,390冊`）は ignore に足さず、
   期待値を `count-state.json` から組み立てる形に書き直して解消した。

### 事実確認済みの前提（作業開始時に実測した）

- 総冊数 1,390。科目別 english 252 / japanese 192 / math 162 / science 373 / social 293 / joho 29 / shoron 89。
- `npm test` は build 後に 253 件 pass / fail 0 / skipped 0。
- `affiliateEnabled()` / `amazonEnabled()` はどちらも現在 `true`。
  科目 HTML から `CONFIG` を外すと黙って `false` になる（指示書 §3.4）。S2 でテストを先に置く。
- Best Practices 77 で落ちている audit は `third-party-cookies` と `inspector-issues` の 2 件。
