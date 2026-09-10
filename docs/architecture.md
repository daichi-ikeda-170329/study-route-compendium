# アーキテクチャ

> 2026-09-11 に README から移した（README を概要と入口だけにするため。改修仕様書 5.1）。移すときに、科目データを科目トップの HTML の `<script>` から読んでいた時代（2026-09-05 まで）の記述と、「科目トップは手で編集する単一 HTML の SPA」という記述を、現在の仕組み（データは `data/subjects/`、描画コードは `assets/js/subject-<科目>.js`、HTML は markup と事前描画）に書き換えた。

## ディレクトリ構成

| パス | 用途 | 編集方法 |
|---|---|---|
| `index.html` | ポータル。7 科目への入口・FAQ・法定表記 | 手で編集 |
| `<科目>/index.html` | 科目トップの markup。図鑑・志望レベル一覧・講師ルート・学習ガイドの見出し・利用上の注記・フッターのリンクは `build/` が書き込む | markup は手で編集（書き込み区間は触らない） |
| `<科目>/books/index.html` | 参考書一覧（役割別・難易度順） | 生成 |
| `<科目>/osusume/index.html` | 参考書おすすめ（ルート採用回数順） | 生成 |
| `<科目>/books/<id>/index.html` | 参考書 1 冊の詳細ページ | 生成 |
| `<科目>/routes/index.html` | 志望レベル一覧 | 生成 |
| `<科目>/routes/<tier>/index.html` | 志望レベル別ルート | 生成 |
| `<科目>/guides/index.html` | その科目の記事一覧（ジャンルで区切る） | 生成 |
| `<科目>/guides/<slug>/index.html` | 解説記事 | 生成 |
| `guides/index.html` | ジャンルの入口 | 生成 |
| `guides/<ジャンル>/index.html` | ジャンル別の記事一覧（科目をまたぐ） | 生成 |
| `guides/<slug>/index.html` | 科目に属さない解説記事 | 生成 |
| `univ/index.html` | 志望校から探す（大学 160 校の一覧） | 生成（`generate-universities.mjs`） |
| `univ/<slug>/index.html` | 大学 1 校の全科目まとめ（出題形式・目標偏差値・参考書ルート・過去問） | 同上 |
| `about/index.html` | 運営者情報 | 生成（`generate-legal.mjs`） |
| `methodology/index.html` | データの作り方（難易度・到達目安・学習時間の算出方法） | 同上 |
| `privacy/index.html` | プライバシーポリシー | 同上 |
| `disclaimer/index.html` | 免責事項 | 同上 |
| `ads/index.html` | 広告について | 同上 |
| `changelog/index.html` | 更新履歴（git のコミット履歴から自動集計） | 同上 |
| `404.html` | 404 ページ | 手で編集 |
| `assets/site.css` | 生成ページ共通のスタイル | 手で編集 |
| `assets/js/share.js` | 3分診断の結果共有・保存と、ルート画面の共有。診断を持つ 5 科目の科目トップから読み込む | 手で編集 |
| `assets/js/search.js` | 全ページ共通の参考書検索。ヘッダーの検索ボックスを動かす | 手で編集 |
| `assets/js/book-index.js` | 検索が引く 1,390 冊の索引 | 生成 |
| `assets/js/pace.js` | ルート画面の進めるペース（いつまでに何を終えるか） | 手で編集 |
| `assets/ogp.png` / `assets/ogp-<科目>.png` | OGP 画像（サイト共通 + 7 科目）。冊数はデータから流し込む | 生成（`gen-ogp.mjs`） |
| `assets/ogp/<科目>/<id>.png` | 参考書 1 冊ごとの OGP 画像 1,390 枚 | 同上 |
| `assets/x-icon.svg` / `.png` | X のプロフィール画像（400×400） | SVG を手で編集し PNG を書き出す |
| `assets/x-header.svg` / `.png` | X のヘッダー画像（1500×500） | 同上 |
| `favicon.svg` | ファビコン | 手で編集 |
| `sitemap.xml` | サイトマップ | 生成 |
| `robots.txt` | クローラー設定 | 手で編集 |
| `ads.txt` | AdSense の販売者宣言。ID を設定したときだけ存在する | 生成（`apply-adsense.mjs`） |
| `package.json` / `package-lock.json` | **OGP の生成にだけ使う**開発用の依存（`@resvg/resvg-js`・`sharp`）。サイト本体は Node 標準だけで動く | 手で編集 |
| `.nojekyll` | GitHub Pages の Jekyll 処理を無効化 | — |
| `build/` | 生成スクリプト | 手で編集 |
| `build/lib/ads.mjs` | Google AdSense の ID・広告枠。広告の出力はここ 1 か所で決まる | `apply-adsense.mjs` が書き換える |
| `build/lib/flow.mjs` | 役割どうしの接続表。「次に進む本」の生成はここが正本 | 手で編集 |
| `build/lib/route-hours.mjs` | ルート 1 本ぶんの冊数と想定学習時間の集計。記事の表はここから作る | 手で編集 |
| `build/lib/scale.mjs` | 難易度 10 段階の定義と、その表示コンポーネント | 手で編集 |
| `build/lib/series.mjs` | 複数の巻を 1 レコードで扱っている本の判定 | 手で編集 |
| `build/lib/words.mjs` | 禁止語・要注意語の一覧。`docs/style-guide.md` 2 節と同じものを持つ | 手で編集 |
| `build/lib/updated.mjs` | 最終更新日。レコードの中身が変わった日を台帳で持つ | 手で編集 |
| `build/apply-search-style.mjs` | 検索ボックスの CSS を `search.js` の `STYLE` から `site.css` と手書き HTML 9 枚へ配る | 手で編集 |
| `build/apply-book-text.mjs` | `data/_rewrite/` の説明文を `data/subjects/<科目>/books.json` に流し込む | 手で編集 |
| `build/gen-ogp.mjs` | OGP 画像の生成。`--check` でデータとのずれを落とす | 手で編集 |
| `build/ogp/` | OGP の SVG テンプレートと、ラスタライズに使うフォントの用意 | 手で編集 |
| `build/.cache/fonts/` | OGP に使うフォント（Google Fonts から取る）。`.gitignore` 済み | 生成（触らない） |
| `build/content/legal.mjs` | 信頼性ページの本文 | 手で編集 |
| `build/data/authors.json` | 著者名（openBD・国立国会図書館サーチ由来・実在確認済み 342 冊分） | 生成（`fetch-authors.mjs`） |
| `build/data/record-dates.json` | 各レコードの中身が最後に変わった日。最終更新日の台帳 | 生成（触らない） |
| `build/data/ogp-hashes.json` | OGP の SVG のハッシュ台帳。変わった画像だけを書き出すために持つ | 生成（触らない） |
| `build/data/jis-kanji.txt` | JIS X 0208/0213 にある CJK 文字の一覧。簡体字の混入検出に使う | 生成（作り直し方は `check-site.mjs` のコメント） |
| `data/_backup/` | 説明文を大きく書き換える前のスナップショット | 生成（`data/_backup/README.md` を参照） |
| `data/_rewrite/` | 書き換え後の説明文。`build/apply-book-text.mjs` が流し込む入力 | 手で編集 |
| `docs/style-guide.md` | 文章のスタイルガイド。`check-site.mjs` がこの一部を機械で検査する | 手で編集 |
| `build/data/aliases.json` | 参考書のあだ名（「ネクステ」など）。検索の索引に混ぜる | 手で編集 |
| `build/data/university-slugs.json` | 大学別ページの URL スラッグ台帳。**公開後に slug を変えない** | 手で編集 |
| `build/data/new-books.json` | 掲載を承認した新刊。ここに残っている数が「評価の残作業」 | 手で編集 |
| `build/data/publishers.json` | 新刊を調べに行く出版社と URL。`name` は `BOOKS[].pub` と一致させる | 手で編集 |
| `build/data/count-state.json` | 前回書き込んだ冊数。置換対象を一意に決めるために持つ | 生成（`apply-count.mjs`） |
| `build/data/count-ignore.json` | 冊数ではないと確認した「◯◯◯冊」。`apply-count.mjs` の走査を黙らせる | 手で編集 |
| `test/` | 共有・保存・検索・ペース・新刊・スタイルガイドのテスト。`node --test` で実行する | 手で編集 |
| `docs/x-posts/` | X の投稿案。`YYYY-MM.md` に新刊調査の手順・カレンダー・本文が全部入る | 生成（`gen-x-posts.mjs`） |
| `docs/` | 機能ごとの実装計画と調査記録 | 手で編集 |
| `.github/workflows/test.yml` | push のたびにテストと `check-site.mjs`・`prerender-tops.mjs --check` を流す | 手で編集 |
| `.github/workflows/counts.yml` | push のたびに冊数の整合を取り、直せないずれでジョブを落とす | 手で編集 |
| `.github/workflows/links.yml` | 週 1 回、書影と商品ページの生存を確認する（落とさない） | 手で編集 |
| `.github/workflows/x-posts.yml` | 毎月 1 日に X の投稿案を生成してコミットする | 手で編集 |

