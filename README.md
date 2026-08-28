# ルート大全

大学受験の参考書 1,052 冊を科目別に図鑑化し、志望校から逆算した参考書ルートを提示する無料サイト。

公開 URL: https://route-taizen.com/
リポジトリ: https://github.com/daichi-ikeda-170329/study-route-compendium

## 概要

英語・国語・数学・理科・社会の 5 科目それぞれについて、市販の参考書を難易度・役割・接続関係で整理した「参考書図鑑」と、志望校と現在地から組み立てる「参考書ルート」を提供する。

サイトは 2 層でできている。

- **科目トップ**（`<科目>/index.html`）— 外部依存のない単一 HTML の SPA。図鑑・ルート・診断・学習ガイドを内包する。手で編集する
- **生成ページ**（`<科目>/books/`、`<科目>/routes/`、`<科目>/guides/`）— 科目トップの `BOOKS` / `ROUTES` を正本として `build/` のスクリプトが出力する。手で編集しない

収益はページ内の書籍リンク（Amazon アソシエイト・楽天アフィリエイト）による。

## 収録数とページ数

| 科目 | ディレクトリ | 収録冊数 | 志望レベル | 記事 | テーマカラー |
|---|---|---|---|---|---|
| 英語 | `english/` | 173 | 9 | 4 | `#B5432A` |
| 国語 | `japanese/` | 152 | 8 | 2 | `#8A6D2F` |
| 数学 | `math/` | 113 | 9 | 2 | `#24427C` |
| 理科 | `science/` | 347 | 8 | 2 | `#2F6E4F` |
| 社会 | `social/` | 267 | 8 | 2 | `#5B4E9E` |
| 全科目共通 | `guides/` | — | — | 1 | — |
| 合計 | — | 1,052 | 42 | 13 | — |

公開ページ数は 1,134（`sitemap.xml` の URL 数と一致する）。冊数は各科目の `BOOKS` 配列（`BOOKS.push()` による追加分を含む）の要素数と一致する。

## ディレクトリ構成

| パス | 用途 | 編集方法 |
|---|---|---|
| `index.html` | ポータル。5 科目への入口・FAQ・法定表記 | 手で編集 |
| `<科目>/index.html` | 科目トップ（単一 HTML の SPA） | 手で編集 |
| `<科目>/books/index.html` | 参考書一覧（役割別・難易度順） | 生成 |
| `<科目>/osusume/index.html` | 参考書おすすめ（ルート採用回数順） | 生成 |
| `<科目>/books/<id>/index.html` | 参考書 1 冊の詳細ページ | 生成 |
| `<科目>/routes/index.html` | 志望レベル一覧 | 生成 |
| `<科目>/routes/<tier>/index.html` | 志望レベル別ルート | 生成 |
| `<科目>/guides/<slug>/index.html` | 解説記事 | 生成 |
| `guides/<slug>/index.html` | 科目に属さない解説記事 | 生成 |
| `404.html` | 404 ページ | 手で編集 |
| `assets/site.css` | 生成ページ共通のスタイル | 手で編集 |
| `assets/js/share.js` | 3分診断の結果共有・保存と、ルート画面の共有。5 科目の科目トップから読み込む | 手で編集 |
| `assets/js/search.js` | 全ページ共通の参考書検索。ヘッダーの検索ボックスを動かす | 手で編集 |
| `assets/js/book-index.js` | 検索が引く 1,052 冊の索引 | 生成 |
| `assets/js/pace.js` | ルート画面の進めるペース（いつまでに何を終えるか） | 手で編集 |
| `assets/ogp*.png` | OGP 画像。冊数を画像内に焼き込んでいる | 再生成が必要 |
| `assets/x-icon.svg` / `.png` | X のプロフィール画像（400×400） | SVG を手で編集し PNG を書き出す |
| `assets/x-header.svg` / `.png` | X のヘッダー画像（1500×500） | 同上 |
| `favicon.svg` | ファビコン | 手で編集 |
| `sitemap.xml` | サイトマップ | 生成 |
| `robots.txt` | クローラー設定 | 手で編集 |
| `.nojekyll` | GitHub Pages の Jekyll 処理を無効化 | — |
| `build/` | 生成スクリプト | 手で編集 |
| `build/data/authors.json` | 著者名（openBD 由来・実在確認済み 227 冊分） | 生成（再取得時のみ） |
| `build/data/aliases.json` | 参考書のあだ名（「ネクステ」など）。検索の索引に混ぜる | 手で編集 |
| `test/` | 共有・保存のテスト（`assets/js/share.js` と、科目トップのルート共有）。`node --test` で実行する | 手で編集 |
| `docs/` | 機能ごとの実装計画と調査記録 | 手で編集 |

