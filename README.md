# ルート大全

大学受験の参考書 1,390 冊を科目別に図鑑化し、志望校から逆算した参考書ルートを提示する無料サイト。

公開 URL: https://route-taizen.com/
リポジトリ: https://github.com/daichi-ikeda-170329/study-route-compendium

## 概要

英語・国語・数学・理科・社会の 5 科目それぞれについて、市販の参考書を難易度・役割・接続関係で整理した「参考書図鑑」と、志望校と現在地から組み立てる「参考書ルート」を提供する。情報・小論文の 2 科目は参考書図鑑と 1 冊ごとの詳細ページだけを持つ（`build/lib/extract.mjs` の `SUBJECTS` で `catalogOnly: true`）。

サイトは 2 層でできている。

- **科目トップ**（`<科目>/index.html`）— 1 枚の HTML の中で図鑑・ルート・診断・学習ガイドを切り替える。HTML は markup と事前描画（`build/prerender-tops.mjs`）だけで、描画コードは `assets/js/subject-<科目>.js`、CSS は `assets/css/subject-<科目>.css`。データは `assets/js/subject-loader.js` が配信用の JSON を取ってから描く
- **生成ページ**（書籍・志望校別ルート・大学別・記事・学習ガイド・信頼性ページほか）— `data/subjects/<科目>/` を正本として `build/` のスクリプトが出力する。**手で編集しない**

収益はページ内の書籍リンク（Amazon アソシエイト・楽天アフィリエイト）と Google AdSense による。

## 収録数とページ数

| 科目 | ディレクトリ | 収録冊数 |
|---|---|---|
| 英語 | `english/` | 252 |
| 国語 | `japanese/` | 192 |
| 数学 | `math/` | 162 |
| 理科 | `science/` | 373 |
| 社会 | `social/` | 293 |
| 情報 | `joho/` | 29 |
| 小論文 | `shoron/` | 89 |
| 合計 | — | 1,390 |

冊数は `data/subjects/<科目>/books.json` のレコード数で、`npm run check:counts`（`build/apply-count.mjs --check`）が
ポータル・科目トップ・この表との一致を確かめる。公開ページ数は `sitemap.xml` の `<loc>` の数
（`grep -c "<loc>" sitemap.xml` で数える。2026-09-11 時点で 1,751）。

## ディレクトリの要点

| パス | 中身 | 編集 |
|---|---|---|
| `data/subjects/<科目>/` | **科目データの正本**（書籍・ルート・大学・学習ガイド・段・設定・重点対策） | 手で編集 |
| `build/data/` | 台帳（大学の slug と出典・年度表記・冊数の前回値・更新日・OGP のハッシュなど） | 台帳ごとに決まっている |
| `build/` | 生成・検査のスクリプト。入口は `build/all.mjs` だけ | 手で編集 |
| `build/content/` | 記事と信頼性ページの本文 | 手で編集 |
| `index.html` / `404.html` | ポータルと 404 | markup は手で編集（書き込み区間は触らない） |
| `<科目>/index.html` | 科目トップの markup | 同上 |
| `assets/js/`・`assets/css/`・`assets/site.css` | 科目トップの描画コード・共有・検索・比較・画像書き出しなど | 手で編集 |
| `assets/generated/` | 科目データの配信用 JSON・検索索引 | 生成 |
| `<科目>/books/`・`<科目>/routes/`・`<科目>/guides/`・`univ/`・`guides/`・`compare/`・`new/` ほか | 生成ページ | 生成（手で編集しない） |
| `test/` / `e2e/` | ユニットテスト / E2E とアクセシビリティ | 手で編集 |
| `docs/` | 設計・運用・調査の記録 | 手で編集 |
| `dist/` | 公開用の写し（`pages.yml` がこれだけを配信する） | 生成 |

全体の一覧と各スクリプトの役割は `docs/architecture.md`。

## ビルドと検査

入口はひとつ。順序は `build/all.mjs` が持つので、個々のスクリプトを手で並べない。