科目トップの内部構造は 5 科目で共通で、次の要素を同じクラス名で持つ。情報・小論文はこのうち `.view` が「ホーム」と「図鑑」の 2 つだけになる。

- `.pr-bar` — アフィリエイト広告の明示（景品表示法のステマ規制対応）
- `.xbar` — 科目切り替えバー。全ページ相互リンクの起点
- `.view` — ホーム / 図鑑 / ルート / 診断 / 学習ガイドの各画面
- `.rt-search` — 全ページ共通の参考書検索。ヘッダーの中に置く
- `.cat-index` — 生成ページ（一覧・ルート）への導線バナー
- `.foot-subjects` — フッターの他科目リンク
- `.foot-links` — 信頼性ページ（`/about/` `/methodology/` `/privacy/` `/disclaimer/` `/ads/` `/changelog/`）への静的リンク

## ビルド

**入口はひとつ。** 順序は `build/all.mjs` が持つので、個々のスクリプトを手で並べない。

```bash
npm ci
npm run build          # データ検証 → 各種生成 → 件数 → sitemap → 公開用 dist/
npm run check:generated  # 生成せずに、ずれているかだけ見る
npm run build -- --no-ogp  # OGP 画像を飛ばす（依存パッケージが要るため）
```

`npm run build` が流すもの（この順序に意味がある）。