科目トップの内部構造は 5 科目で共通で、次の要素を同じクラス名で持つ。

- `.pr-bar` — アフィリエイト広告の明示（景品表示法のステマ規制対応）
- `.xbar` — 科目切り替えバー。全ページ相互リンクの起点
- `.view` — ホーム / 図鑑 / ルート / 診断 / 学習ガイドの各画面
- `.rt-search` — 全ページ共通の参考書検索。ヘッダーの中に置く
- `.cat-index` — 生成ページ（一覧・ルート）への導線バナー
- `.foot-subjects` — フッターの他科目リンク
- `LEGAL` — 運営者情報・プライバシーポリシー・免責事項・広告についてのモーダル

## ビルド

```bash
node build/generate-books.mjs      # 参考書の詳細ページ 1,052 件
node build/generate-index.mjs      # 参考書一覧 5 件
node build/generate-picks.mjs      # 参考書おすすめ 5 件
node build/generate-routes.mjs     # 志望校別ルート 47 件
node build/generate-articles.mjs   # 解説記事 19 件（記事 13 + 一覧 6）
node build/generate-search.mjs     # 検索の索引 assets/js/book-index.js
node build/generate-sitemap.mjs    # sitemap.xml（最後に実行する）
```

`build/gen-x-posts.mjs` は X の投稿案を作るもので、サイトの生成物とは無関係。
上の一括再生成には含めない（「X アカウント」の節を参照）。

科目トップの `BOOKS` や `ROUTES` を編集したら、`generate-sitemap.mjs` を含めて全部を流し直す。生成物はリポジトリにコミットする（GitHub Pages はビルドを実行しないため）。

`generate-books.mjs` は科目名と id を引数に取れる。1 件だけ確認したいときに使う。

```bash
node build/generate-books.mjs math ao
```

### 生成スクリプトの構成

| ファイル | 役割 |
|---|---|
| `build/lib/extract.mjs` | 科目 HTML の `<script>` を vm 上で実行し、`BOOKS` / `ROUTES` / `TIERS` / `STAGES` / `UNIS` を回収する。id の重複や URL に使えない id はここで検出して停止する |
| `build/lib/parts.mjs` | `<head>`・ヘッダー・フッター・パンくず・JSON-LD の共通パーツ |
| `build/lib/cover.mjs` | 書影の候補 URL と、一覧・ルートに並べる小さな書影のマークアップ |
| `build/lib/cards.mjs` | 参考書 1 冊のカード（`.bcard`）。一覧・書籍ページ・解説記事で共有する |
| `build/content/articles.mjs` | 解説記事の本文 |

`ROUTES` の階層は 5 科目で共通で `ROUTES[志望レベル][トラック][方針]`。トラックだけが科目で違う（英語・数学は `bun`/`ri`、国語は `gendai`/`kobun`/`kanbun`、理科は `butsuri`/`kagaku`/`seibutsu`/`chigaku`、社会は `nihonshi`/`sekaishi`/…）。

志望レベルの直下には、トラックのほかに次のキーが入ることがある。トラックとして扱わないので、増やすときは `generate-routes.mjs` の `NON_TRACK` にも足す。

| キー | 意味 |
|---|---|
| `para` | 並行して進める本。トラックごとの辞書、または全トラック共通の配列 |
| `final` | 最後の仕上げ。同上 |
| `basic` | 理科基礎（文系・共テのみ）のルート。理科の `kyote` だけが持ち、科目トップでのみ使う |

