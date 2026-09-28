# 改修の現在地と、運営者の残作業

最終更新: 2026-09-29（状態は同日に `npm run check:covers`・`docs/kpi-baseline.json`・`docs/qa-report-2026-09-11.md` で照合）

2 つの改修はどちらも終わっている。この文書は**いま残っている運営者の作業（OWNER ACTION）の正本**と、
改修中に決めて今後も守る決め事だけを置く。チェックポイントごとの経緯・タスクごとのコミットと備考は
[`docs/archive/remediation-progress-history-2026-09-29.md`](archive/remediation-progress-history-2026-09-29.md) に移した。

## 完了した改修

| 改修 | 実施 | 最終報告 | 経緯（archive 内の節） |
|---|---|---|---|
| 未解決事項 8 件（チェックポイント S0〜S11） | 2026-09-05 | `docs/remediation-final-report-2026-09-05.md` | 「チェックポイント」「未解決事項 8 件との対応」「引き継ぎメモ」 |
| 改修仕様書 29 タスク（P0〜P4） | 2026-09-10〜11 | `docs/remediation-final-report-2026-09-11.md` | 「2026-09-10 改修仕様書の対応」（1 タスク 1 行、コミットと備考） |

## OWNER ACTION（運営者しかできない。**この表が正本**）

| # | 内容 | 完了判定 | 状態 |
|---|---|---|---|
| 1 | GitHub の Description を実態に合わせる | `gh repo view --json description` に `1,052` が出ない | **完了**（2026-09-05）。値は「大学受験の参考書を科目・目的別に整理し、学習ルートと進捗管理を提供する静的サイト」 |
| 2 | GitHub の Topics を設定する | `gh repo view --json repositoryTopics` が `null` でない | **完了**（2026-09-05）。`static-site` / `github-pages` / `education` / `japanese` |
| 3 | 書影の利用条件の確認 | `npm run check:covers` の「利用条件が未確認の取得元」が 0 件 | **完了**（運営者の確認は 2026-09-14、台帳への記入は 2026-09-20）。2026-09-29 の `check:covers` は未確認 0 件。根拠の条文・規約の URL は受け取っていないので `termsUrl` は空のまま（`docs/cover-policy.md` 6 節）。`ndl` は API 終了のため停止中 |
| 4 | 実機での QA（macOS/iOS/iPadOS Safari・実機 Firefox） | `docs/qa-report-YYYY-MM-DD.md` の「実機での確認」表が埋まる | **運営者が実施済み（2026-09-14 に確認）。結果の記入が残り。** `docs/qa-report-2026-09-11.md` の表は 4 行とも「未実施」のまま |
| 5 | KPI の実数を入れる（Search Console / GA4 / AdSense の管理画面） | `docs/kpi-baseline.json` の値が `null` でなくなる | **未実施。** 2026-09-29 時点で `null` が 14 個残る。手順は `docs/kpi-import-guide.md`（管理画面の値を手で写した記録は `docs/kpi-snapshots.md` にある） |
| 6 | 書体の読み込み方針 | — | **判断は不要になった。** `display=optional` は効かないと実測で確定し、代わりに Google Fonts のスタイルシートを非同期化した（`docs/performance-report.md` 2.1・5.2） |
| 7 | 実利用者の性能を見る | Search Console の Core Web Vitals（CrUX）の値を `docs/performance-report.md` へ記録する | **一部完了。** CLS は 2026-09-08 に目標 0.10 を達成（localhost 0.004。`docs/performance-report.md` 9 節）。LCP と Performance は Lighthouse の推定値で未達。**実利用者の値（CrUX）を見る作業が残る** |
| 8 | 同意管理（CMP）の方針 | — | **未判断。** Consent Mode v2 の既定値は 2026-09-11 に導入済み（`build/lib/parts.mjs` の `CONSENT_DEFAULT`）。EEA からのアクセスは 28 日で 12 ユーザー・全体の 0.04%（`docs/growth-plan-2026-09-18.md` 6.2）。Best Practices の残差は AdSense の第三者 cookie 1 件 |

## 改修中に決めて、今後も守ること

理由と実測は archive の「引き継ぎメモ」の該当チェックポイントにある。

- **Lighthouse は localhost で、5 回以上流した中央値を使う。** 3 回だと外れ値 1 つで中央値が動いた。報告には必ず「localhost で測った」と書く（S0）
- **`build/` のスクリプトは git を呼ばない。** `test/data-integrity.test.mjs` が禁じている（浅いクローンで生成物が環境依存になるのを防ぐ）。commit SHA が要るときは `--commit=` か `GITHUB_SHA` で受け取る（S0）
- **vm で実行して得た配列を `assert.deepStrictEqual` で比べない。** 別 realm の prototype を持つので、中身が同じでも落ちる。キー順を揃えた JSON 文字列で比べる（S2）
- **E2E は `waitForApp()` で描画を待ってから操作する。** 科目データは fetch のあとに描くので、`domcontentloaded` の直後はまだ描画途中（S4・S6）
- **進捗・追加回答・インポート内容は端末の中だけに置き、解析イベントを足さない**（S6）
- **追加質問に「苦手分野」「学校教材との重複」を入れない。** 人が確かめた対応表がリポジトリに無く、機械的に結び付けると推測になる。対応表を `build/data/` に置けば足せる形にしてある（S7）
- **書影の取得元は「参照しているか（`enabled`）」と「人が規約を読んだか（`termsReviewed`）」を分けて持つ**（S9。`docs/cover-policy.md`）
- **Lighthouse の `--blocked-url-patterns` はカンマ区切りの 1 引数にしない。** 「カンマを含む 1 個のパターン」と解釈され、何も遮断されない（S10）