| 順 | ステップ | スクリプト |
|---:|---|---|
| 1 | データ検証 | `build/check-data.mjs` |
| 2 | 科目データの形 | `build/snapshot-subject-data.mjs` |
| 3 | 年度表記 | `build/apply-site-meta.mjs` |
| 4 | 検索ボックスの CSS | `build/apply-search-style.mjs` |
| 5 | 手書き HTML のフッター | `build/apply-footer.mjs` |
| 6 | 書籍ページ | `build/generate-books.mjs` |
| 7 | 索引・おすすめ | `build/generate-index.mjs` |
| 8 | おすすめ | `build/generate-picks.mjs` |
| 9 | 志望校別ルート | `build/generate-routes.mjs` |
| 10 | 大学別ページ | `build/generate-universities.mjs` |
| 11 | 解説記事 | `build/generate-articles.mjs` |
| 12 | 学習ガイドの静的ページ | `build/generate-guides-static.mjs` |
| 13 | 法務・信頼性ページ | `build/generate-legal.mjs` |
| 14 | 学習の記録ページ | `build/generate-progress.mjs` |
| 15 | 科目の配信アセット | `build/generate-subject-assets.mjs` |
| 16 | 書影の出所台帳 | `build/generate-cover-ledger.mjs` |
| 17 | 検索の絞り込み索引 | `build/generate-search-facets.mjs` |
| 18 | 詳細検索ページ | `build/generate-search-page.mjs` |
| 19 | 2 冊比較ページ | `build/generate-compare.mjs` |
| 20 | 新刊・評価準備中の一覧 | `build/generate-new.mjs` |
| 21 | 検索インデックス | `build/generate-search.mjs` |
| 22 | 科目トップの事前描画 | `build/prerender-tops.mjs` |
| 23 | 収録冊数 | `build/apply-count.mjs` |
| 24 | sitemap | `build/generate-sitemap.mjs` |
| 25 | データ品質レポート | `build/report-data-quality.mjs` |
| 26 | OGP 画像 | `build/gen-ogp.mjs` |
| 27 | 公開用 dist/ | `build/build-public.mjs` |

**`generate-sitemap.mjs` は生成のあと**。lastmod を各ページの `<time datetime>` から拾うので、
先に流すと 1 世代古い日付が入る。**`prerender-tops.mjs` は `generate-*` のあと**で、
科目トップに書き込む内容は `BOOKS` / `ROUTES` から作り直す。

### 公開されるのは `dist/` だけ

`build/build-public.mjs` が**許可リスト**で拾って `dist/` を作る。禁止リストにすると
「新しく置いたものが既定で公開される」ので、足し忘れが事故になる。許可リストなら
足し忘れは「公開されない」で終わる。`build/`・`test/`・`e2e/`・`docs/`・`data/`・
`package.json`・`README.md` は公開されない。検査は `node --test test/dist.test.mjs`。

参考書を足したときは、生成の**前**に新刊を注入する。

```bash
node build/apply-new-books.mjs    # 承認済みの新刊を科目 HTML に注入（生成の前）
```

著者名を取り直すときだけ、外部の書誌データベースに照会する（数十分かかる）。

```bash
node build/fetch-authors.mjs           # openBD と国立国会図書館サーチから取り直す
node build/fetch-authors.mjs --no-ndl  # openBD だけ（速いが取れる数が減る）
```