### 記事を追加する

`build/content/articles.mjs` の `ARTICLES` に追加して `generate-articles.mjs` を実行する。決まりごとが 3 つある。

- 難易度・問題数・想定学習時間・到達目安は本文に書かず、`bookTable` ブロックで `BOOKS` から引く。記事とデータがずれるのを構造的に防ぐため
- 本文中の `[[id]]` または `[[id|表示名]]` はその書籍の個別ページへのリンクになる。id が `BOOKS` に無ければビルドが止まる
- 記事を追加したら、ポータル `index.html` の「参考書の選び方を読む」セクションにも手でリンクを足す

### 画面を URL で指す

科目トップは単一 HTML の SPA だが、5 つの画面はそれぞれハッシュで指せる。ポータルや外部からの直リンクの宛先になるので、画面を増やしたら `VIEWS` に足す。

| ハッシュ | 画面 |
|---|---|
| （なし） | ホーム |
| `#catalog` | 参考書図鑑 |
| `#route` | 参考書ルート |
| `#quiz` | 3分診断 |
| `#guide` | 学習ガイド |

`go()` が `replaceState` で URL を書き換える。履歴には積まない。この SPA は「戻る」を画面遷移として扱っていないため、`pushState` にすると戻るたびに 1 画面ずつ遡ることになり、サイトを離れられなくなる。

## 参考書検索（全ページ共通）

すべてのページのヘッダーに検索ボックスがある（`#rtSearch`）。5 科目 1,052 冊を横断して探し、選ぶとその参考書の詳細ページ（`/<科目>/books/<id>/`）へ移動する。

- 処理は `assets/js/search.js`。見た目の CSS もこのファイルから差し込む。手書き HTML（ポータル・科目トップ・404）は `site.css` を読まないため、共通の置き場がここしかない
- 索引は `assets/js/book-index.js`（`build/generate-search.mjs` が生成）。**最初に検索欄へ触れた時点で読み込む**。全ページに置く常設 UI なので、使わない人に 30KB 超を配らないため
- 突き合わせるのは書名・正式名・出版社・収録範囲・分野・役割・あだ名
- マークアップは 7 か所に同じものを置いてある（`build/lib/parts.mjs` の `header()` と `portalHeader()`、ポータル `index.html`、科目トップ 5 枚、`404.html`）。直すときは `rg 'id="rtSearch"'` で全箇所を出す

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

## 共有・保存

共有できる画面は 3 つある。

| 画面 | 共有するもの | 実装 |
|---|---|---|
| 3分診断の結果 | 回答（`?v=1&a=…`）。開いた側で結果を計算し直す | `assets/js/share.js` の `afterResult()` |
| 科目トップのルート画面 | ルートの形を決める設定（`?rv=1&r=…`） | `assets/js/share.js` の `routeBlock()` |
| 志望校別ルートの生成ページ | そのページの URL そのもの | `build/lib/parts.mjs` の `shareBar()` |

診断とルートの処理は `assets/js/share.js` の 1 ファイルにまとまっていて、5 科目の科目トップから `<script src>` で読み込む。診断側は科目ごとの分岐を持たず、その科目の `QUIZ` 配列を入力に動く。

### 診断結果の共有 URL のスキーマ

```
https://route-taizen.com/<科目>/?v=1&a=1.3.0.2.2
```

| パラメータ | 意味 | 検証 |
|---|---|---|
| `v` | スキーマバージョン | `1` のみ許可。ほかの値は無効 |
| `a` | 回答列 | `QUIZ` の宣言順に 1 質問 1 トークン。ドット区切り |

トークンの意味は 2 通りある。

- `0` — 条件分岐（`cond`）により表示されなかった質問
- `1` 以上 — その質問の選択肢の 1 始まりインデックス

URL に載せるのは**結果ではなく回答**で、開いた側は現行の `renderQuizResult()` を呼んで結果を計算し直す。ロジックや収録書籍を更新しても、過去に共有された URL が古い結果を表示することはない。

検証に 1 つでも通らなければ、部分的に復元せず診断開始画面へ戻す。エラー画面は出さず、1 行の注記だけを出す。