```bash
npm ci
npm run build              # データ検証 → 生成 → 冊数 → sitemap → OGP → 公開用 dist/
npm run build -- --no-ogp  # OGP 画像を飛ばす
npm run check:generated    # 生成せずに、ずれているかだけ見る
```

データを変えたら**差分が出なくなるまで流す（通常 2 回）**。1 回目で科目トップが変わると、2 回目で一覧の更新日が動く。

push の前に流すもの。

```bash
npm run check:data         # データの形・ISBN・出典台帳（生成の前の関門）
npm test                   # ユニットテスト（test/*.test.mjs）
npm run check:site         # データと出力 HTML の検査
npm run check:counts       # 収録冊数
npm run test:e2e           # E2E とアクセシビリティ（320/375/768/1366px。UI を触ったとき）
```

手元で見るときは `npm run serve`（HTTP で配信する。`file://` では確かめない）。
各テストが何を見ているかと流すタイミングは `docs/testing.md`。

## データの正本と読み口

- 科目データの正本は **`data/subjects/<科目>/` の JSON だけ**（`books.json` `routes.json` `universities.json` `guides.json` `stages.json` `config.json`、英語だけ `focus.json`）
- 読み口は **`build/lib/load-subject-data.mjs` の `loadSubjectData(ROOT, dir)` の 1 本**。生成もテストもここを通す
- 形の検査は `build/lib/validate-subject-data.mjs`（`npm run check:data`）。配信用は `build/lib/subject-assets.mjs` が作る
- 項目の一覧・型・値の読み方は `docs/data-model.md`

## ドキュメント

| ファイル | 内容 |
|---|---|
| `docs/architecture.md` | ディレクトリ・ビルドの手順と順序・生成スクリプト・記事の記法・大学別ページ・検索・科目トップの静的化 |
| `docs/data-model.md` | データファイルの項目と型・難易度の並びとスケール・シリーズ・書影・書名と著者名 |
| `docs/operations.md` | 更新手順・冊数の整合・新刊・アフィリエイト・AdSense・X・OGP・IndexNow・DNS・外部サービス |
| `docs/sharing.md` | 共有 URL のスキーマ・`v` の運用・保存データ・進めるペース |
| `docs/testing.md` | テストの一覧と流すべきタイミング・`check-site.mjs` の検査項目 |
| `docs/deployment-runbook.md` | 配信の反映・切り分け・切り戻し・Search Console へのサイトマップ送信 |
| `docs/style-guide.md` | 文章のスタイルガイド（`check-site.mjs` が一部を機械で検査する） |
| `docs/data-quality.md` | データ品質レポート（生成物） |
| `docs/remediation-progress.md` | 改修の進捗と、決めたこと |
| `CONTRIBUTING.md` | 変更の進め方 |

## 運営者が行う手動設定

コードでは完結しない作業。**やっていないものを「やった」と書かない。**

### GitHub Pages の配信元（切り替え済み）

`.github/workflows/pages.yml` が作る `dist/` だけを配信している。
2026-09-04 に切り替わったことを本番で確認済み。

配信の反映待ち・切り分け・切り戻しの手順は **`docs/deployment-runbook.md`** にまとめてある。
公開状態は `npm run check:production` で機械的に確かめる（終了コード 0 = 一致 / 1 = 食い違い /
2 = 未検査。**2 を成功として扱わない**）。

```
https://route-taizen.com/               200
https://route-taizen.com/package.json   404
https://route-taizen.com/build/all.mjs  404
https://route-taizen.com/test/…         404
```

以前はリポジトリ直下がそのまま配信されていて、本番から `build/`・`test/`・
`data/_backup/`・`package.json` を取得できた。

**切り戻すとき**は Settings → Pages → Build and deployment → Source を
「Deploy from a branch」に戻す。ただしその瞬間からリポジトリ直下が
再び全部公開されるので、戻すのは配信が止まったときの緊急手段に限る。

