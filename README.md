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
| `assets/ogp*.png` | OGP 画像。冊数を画像内に焼き込んでいる | 再生成が必要 |
| `favicon.svg` | ファビコン | 手で編集 |
| `sitemap.xml` | サイトマップ | 生成 |
| `robots.txt` | クローラー設定 | 手で編集 |
| `.nojekyll` | GitHub Pages の Jekyll 処理を無効化 | — |
| `build/` | 生成スクリプト | 手で編集 |
| `build/data/authors.json` | 著者名（openBD 由来・実在確認済み 227 冊分） | 生成（再取得時のみ） |

科目トップの内部構造は 5 科目で共通で、次の要素を同じクラス名で持つ。

- `.pr-bar` — アフィリエイト広告の明示（景品表示法のステマ規制対応）
- `.xbar` — 科目切り替えバー。全ページ相互リンクの起点
- `.view` — ホーム / 図鑑 / ルート / 診断 / 学習ガイドの各画面
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
node build/generate-sitemap.mjs    # sitemap.xml（最後に実行する）
```

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
| `build/content/articles.mjs` | 解説記事の本文 |

`ROUTES` の階層は科目によって 3 通りある。理科だけ「トラック → 志望レベル」の順で、他科目とは逆になっている。`generate-routes.mjs` の `normalize()` で吸収しているので、新しい科目を追加するときはここを確認する。

### 記事を追加する

`build/content/articles.mjs` の `ARTICLES` に追加して `generate-articles.mjs` を実行する。決まりごとが 3 つある。

- 難易度・問題数・想定学習時間・到達目安は本文に書かず、`bookTable` ブロックで `BOOKS` から引く。記事とデータがずれるのを構造的に防ぐため
- 本文中の `[[id]]` または `[[id|表示名]]` はその書籍の個別ページへのリンクになる。id が `BOOKS` に無ければビルドが止まる
- 記事を追加したら、ポータル `index.html` の「参考書の選び方を読む」セクションにも手でリンクを足す

## ローカル確認

```bash
python3 -m http.server 8899 --bind 127.0.0.1
```

`http://127.0.0.1:8899/` を開く。ルート相対パス（`/english/` など）を使っているため、`file://` で直接開くと科目間リンクが機能しない。必ず HTTP サーバー経由で確認する。

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
  && node build/generate-articles.mjs && node build/generate-sitemap.mjs
```

反映後、次の 3 点を確認する。

- 書籍詳細ページの「Amazon で見る」に `rel="nofollow sponsored noopener"` が付いている
- フッターに「Amazon のアソシエイトとして、〜は適格販売により収入を得ています。」が出ている
- 「広告について」から「Amazon へのリンクはアフィリエイトタグを含まない通常のリンク」の但し書きが消えている

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