### `v` を上げる運用ルール

**次のいずれかを行ったら、`assets/js/share.js` の `SCHEMA_VERSION` を上げる。**

- 質問（`QUIZ` の要素）を追加・削除・並べ替えた
- 既存の質問の選択肢（`opts`）を追加・削除・並べ替えた
- 質問の `cond` の条件を変えた

選択肢の**表示文言だけ**を直すときは上げなくてよい。トークンが指すインデックスが動かないため。

上げ忘れると、旧 URL のトークンが新しい構成の別の選択肢として解釈され、共有した人の意図と違う結果が表示される。質問数が変われば実行時の検証で弾けるが、選択肢の並べ替えは実行時には弾けない。

そのため `test/share.test.mjs` に各科目の `QUIZ` の構造の指紋を固定値で持たせてある。質問・選択肢・`cond` のいずれかを変えるとこのテストが落ちるので、**落ちたら「`SCHEMA_VERSION` を上げる」か「表示文言だけの変更なので据え置く」かを判断し、そのうえで指紋を更新する**。テストが落ちたからといって、判断せずに指紋だけ書き換えないこと。

`v` を上げるときは、旧バージョンの扱い（変換して表示するか、診断のやり直しへ誘導するか）をその時点で決める。現状、未対応の `v` はすべて診断開始画面へフォールバックする。

### ルート画面の共有 URL のスキーマ

```
https://route-taizen.com/<科目>/?rv=1&r=t.march.bun.omni.1&ru=明治大学
```

| パラメータ | 意味 | 検証 |
|---|---|---|
| `rv` | スキーマバージョン | `1` のみ許可 |
| `r` | ルートの設定を表すトークン列。ドット区切り | 英数字と `-` `_` だけ・1 トークン 24 文字まで・8 個まで（`share.js`）／意味は科目ページ（`share.js` は科目ごとの持ち物を知らない） |
| `ru` | 志望校名（任意） | 60 文字まで。`UNIS` の `n` と完全一致したときだけ使う |

トークンの並びは科目によって違う。科目ページの `RTShare.setup({ route: … })` にある `encode` / `apply` が正本。

| 科目 | トークン |
|---|---|
| 英語 | 種類（`t` 志望レベル / `s` 講師）・志望レベル or 講師 id・受験タイプ・学習方針・現在地 |
| 数学 | `t`・志望レベル・受験タイプ・学習方針・現在地 |
| 国語 | `t`・志望レベル・表示する分野・学習方針・現在地 |
| 理科 | `t`・志望レベル・使う科目（`1010` のような 4 桁）・学習方針・現在地・基礎科目か |
| 社会 | `t`・志望レベル・選択科目（6 桁）・受験タイプ・学習方針・現在地 |

**書式の検証は `share.js`、意味の検証は科目ページ**という分担になっている。志望レベルやトラックが実在するかは、そのデータを持っているページ側でしか判断できないため。どちらかが通らなければ部分的に復元せず、パラメータを落として普通のトップページとして開く。

載せないものが 2 つある。

- **模試の偏差値・学部名・既習の参考書** — 共有相手には関係がなく、他人の学習状況を URL に載せる必要もない
- **志望校を配列の位置で指すこと** — `UNIS` に安定した ID が無い。位置で指すと収録校を 1 校足しただけで別の大学を指してしまうので、名前で持って開いた側で突き合わせる。一致しなければ志望レベルのルートへ落とす

ルート画面には保存ボタンを置いていない。保存の対象は診断の回答であって、ルート画面の設定ではない。

### 保存データ

localStorage のキーは `rt_saved_routes`。全科目あわせて 10 件まで保存でき、超過時は最古の削除を確認したうえで入れ替える。

保存するのは回答（共有 URL と同じトークン列）と一覧表示用の見出しだけで、結果は保存しない。読み込み時に `schemaVersion`・型・トークン書式を検証し、1 つでも合わない項目は捨てる。localStorage が使えない環境では保存ボタン自体を表示しない。

## ルートの進めるペース