`build/apply-adsense.mjs` は AdSense の ID を全ページへ反映するもので、生成物には触らない
（「[Google AdSense](operations.md#google-adsense)」の節を参照）。

`build/check-links.mjs` は書影と商品ページの生存を外部へ問い合わせる。**押すたびに数千件の
リクエストが飛ぶので、通常のビルドには含めない**（週 1 回 `.github/workflows/links.yml` が流す）。

`build/gen-ogp.mjs` は OGP 画像を作る。**このリポジトリで唯一、依存パッケージを使う**
（`@resvg/resvg-js`・`sharp`。`npm ci` で入る）。作り直す必要があるのは冊数・書名・役割・
難易度・到達目安が変わったときで、`--check` が作り忘れを落とす（「[OGP 画像](operations.md#ogp-画像)」を参照）。

```bash
npm ci                              # 初回だけ
node build/gen-ogp.mjs              # 共通 1 枚 + 科目別 7 枚 + 書籍別 1,390 枚
node build/gen-ogp.mjs --subjects   # 科目別と共通だけ
node build/gen-ogp.mjs --books      # 書籍別だけ
node build/gen-ogp.mjs --check      # データとずれていれば終了コード 1 で落ちる
```

`build/apply-book-text.mjs` は `data/_rewrite/` に置いた説明文を `data/subjects/<科目>/books.json` へ
流し込むもので、**説明文を一括で書き換えるときだけ**使う。通常のビルドには含めない。
`--check` で件数だけを確認でき、科目名を引数に渡すとその科目だけを処理する。

```bash
node build/apply-book-text.mjs --check   # 対象の件数だけを出して書き込まない
node build/apply-book-text.mjs           # 全科目に流し込む
node build/apply-book-text.mjs english   # 科目を絞る
```

`build/gen-x-posts.mjs` は X の投稿案を作るもので、サイトの生成物とは無関係。
上の一括再生成には含めない（「X アカウント」の節を参照）。

`build/gen-x-posts.mjs` は新刊調査の手順と F 型（新刊速報）も同じファイルに出す
（「新刊の掲載」の節を参照）。

科目データ（`data/subjects/<科目>/` の `books.json` や `routes.json`）を編集したら、`generate-sitemap.mjs` を含めて全部を流し直す。生成物はリポジトリにコミットする（GitHub Pages はビルドを実行しないため）。

`generate-books.mjs` は科目名と id を引数に取れる。1 件だけ確認したいときに使う。

```bash
node build/generate-books.mjs math ao
```

### 生成スクリプトの構成

| ファイル | 役割 |
|---|---|
| `build/lib/extract.mjs` | 科目の一覧（`SUBJECTS`）・分野名（`SUB_LABELS`）・`ORIGIN` などの定数と、`esc` / `clip` の道具。科目データの読み口ではない |
| `build/lib/load-subject-data.mjs` | **科目データの唯一の読み口**（`loadSubjectData(ROOT, dir)`）。`data/subjects/<科目>/` の JSON を読み、形を検査する |
| `build/lib/parts.mjs` | `<head>`・ヘッダー・フッター・パンくず・JSON-LD の共通パーツ |
| `build/lib/cover.mjs` | 書影の候補 URL と、一覧・ルートに並べる小さな書影のマークアップ |
| `build/lib/cards.mjs` | 参考書 1 冊のカード（`.bcard`）。一覧・書籍ページ・解説記事で共有する |
| `build/lib/newbooks.mjs` | 新刊（評価が未了の本）の判定と並び順。**サイト全体でこの判定だけを根拠にする** |
| `build/lib/rank.mjs` | 難易度順の比較子。実装は `assets/js/subject-common.js` にあり、科目トップと同じ関数を読んで出す（「[難易度順の並び](data-model.md#難易度順の並び)」を参照） |
| `build/lib/flow.mjs` | 役割どうしの接続表。「次に進む本」で役割が飛ばないようにする |
| `build/lib/scale.mjs` | 難易度 10 段階の定義と表示。数字の意味はここ 1 か所で決まる |
| `build/lib/series.mjs` | 複数の巻を 1 レコードで扱っている本の判定 |
| `build/lib/updated.mjs` | 最終更新日。git のコミット日と、レコード単位のハッシュ台帳 |
| `build/content/articles.mjs` | 解説記事の本文 |
| `build/content/article-categories.mjs` | 解説記事のジャンル（`/guides/<ジャンル>/` の正本） |
| `build/content/legal.mjs` | 信頼性ページの本文 |

`ROUTES` の階層は、ルートを持つ 5 科目で共通で `ROUTES[志望レベル][トラック][方針]`。トラックだけが科目で違う（英語・数学は `bun`/`ri`、国語は `gendai`/`kobun`/`kanbun`、理科は `butsuri`/`kagaku`/`seibutsu`/`chigaku`、社会は `nihonshi`/`sekaishi`/…）。

志望レベルの直下には、トラックのほかに次のキーが入ることがある。トラックとして扱わないので、増やすときは `generate-routes.mjs` の `NON_TRACK` にも足す。

| キー | 意味 |
|---|---|
| `para` | 並行して進める本。トラックごとの辞書、または全トラック共通の配列 |
| `final` | 最後の仕上げ。同上 |
| `basic` | 理科基礎（文系・共テのみ）のルート。理科の `kyote` だけが持ち、科目トップでのみ使う |

### 記事のジャンル

記事は 6 つのジャンルに分かれ、`build/content/article-categories.mjs` がその正本になる。記事 1 本ごとに `category` を必ず持たせる（持たない記事はビルドが止まる）。

| ページ | 中身 |
|---|---|
| `/guides/` | ジャンルの入口。どのジャンルに何本あるかだけを見せる |
| `/guides/<ジャンル>/` | そのジャンルの記事を科目をまたいで集める |
| `/<科目>/guides/` | その科目の記事をジャンルで区切って並べる |

ジャンル id は URL の一部になるので、次の 2 つを守る。どちらもビルド時に検出できないもの（後者）を含むので、`article-categories.mjs` の冒頭に理由を書いてある。

- **科目に属さない記事の slug と重ならないこと。** 重なると同じパスに 2 枚書き出すことになるため、`generate-articles.mjs` が突き合わせて落とす
- **`build/check-site.mjs` の `SKIP_DIRS`（`data` / `docs` / `test` など）と同じ名前にしないこと。** あちらは深さに関係なくその名前のディレクトリを飛ばすので、`/guides/data/` にすると検査だけがそのページを見なくなる

記事ページのアイブロウ（`Versus` / `Ranking` など）はジャンルから出る。記事側に書かせない（書かせるとジャンルと表示がずれる）。

### 記事を追加する

`build/content/articles.mjs` の `ARTICLES` に追加して `generate-articles.mjs` を実行する。決まりごとが 4 つある。

- 難易度・問題数・想定学習時間・到達目安は本文に書かず、`bookTable` ブロックで `BOOKS` から引く。記事とデータがずれるのを構造的に防ぐため
- 本文中の `[[id]]` または `[[id|表示名]]` はその書籍の個別ページへのリンクになる。id が `BOOKS` に無ければビルドが止まる
- `category` を必ず付ける。値は `build/content/article-categories.mjs` の id
- **順位を人が付けるブロック（`rankTable` / `awards`）を使うときは、何を基準に並べたのかを地の文に書く。** 書かないと、データから機械的に出た順位（`dataRank` / `pubRank`）と読者が区別できない

ポータル `index.html` の「参考書の読みものを読む」セクションはジャンルへのリンクなので、記事を 1 本足すたびに手で直す必要はない。看板として出したい記事があるときだけ足す。

#### 本文で使える記法

| 記法 | 出力 | 落ちる条件 |
|---|---|---|
| `[[id]]` / `[[id\|表示名]]` | その記事の科目の書籍ページへのリンク | id が `BOOKS` に無い |
| `[[科目:id]]` / `[[科目:id\|表示名]]` | 別の科目の書籍ページへのリンク | 同上。**科目に属さない記事はこの形で書く** |
| `{{/path/\|表示名}}` | サイト内の他のページへのリンク | パスが `/…/` の形でない、かつこの実行で書き出すページでもない |
| `**強調**` | `<b>` | — |

`{{…}}` の実在確認は、ディスク上のファイルに加えて**この実行で書き出す記事ページ**も見る。
記事どうしのリンクを `ARTICLES` の並び順に関係なく張れるようにするため
（ディスクだけを見ていると、配列の後ろにある記事へ前の記事からリンクした瞬間、
まっさらな状態からのビルドが落ちる）。

本文は `esc()` を通すので、**記事に生の `<a>` を書いても文字列として出る。**
サイト内リンクは必ず `{{…}}` で書く。実在確認をビルド時に通すためで、
死んだリンクや末尾スラッシュ欠け（本番で 301 になる）を記事から出さない。

#### 集計を出すブロック

冊数や時間の合計も本文に転記しない。`build/lib/route-hours.mjs` が
`ROUTES` と `BOOKS[].h` から毎回計算し直す。

| ブロック | 出るもの |
|---|---|
| `{ routeHoursTotal: { combo: 'bun'\|'ri', hoursPerDay } }` | 志望レベル別の総冊数・総時間・1 日あたり時間で割った月数 |
| `{ routeHoursBySubject: { tier, combo } }` | 1 つの志望レベルを科目別に割った内訳と割合 |
| `{ dataRank: { dirs, by: 'h'\|'diff'\|'year', order, limit, stages, excludeStages, subs } }` | 条件に合う本を指定の項目で並べた順位表 |
| `{ pubRank: { dirs, limit, … } }` | 出版社ごとの収録冊数と割合 |
| `{ hist: { by: 'diff'\|'year', dirs, … } }` | 難易度または刊行年代の分布 |
| `{ stageTally: { dir, excludeStages, subs } }` | 役割ごとの冊数・想定学習時間の中央値・難易度の幅 |

比較・ランキング向けのブロックは、**順位を人が付けるもの**（`rankTable` / `awards`）と
**データから機械的に並ぶもの**（`dataRank` / `pubRank` / `hist` / `stageTally`）を型として分けてある。
読者が「これは誰が決めた順位か」を取り違えないようにするため。

| ブロック | 出るもの |
|---|---|
| `{ versus: [id, id(, id)], dir, verdict }` | 2〜3 冊を並べた一騎打ち。強み・注意点は `pros` / `cons` から出る |
| `{ rankTable: [{ id, dir, note }], columns, rankLabel, whyLabel, caption }` | 人が付けた順位と、その理由 |
| `{ awards: [{ title, dir, id, reason }] }` | 部門別。科目をまたいでよい |

`hist` / `pubRank` / `stageTally` の冊数セルは**単位の「冊」を付けずに数字だけを出す**（単位は列見出しに置く）。
「◯◯◯冊」と書くと `build/apply-count.mjs` の `sweep()` が「実データに無い冊数」として拾う。
分布の度数や出版社別の内訳は収録冊数そのものではないので、`count-ignore.json` に登録する筋のものでもない。

**科目・トラックが 1 つでも欠けている志望レベルは行ごと落とす。**部分的な合計を出すと、
読んだ人はそれを全科目の合計として受け取る（医学部は国語のルートを持たないため出ない）。
想定学習時間を持たない本が混ざっていたらビルドを止める。

### 画面を URL で指す

科目トップは 1 枚の HTML の中で画面を切り替える作り（描画は `assets/js/subject-<科目>.js`）だが、5 つの画面はそれぞれハッシュで指せる。画面が変わると履歴に積む（ブラウザの戻るで 1 画面ずつ戻る）。ポータルや外部からの直リンクの宛先になるので、画面を増やしたら各科目の JS の `VIEWS` に足す。切り替えの処理（`go` / `syncHash` / `applyHash`・戻る/進むの受け手）は `assets/js/subject-common.js` の `createNav()` にある。

| ハッシュ | 画面 |
|---|---|
| （なし） | ホーム |
| `#catalog` | 参考書図鑑 |
| `#route` | 参考書ルート |
| `#quiz` | 3分診断 |
| `#guide` | 学習ガイド |

`go()` が `replaceState` で URL を書き換える。履歴には積まない。この SPA は「戻る」を画面遷移として扱っていないため、`pushState` にすると戻るたびに 1 画面ずつ遡ることになり、サイトを離れられなくなる。

## 大学別ページ

`/univ/<slug>/` に大学 1 校ぶんのページを 160 枚、`/univ/` に一覧を 1 枚生成する
（`build/generate-universities.mjs`）。

**なぜ作ったか。** 受験生が検索するのは「早稲田 英語 参考書」であって
「早慶上智 英語 参考書ルート」ではない。2026-09-08 まで、このサイトの URL は
志望レベル（`sokei` / `march` / `nikkoma` …）単位でしか立っておらず、
大学名を持つページが 1 枚も無かった。同じ時点の Search Console の上位クエリ 11 件も
すべて「〈参考書名〉 レベル」型で、大学名のクエリは 1 件も入っていない。

材料は既にあった。`data/subjects/<科目>/universities.json` の `no`（出題形式）と
`h`（目標偏差値）が、5 科目それぞれに手書きで入っている。URL に出していなかっただけである。

### 中身

| 節 | 出所 |
|---|---|
| 科目ごとの目標偏差値の表 | `universities.json` の `h`（科目ごとに値が違う） |
| 科目ごとの出題形式 | 同 `no`。**このページの主役** |
| ルートで最初に使う本（科目あたり 5 冊まで） | `routes.json` の該当 tier から、トラックを持ち回りで拾う |
| 過去問 | 大学名を検索語に入れた Amazon / 楽天の検索結果 |
| 同じ志望レベルの大学 | 台帳（内部リンク） |

### 守ること

- **5 科目すべてのデータが揃っている大学だけをページにする。** 理科だけの 21 校
  （九州工業大学など）は固有テキストが 140 字前後しかない。台帳に入れると生成が落ちる
- **参考書のリストを 5 冊より増やさない。** 増やすと、志望レベルが同じ大学どうしで
  ページの大半が一致する。固有テキスト（`no` の 5 科目合計）は 160 校すべてで 400 字以上
  あるので、比率を保つ
- **`build/data/university-slugs.json` の `slug` を公開後に変えない。** 変えると
  公開済みの URL が 404 になる。エイリアスから正規表現で導出しないのはこのため

### 大学を 1 校足すとき

1. 5 科目すべての `data/subjects/<科目>/universities.json` に追加する
2. `build/data/university-slugs.json` に `{ "slug", "name", "tier" }` を足す
3. `npm run build`

台帳とデータが食い違うと**生成が落ちる**（黙って飛ばさない）。5 科目そろっているのに
台帳へ書き忘れた場合も落ちる。

## 参考書検索（全ページ共通）

すべてのページのヘッダーに検索ボックスがある（`#rtSearch`）。7 科目 1,390 冊を横断して探し、選ぶとその参考書の詳細ページ（`/<科目>/books/<id>/`）へ移動する。

- 処理は `assets/js/search.js`。見た目の CSS の**正本もこのファイルの `STYLE`** だが、配るのは JS からではない。`build/apply-search-style.mjs` が `STYLE` を読んで `assets/site.css` と手書き HTML 9 枚（ポータル・科目トップ 7 枚・404）へ `rt-search:start`〜`rt-search:end` のマーカー付きで書き込み、**描画をブロックする CSS として先に届ける**。JS から差し込んでいたときは、CSS が効いた瞬間にヘッダーが 1 行から 2 行へ組み直されて 本文が 35px 下へずれ、**CLS 0.213**（科目トップ全体の 98%）を出していた。マーカーの中は手で編集しない（直すのは `STYLE`）。ずれは `npm run check:search-style` で落ちる
- 索引は `assets/js/book-index.js`（`build/generate-search.mjs` が生成）。**最初に検索欄へ触れた時点で読み込む**。全ページに置く常設 UI なので、使わない人に 30KB 超を配らないため
- 突き合わせるのは書名・正式名・出版社・収録範囲・分野・役割・あだ名
- マークアップは 11 か所に同じものを置いてある（`build/lib/parts.mjs` の `header()` と `portalHeader()`、ポータル `index.html`、科目トップ 7 枚、`404.html`）。直すときは `rg 'id="rtSearch"'` で全箇所を出す

### 書き方の違いを吸収する

索引側と検索側は、どちらも `search.js` の `normalize()` を通してから突き合わせる。

```
小文字化 → 全角英数を半角へ → カタカナをひらがなへ → 記号・空白・長音を落とす
```

「ポレポレ / ぽれぽれ」「Next Stage / nextstage / ＮＥＸＴ　ＳＴＡＧＥ」がどれも同じ形になる。索引には正規化した形だけを持たせる（表記ごとに何通りも持たせるより軽い）。**索引を作る側は `search.js` を `require` して同じ関数を使う。** 別々に実装すると、片方だけ直したときに黙って引けなくなる。

### あだ名

書名に出てこない呼び名は `build/data/aliases.json` に持つ。key は `<科目ディレクトリ>:<BOOKS の id>`。

```json
"english:nextstage": ["ネクステ", "ネクステージ", "ネクストステージ"]
```

決まりごとが 3 つある。

- **実際にその呼び名が使われていると確認できるものだけ載せる。推測で増やさない。** 載っていない本は正式な書名・出版社・分野で引ける
- 書名にそのまま含まれる呼び名（「ポレポレ」「鉄壁」「青チャート」）は書かなくてよい。索引が書名から引く
- 存在しない書籍を指す key があると `generate-search.mjs` がビルドを止める。`test/search.test.mjs` でも同じことを確かめている

`BOOKS` や `aliases.json` を編集したら `generate-search.mjs` を流し直す。流し忘れると、検索結果に古い書名が残るか、追加した本が出てこない。

## ローカル確認

```bash
python3 -m http.server 8899 --bind 127.0.0.1
```

`http://127.0.0.1:8899/` を開く。ルート相対パス（`/english/` など）を使っているため、`file://` で直接開くと科目間リンクが機能しない。必ず HTTP サーバー経由で確認する。

`python3 -m http.server` は `Cache-Control` を返さない。ブラウザは `Last-Modified` から独自に「まだ新しい」と判断して再取得しないため、**`assets/js/*.js` や `site.css` を直しても画面に反映されないことがある**。反映されないときは HTML ではなく JS / CSS を疑い、スーパーリロード（macOS の Chrome なら `Cmd+Shift+R`）か、URL に `?v=1` のようなクエリを付けて読み直す。

内部リンクの実在確認は、生成後に次のスクリプトで行う（`${b.id}` を含む 5 件は JS のテンプレート文字列なので無視してよい）。

```bash
python3 -c "
import os, re
bad = []
for dp, dn, fn in os.walk('.'):
    if '.git' in dp or 'build' in dp: continue
    for f in fn:
        if not f.endswith('.html'): continue
        for m in re.finditer(r'href=\"(/[^\"#?]*)\"', open(os.path.join(dp, f), encoding='utf-8').read()):
            h = m.group(1); t = h.lstrip('/')
            ok = os.path.isfile(os.path.join(t, 'index.html')) if h.endswith('/') else os.path.isfile(t)
            if not ok: bad.append(h)
print(sorted(set(bad)) or 'リンク切れなし')
"
```

## 最終更新日

**人が日付を書く仕組みにしない。** 手で書く運用は必ず古くなる。求め方は 2 通り。

| 対象 | 求め方 |
|---|---|
| 1 ページ = 1 ファイル（解説記事・信頼性ページ） | git の最終コミット日（`build/lib/updated.mjs` の `fileDate()`） |
| 1 ファイルに多数のレコード（書籍 1 冊・科目トップ） | レコードのハッシュを `build/data/record-dates.json` に控え、**中身が変わった日**を使う |

科目 HTML を 1 文字直しただけで 252 冊ぜんぶの更新日が動かないよう、後者は git の日付を使わない。台帳は増えるだけで消さないので、生成を科目単位・1 冊単位で流しても実行しなかった本の日付は残る。

日付は画面の `<time datetime>` と JSON-LD の `dateModified`、`sitemap.xml` の `lastmod` の 3 つに同じ値が出る。`sitemap.xml` は各ページの `<time datetime>` を読んで作るので、**`generate-sitemap.mjs` は必ず最後に流す**。

`/changelog/` は git のコミット履歴のうちデータ・生成物に触ったものを日付ごとにまとめて出す。自動コミット（冊数そろえ）と作業中の保存は落とす。手書きの changelog は作らない。

## 科目トップの静的化

科目トップの図鑑・志望レベル一覧・講師ルート・学習ガイドは `getElementById(...).innerHTML = …` で描いている。JS が動く画面では問題ないが、**検索エンジン・リンクプレビュー・JS を切った環境が受け取る HTML では中身が空**で、図鑑は「0 冊を表示中」と出ていた。

`build/prerender-tops.mjs` が初期状態の HTML をファイルに書き込む。カードの HTML をスクリプト側に書き写すと科目トップを直したときに必ずずれるので、**ページ自身の描画関数を vm 上で実行して結果を回収する**。DOM は `innerHTML` / `textContent` を記録するだけのスタブで代替する。JS が動く環境では初期化のときに同じ関数が同じ内容で上書きするので、画面の挙動は変わらない。

**図鑑のグリッドだけは先頭 18 枚に切る。** 全冊を静的に出すと同じカードが `/<科目>/books/` と科目トップの 2 か所に並び、理科は HTML が 1.5MB（gzip 258KB）まで膨らむうえ、検索エンジンからは 2 ページが重複して見える。全冊の索引は `/<科目>/books/` が静的に持っているので、こちらは「空に見えない」ことと「総数が正しく出ること」を満たす枚数にして、続きへのリンクを添えてある。枚数は `CATALOG_STATIC_CARDS`。

`node build/prerender-tops.mjs --check` はずれていれば落ちる。CI が push のたびに流す。

## 信頼性ページ

`/about/` `/methodology/` `/privacy/` `/disclaimer/` `/ads/` `/changelog/` の 6 枚。本文は `build/content/legal.mjs`、生成は `build/generate-legal.mjs`。

以前この内容は科目トップの `LEGAL` にあり、**JS のモーダルとしてしか出ていなかった**。クローラー・AdSense の審査・JS を切った環境からは存在しないのと同じなので、静的ページを正本にしてモーダルは撤去し、フッターから静的ページへ送る形にした。

- 冊数・大学数・広告表記の出し分けは実データと `CONFIG` から渡す。本文側に数字を書かない
- **Amazon アソシエイトの必須表記**（「Amazon のアソシエイトとして、ルート大全は適格販売により収入を得ています。」）は `build/lib/parts.mjs` の `amazonDisclosure()` が正本。`amazonTag` が入っているときだけ出す。手書き HTML にも同じ文字列を置いてあり、`check-site.mjs` が全ページにあることを確かめる
- 表示名は**アソシエイトの登録名**。リポジトリからは分からないのでサイト名「ルート大全」を使っている。登録名が判明したら `parts.mjs` の `AMAZON_NAME` と手書き HTML を直す

## 文章のスタイル

正本は [docs/style-guide.md](docs/style-guide.md)。`build/check-site.mjs` がその機械で見られる部分（禁止語・非日本語文字・「本アプリ」・meta description の長さ・定型段落の重複）を検査する。**条文を変えたら検査も一緒に直す。**

書籍ページの本文には「その本でしか成り立たない文」だけを書く。参考書の選び方の一般論は `/methodology/` と解説記事に 1 か所だけ置く。難易度の定義のような共通の説明は `build/lib/scale.mjs` のコンポーネントで出し、文章として書き下ろさない。

説明文（`desc` / `pros` / `cons` / `bestFor`）を大きく書き換えるときは、書き換え前のスナップショットを `data/_backup/` に置く（手順は `data/_backup/README.md`）。