**やり直すとき**の順番（一度きりの手順だが、環境を作り直す場合のために残す）。

1. `pages.yml` が入った状態で main へ push する（この時点では配信先は変わらない）
2. Actions タブで「Pages 公開」が成功していることを確かめる
3. Settings → Pages → Build and deployment → Source を **GitHub Actions** に変える
4. 数分後、上の 404 になるべき URL が 404 を返すことを確かめる

**2 を確かめる前に 3 をやらない。** workflow が失敗する状態で Source を変えると、
配信が止まる。

### Google Search Console

未登録の理由ごとの読み方（どれがこちらの不備で、どれが待つだけか）は
`docs/search-console-indexing.md` にまとめてある。**件数を見て慌てる前にそちらを読む。**

- [ ] 所有権の確認（DNS の TXT か、`2d7e64a…txt` のファイル）
- [ ] `https://route-taizen.com/sitemap.xml` を送信（**コードでは代替できない手作業**。手順は `docs/deployment-runbook.md` の「Search Console にサイトマップを送信する」。IndexNow は `pages.yml` がデプロイ後に自動で送る）
- [ ] カバレッジで index 登録の状況と、除外の理由を確認
- [ ] 「ページにリダイレクトがあります」に出ている URL を書き出し、
      `docs/search-console-indexing.md` の 3 種類のどれかを判定する
      （`http://` と `www.` はホスト正規化。**正しい状態なので消さない**）
- [ ] 主要クエリの表示回数・CTR・平均掲載順位をページ単位で確認
- [ ] リッチリザルト検査で、書籍ページのパンくずと `Book` を確認
- [ ] 数値を `docs/kpi-snapshots.md` へ**期間つきで**記録（**推測で埋めない**。
      28 日集計 CSV から取り込む場合だけ `npm run import:kpi`）
- [ ] 実測した件数を `docs/search-console-indexing.md` の「4. 実測の記録」へ 1 行足す

### Google アナリティクス 4

- [ ] イベントが `docs/analytics-events.md` の表と一致しているか確認
- [ ] データ保持期間の設定を確認
- [ ] Google シグナルを使うかどうかを判断（使うと収集範囲が広がる）

### Google AdSense

- [ ] **自動広告の除外設定。** 3 分診断の質問画面・重要な注意書き・保存の操作・
      結果の最重要部分に広告を入れない。管理画面の「広告」→「サイトごと」から
      除外する領域を指定する。コードからは指定できない
- [ ] RPM と viewability を確認し、CLS・診断完了率と突き合わせる

### 同意管理（CMP）

- [ ] 欧州経済領域・英国・スイスからのアクセスがあるかを GA4 で確認
- [ ] ある場合、Google 認定 CMP と Consent Mode v2 の設定が要る（AdSense の
      管理画面から設定する）。**法令上どこまで必要かは運営者の確認事項**として
      未判断のままにしてある

### リポジトリの説明

**実施済み（2026-09-05）。** それまでの Description は
`ルート大全 — 大学受験の参考書1,052冊を科目別に図鑑化・ルート化した無料サイト` で、
実際の 1,390 冊と食い違っていた。これはサイトの生成物ではなく GitHub の設定なので、
`npm run build` では直らない。冊数を書かない文面に変え、Topics も併せて設定した
（2026-09-08 に `gh repo view` で反映を再確認済み。Topics は
`education` / `github-pages` / `japanese` / `static-site` の 4 つ）。

- [x] Description と Topics を実態に合わせた（実行したコマンドと完了判定は `docs/operations.md` の「リポジトリの説明」）。

### ライセンス

- [ ] このリポジトリにライセンスは指定されていない（2026-09 時点）。
      追加するかどうかは権利者の判断。**こちらでは決めない**

### 連絡先

- [ ] 公開の連絡先メールアドレスは用意していない。セキュリティ上の報告は
      GitHub Security Advisory へ案内している（`SECURITY.md`）。
      公開の連絡先を作るかどうかは運営者の判断