ルート画面には「1 日に何時間使えるか」と「いつの入試か」から、各参考書をいつまでに終えていればよいかが出る。処理は `assets/js/pace.js`。

- **画面に出ている DOM を読んで計算する。** 科目ごとにルートの組み立て方が違うので、各ページの描画処理には手を入れず、描き終わったあとに `RTPace.apply()` を 1 回呼ぶだけにしてある。必要な情報は `.climb-node` の `data-h`（その本の想定時間）と `.subj-head` の区切りだけ
- 分野が複数ある科目（国語・理科・社会）は、**1 日の時間を分野で等分して並行に進める前提**で計算する。直列に積み上げると「化学は 8 か月後から」のような、実際の進め方と合わない表示になる
- 仕上げ（過去問）は他の分野が終わってから。`.subj-head` に `data-final="1"` が付いている枠がそれ
- 並行枠（単語帳など）と、済み・スキップの段は時間に数えない
- 締切は**共通テスト（受験年の 1 月中旬）**。私大・国公立二次はその先なので、そのぶんは余裕として扱う
- 受験年と 1 日の時間は `localStorage` の `rt_pace` に置く。この端末の中だけで、共有 URL には載せない（ルートの形ではなく個人の状況のため）

ルートの段の HTML を触るときは `data-h` を落とさないこと。落ちるとその本が日程に数えられなくなる。

## テスト

```bash
node --test test/share.test.mjs test/search.test.mjs test/pace.test.mjs
```

Node 標準の `node:test` だけで動く（依存の追加なし）。

| ファイル | 見ているもの | 流すべきとき |
|---|---|---|
| `test/share.test.mjs` | 診断結果の共有 URL の往復・不正な URL・保存データ・ルート共有の `encode`/`apply` | `QUIZ` を変えた / 科目トップのルート画面を触った |
| `test/search.test.mjs` | 索引の中身・正規化・あだ名で引けること・`aliases.json` の実在確認 | `BOOKS` を変えた / `aliases.json` を触った（先に `generate-search.mjs` を流す） |
| `test/pace.test.mjs` | 日程の計算（分野の等分・仕上げの後置・端数の切り上げ） | `pace.js` を触った |

診断は、科目ページから `QUIZ` を取り出し、到達しうる回答の組み合わせをすべて列挙して往復を確認する。あわせて不正な URL を 30 ケース以上、壊れた保存データの読み込みも検証する。

ルート共有の `encode` / `apply` は科目ページ側にあるので、`test/helpers.mjs` の `loadPage()` が科目 HTML を vm 上で走らせ、`RTShare` を差し替えて設定を受け取る。全科目・全志望レベルで `encode → apply → encode` が同じトークンに戻ること、実在しない値のトークンを拒むこと、大学名が `UNIS` と一致したときだけ志望校モードになることを確かめている。

## アフィリエイト ID の設定

広告表記は「ID が入っているかどうか」だけを根拠に自動で出し分ける。未参加のプログラムの表記を出さないため、**文言を手で書き換える必要はない**。

ID は各科目トップと `index.html`（ポータル）の `<script>` 冒頭にある `CONFIG` に入れる。

```js
const CONFIG = {
  siteName:   "英語ルート大全",
  operator:   "ルート大全 編集部",
  contact:    "",
  amazonTag:  "",   // Amazon アソシエイトのトラッキング ID（例 "xxxxx-22"）
  rakutenId:  ""    // 楽天アフィリエイト ID
};
```

