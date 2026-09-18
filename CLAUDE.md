# ルート大全 — Claude Code 向けの入口

大学受験の参考書図鑑と参考書ルートを提供する静的サイト（GitHub Pages で公開）。
**手引きの正本は [README.md](README.md) と [CONTRIBUTING.md](CONTRIBUTING.md)。** ここには入口と、事故になりやすい点だけを置く。規則をここに書き足さない。

| 知りたいこと | 正本 |
|---|---|
| 構成・ビルド手順・運営者の手動設定 | [README.md](README.md) |
| 変更の進め方・出典の基準・コミットの単位 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| ディレクトリとスクリプトの役割 | `docs/architecture.md` |
| データ項目と型 | `docs/data-model.md` |
| テストの一覧と流すタイミング | `docs/testing.md` |
| 配信の反映・切り分け・切り戻し | `docs/deployment-runbook.md` |
| 文章のスタイル | `docs/style-guide.md` |
| 検索順位の改善 | `.claude/skills/seo-rank-watch/` |

## 最初に守ること

- **データの正本は `data/subjects/<科目>/` の JSON だけ。** 生成ページ（`<科目>/books/`・`univ/` など）と手書き HTML の書き込み区間は手で直さず、データかスクリプトを直して再生成する
- **生成の入口は `npm run build` 1 本。** データを変えたら差分が出なくなるまで流す（通常 2 回）。生成物はコミットする（CI が最新かを差分で確かめる）
- **push の前に流す:** `npm run check:data` → `npm test` → `npm run check:site` → `npm run check:counts`。UI を触ったら `npm run test:e2e` も。手元の確認は `npm run serve`（`file://` では確かめない）
- **推測で埋めない。** 分からない値は `null`、確認状態は `unverified` のまま。出典 URL と確認日の両方が無いものを `verified` にしない
- **`main` へ push するとそのまま公開される。** 公開状態は `npm run check:production` で確かめる（終了コード 2 を成功扱いしない）
- 収益・順位・アクセスの CSV は `private/` に置き、コミットしない
- 内容ごとにコミットを分ける（誤情報の修正・アクセシビリティ・データ構造・SEO・CI・文書を 1 つに混ぜない）

コードと文書が食い違ったらコードが正。気づいた側が文書を直す。