どちらが設定済みかは「[外部サービスの登録状況](#外部サービスの登録状況)」を正本とする。

### ID の有無で自動的に変わるもの

`CONFIG` の 2 つの ID から `AFF_AZ` / `AFF_RK` / `AFF`（どちらか一方でも有効か）/ `AFF_PROGRAMS`（参加中のプログラム名）/ `AFF_STORES`（広告リンクになる販売サイト名）を組み立て、次の箇所が連動する。

| 箇所 | 両方とも未設定 | 片方または両方が設定済み |
|---|---|---|
| ページ最上部の PR バー | 出さない | 出す |
| 書籍の購入ボタンの `rel` | `nofollow noopener` | ID がある側だけ `sponsored` を追加 |
| 購入ボタン下の注記 | 版の確認だけ | 広告リンクである販売サイト名を明記 |
| 「広告について」 | 広告を掲載していない旨 | 参加中のプログラム名を明記 |
| プライバシーポリシー | 広告クッキーの節を出さない | 広告クッキー・オプトアウトの節を出す |
| フッターの法定表記 | 目安である旨だけ | アフィリエイト利用の明示を追加 |
| Amazon アソシエイトの必須表記 | 出さない | `amazonTag` があるときだけ出す |

生成ページ側は `build/lib/extract.mjs` の `affiliateEnabled()` が 5 科目の `CONFIG` を読んで同じ判定をする。**ID を入れたあとは必ず全ページを再生成する。**

### Amazon アソシエイトに申請して承認されたら

```bash
# 5 科目 + ポータルへ一括反映する（ID は自分のものに置き換える）
for f in english japanese math science social; do
  sed -i '' 's/amazonTag:  ""/amazonTag:  "xxxxx-22"/' "$f/index.html"
done
sed -i '' 's/amazonTag: ""/amazonTag: "xxxxx-22"/' index.html

node build/generate-books.mjs && node build/generate-index.mjs \
  && node build/generate-picks.mjs && node build/generate-routes.mjs \
  && node build/generate-articles.mjs && node build/generate-search.mjs \
  && node build/generate-sitemap.mjs
```

反映後、次の 3 点を確認する。

- 書籍詳細ページの「Amazon で見る」に `rel="nofollow sponsored noopener"` が付いている
- フッターに「Amazon のアソシエイトとして、〜は適格販売により収入を得ています。」が出ている
- 「広告について」から「Amazon へのリンクはアフィリエイトタグを含まない通常のリンク」の但し書きが消えている

## X アカウント

公式アカウントは `@route_taizen`。運用設計の正本は [docs/x-account-plan.md](docs/x-account-plan.md)。

ハンドルは `build/lib/extract.mjs` の `X_HANDLE` に持たせてある。ただし
`assets/js/share.js` と手書き HTML（ポータル・科目トップ 5 枚）にも同じ値が
書いてあるので、**変えるときは `rg route_taizen` で全箇所を出してから直す。**

| 置き場 | 用途 |
|---|---|
| `build/lib/extract.mjs` の `X_HANDLE` | 生成ページの `twitter:site`・共有ボタンの `via=`・フッターの導線 |
| `assets/js/share.js` の `X_HANDLE` | 診断結果とルート画面の共有ボタンの `via=` |
| 手書き HTML 6 枚 | `twitter:site` メタとフッターの導線（404 は `twitter:card` を持たないので対象外） |

### 画像を書き出す

アイコンとヘッダーは SVG が正本で、PNG はそこから書き出す。SVG を直したら
次を実行して PNG を作り直す（`sips` は SVG を扱えないため Chrome を使う）。

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for n in "x-icon 400 400" "x-header 1500 500"; do
  set -- $n
  printf '<!doctype html><meta charset=utf-8><style>html,body{margin:0}img{display:block;width:%spx;height:%spx}</style><img src="file://%s/assets/%s.svg">' \
    "$2" "$3" "$(pwd)" "$1" > /tmp/wrap.html
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$2","$3" --screenshot="$(pwd)/assets/$1.png" file:///tmp/wrap.html
done
```

書き出したら見た目を必ず確認する。**アイコンは X が円形に切り抜き、ヘッダーは
左下にアイコンが重なる。**どちらも切り抜き後の姿で見ないと判断できない。

### 投稿案の生成

```bash
node build/gen-x-posts.mjs            # 翌月分
node build/gen-x-posts.mjs 2026-09    # 月を指定
```

出力は `docs/x-posts/YYYY-MM.md`。図鑑カード（A 型）とデータから出る事実（E 型）を
`BOOKS` から組み立て、判断が要る 3 種類は空欄で出す。空欄を埋めるときに渡すのは
**ファイル末尾の「候補データ」だけでよい**（科目トップの HTML は読ませない）。

`.github/workflows/x-posts.yml` が毎月 1 日に実行してコミットする。同じ月が既に
あれば作り直さない。作り直すには `--force` を付ける。**`--force` は前回出した本を
別の本に入れ替える**（既出の記録が `docs/x-posts/used.json` に残っているため）。

`BOOKS` の `diff` は **1〜10 の 10 段階**である。投稿でも `build/lib/cards.mjs` と
同じ 10 段階で書く。5 段階の星に丸めると、サイトを開いた読者が見る数字と食い違う。

## 更新手順

```bash
git add -A
git commit -m "feat: <変更内容>"
git push
```

`main` への push で GitHub Pages が再ビルドされる。反映まで 1〜2 分かかる。

参考書を追加・改訂したときは、次の 5 か所の整合を取る。

1. 該当科目の `BOOKS` 配列
2. `build/` の全スクリプトを再実行
3. この README の収録数テーブル
4. ポータル `index.html` の科目カードとヒーローの冊数
5. `assets/ogp*.png`（冊数を画像内に焼き込んでいるため、`build/` 外の生成手順で作り直す）

診断の質問（`QUIZ`）を変えたときは、あわせて `assets/js/share.js` の `SCHEMA_VERSION` を上げるか判断する。判断の基準は「[共有・保存](#共有保存)」の節に書いた。

push の前にテストを流す。何をどのタイミングで流すかは「[テスト](#テスト)」の表を見る。

```bash
node --test test/share.test.mjs test/search.test.mjs test/pace.test.mjs
```

## 書影

書影は Amazon・国立国会図書館サーチ・openBD が公開している商品画像 URL を参照するだけで、保存も加工もしない。どれも取れない本があるので、書名と出版社を出す代替表示を必ず画像の下に敷いてある。

候補 URL の作り方は 2 か所にある。同じ順番（`cover` → Amazon 2 種 → NDL → openBD）で並べること。

| 置き場 | 使う画面 |
|---|---|
| `build/lib/cover.mjs` の `coverSrcs()` / `coverBox()` | 生成ページ（一覧・おすすめ・ルート・書籍ページ・解説記事） |
| 科目トップの `coverSrcs()` / `coverHTML()` | 科目トップ（図鑑・ルート・診断結果・モーダル） |

Amazon は画像を持たない ISBN に対して 43 バイトほどの 1x1 画像を HTTP 200 で返すことがある。この場合 `onerror` は発火しないので、表示側で `naturalWidth` を見て次の候補へ送っている。**この分岐を消すと、真っ白な書影が並ぶ。**

## 書名と著者名の決め方

検索されたときに見つかる形を `build/lib/booktitle.mjs` が決める。`title` / `h1` / パンくずはここを通す。

`BOOKS[].name` は図鑑で使う短い呼び名で、たいていはそのまま検索語になる（「速読英単語 入門編」「英文法ポラリス1」）。ただし一部は編集上の内部略称で、誰も検索しない形になっている（「河合 黒本」「東書『公共』」）。`name` の文字が `official` に 75% 未満しか含まれない本を略称とみなし、そのときだけ `official` を整えて使う。現在 28 冊が該当する。

著者名は `build/data/authors.json` から引く。openBD API に各書の ISBN を投げて取得したもので、227 冊分ある。openBD に著者記載が無い本は、openBD 由来で実在を確認できた人名が `official` に現れる場合にのみ付けた。出版社名・団体名（塾・社・出版・書店・編集部 など）は著者から除外している。

**推測で著者名を補わない。** 判明しない 825 冊は未収録のままにし、生成側は著者欄そのものを出さない。大学受験参考書は編集部名義が多く、書誌データベースに個人著者が載らないものが実際に多数ある。

`official` が「著者名の◯◯」という形を取っている本だけ、`title` と `h1` を著者名込みにする（「関正生の英文法ポラリス1」）。36 冊が該当する。書名にすでに著者名が入っている本には付けない。

著者データを取り直すときは openBD へ再照会する。`authors.json` の `_provenance` に取得日と手順を書いてある。

## インデックス通知

ページを増やしたら、本番へ反映したあとに IndexNow へ通知する。Bing・Yahoo・DuckDuckGo・Yandex に即座に伝わる（Google は IndexNow 非対応なので、Search Console のサイトマップ送信が別に必要）。

```bash
node build/submit-indexnow.mjs --dry   # 送信内容の確認
node build/submit-indexnow.mjs         # 送信
```

URL は `sitemap.xml` を正本にするので、先に `generate-sitemap.mjs` を流しておく。所有権はサイト直下の `<キー>.txt` で証明する。このファイルを消すと通知が通らなくなるので削除しない。

初回送信時は `SiteVerificationNotCompleted` が返ることがある。キー検証が非同期のためで、数分待って再実行すれば通る。

## DNS の構成

ドメインは Xserver で保有し、**権威 DNS は Cloudflare** に置いている。Xserver のネームサーバーは使わない。

| 種別 | 名前 | 内容 |
|---|---|---|
| A | `@` | `185.199.108.153` / `.109.153` / `.110.153` / `.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` 〜 `8003::153` |
| CNAME | `www` | `daichi-ikeda-170329.github.io` |
| TXT | `_github-pages-challenge-daichi-ikeda-170329` | ドメイン所有権の確認用 |

注意点が 3 つある。

- **A / AAAA / CNAME は Cloudflare のプロキシを通さない**（グレーの雲＝DNS only）。オレンジにすると GitHub の証明書発行の確認が Cloudflare 止まりになり、HTTPS を有効化できない
- `www` の CNAME の向き先は**リポジトリ名ではなくアカウントの Pages ホスト名**。リポジトリをリネームしても変えない
- Cloudflare へ移す前は Xserver のネームサーバーを使っていたが、**GitHub のリゾルバから解決できず**、Pages のドメイン判定とアカウントのドメイン認証が揃って失敗した（`InvalidDNSError` / `Dnsruby::ServFail`）。公開リゾルバからは正常に引けていたため切り分けに時間がかかった。Cloudflare へ移した直後に解決したので、**Xserver のネームサーバーには戻さない**

## 外部サービスの登録状況

| サービス | 状態 | 用途 | 設定箇所 |
|---|---|---|---|
| GitHub Pages | 有効 | ホスティング | リポジトリ直下の `CNAME`（`route-taizen.com`） |
| 独自ドメイン | 有効（2026-08-22〜） | `route-taizen.com`。HTTPS 強制済み | Xserver で保有、DNS は Cloudflare |
| Cloudflare DNS | 有効 | 権威 DNS。`darwin` / `yolanda`.ns.cloudflare.com | Cloudflare ダッシュボード |
| Google Search Console | 所有権確認メタ設置済み | インデックス登録・検索順位の把握 | ポータルと科目トップの `<head>` |
| Google アナリティクス 4 | 導入済み（`G-DQ5WFXEFMX`） | アクセス解析 | 手書き HTML 7 件と `build/lib/parts.mjs` の `analytics()` |
| 楽天アフィリエイト | 導入済み | 書籍リンクの収益化 | 科目トップとポータルの `CONFIG.rakutenId` |
| Amazon アソシエイト | **未申請** | 書籍リンクの収益化 | 科目トップとポータルの `CONFIG.amazonTag` |
| IndexNow | 通知済み | Bing・Yahoo・DuckDuckGo・Yandex への即時インデックス通知 | サイト直下の `<キー>.txt` と `build/submit-indexnow.mjs` |
| Bing Webmaster Tools | 未登録 | Bing の掲載状況の確認 | — |

広告表記は ID の有無だけを根拠に自動で出し分ける。ID が入っている販売サイトだけを広告リンクとして扱い、もう一方はタグ無しの通常リンクとして扱う（未参加のプログラムの表記を出さないため）。詳細は「[アフィリエイト ID の設定](#アフィリエイト-id-の設定)」を参照。

測定 ID を変えるときは、手書き HTML と `parts.mjs` の両方にあるので `rg G-DQ5WFXEFMX` で全箇所を出してから直す。
