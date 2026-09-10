# 運用

> 2026-09-11 に README から移した（README を概要と入口だけにするため。改修仕様書 5.1）。「科目トップの `BOOKS` 配列に足す」など、データを HTML に書いていた時代の手順を `data/subjects/<科目>/` の手順に直した。

## 更新手順

```bash
git add -A
git commit -m "feat: <変更内容>"
git push
```

`main` への push で GitHub Pages が再ビルドされる。反映まで 1〜2 分かかる。

参考書を追加・改訂したときは、次の整合を取る。**3〜5 は `build/apply-count.mjs` が
やる**ので、手で数えるのは 1 だけである。

1. 該当科目の `BOOKS` 配列（新刊は `build/data/new-books.json`。「[新刊の掲載](#新刊の掲載)」を参照）
2. `build/` の全スクリプトを、「[ビルド](architecture.md#ビルド)」に書いた順で再実行
3. この README の収録数テーブルと派生統計 ← `apply-count.mjs`
4. ポータル `index.html` の科目カードとヒーローの冊数 ← `apply-count.mjs`
5. 科目トップの title・meta・OG・JSON-LD・本文・ヒーロー統計の冊数 ← `apply-count.mjs`
6. 科目トップの図鑑・ルート一覧・ガイドの静的な中身 ← `prerender-tops.mjs`
7. OGP 画像 ← `gen-ogp.mjs`（`--check` が CI で落とすので、忘れても公開はされない）
8. `assets/x-header.png`（X のヘッダー画像。SVG が正本なので「[画像を書き出す](#画像を書き出す)」の手順で作り直す）

説明文（`desc` / `bestFor` / `pros` / `cons`）を一括で書き換えるときは、書き換え前の
スナップショットを `data/_backup/` に取り、新しい文章を `data/_rewrite/` に置いてから
`build/apply-book-text.mjs` を流し、そのあと 2 以降をやり直す。

### 冊数を古いまま公開しない仕組み

冊数は増え続けるが、増やしたときに `apply-count.mjs` を流すのを忘れる。忘れても
古い数字が公開されないように、**手順書ではなく仕組みで止めている**。

- **`.github/workflows/counts.yml`** — `main` への push のたびに `apply-count.mjs` を
  書き込みモードで流し、直った分を `chore: 冊数の表記を実数に合わせる（自動）` として
  コミットする。そのあと `--check` をもう一度流し、自動で直せないずれが残っていれば
  ジョブを落とす。自動コミットは `GITHUB_TOKEN` による push なので、この workflow を
  再帰的には起動しない
- **`node build/apply-count.mjs --check`** — ずれていれば**終了コード 1 で落ちる**。
  push 前に手元で確かめるときもこれを使う

`apply-count.mjs` は冊数の書かれ方を 3 通りに分けて面倒を見る。

| 種類 | 対象 | 直し方 |
|---|---|---|
| 前回値で置換 | ポータル `index.html`・README の合計と科目別 | `count-state.json` の前回値を新値へ置換する。`title` や `meta` の `content` 属性にはコメントを置けず、プレースホルダ方式が使えないため |
| 文脈で置換 | 科目トップ 7 枚（本文とヒーロー統計）・ポータルの収録大学・README の派生統計・`build/lib/rank.mjs` の説明 | 前後の文脈ごと拾って書き換える。前回値を見ないので何度流しても同じ結果になる |
| 走査して検出 | 生成ページを含む全ファイル | 「◯◯◯冊」（100 以上）を集め、実データから出ない値を報告する。直しはしない |

**収録大学の数も同じ扱いにしてある。** 科目ごとに対応している大学が違い（英語・国語・数学・社会は 160 校、理科は 181 校）、ポータルはその和集合の 181 を出す。ヒーローの `<b id="stat-books">` / `<b id="stat-unis">` は JS が起動後に上書きするが、**クローラーと JS 無効の環境が見るのは HTML に書かれた値**なので、`apply-count.mjs` がそちらもそろえる。2026-09 時点で 5 科目が古い数字（英語 172・国語 152・数学 113・理科 346・社会 250）のまま凍っていた。

**文脈で置換する分は、当たった件数まで検証する。** ポータルと README は前回値を
手掛かりにできるが、科目トップは 9〜11 箇所に同じ数字が散っていて、state と実数が
一致していると置換処理そのものが走らない。そのため 2026-09 時点で 5 科目が古い冊数
（英語 173・国語 152・数学 113・理科 347・社会 267）を表示したままになっていた。
いまは文脈（「参考書◯冊」「最新刊まで◯冊」「参考書おすすめ ◯冊」）ごと拾って
書き換え、**当たる件数が想定と違えばジョブを落とす**。文面を変えて正規表現が外れた
ことを検出できないと、数字だけが黙って古いまま凍りつくためである。文面を変えるときは
`apply-count.mjs` の `subjectTopRules()` と `anchors()` も一緒に直す。

**走査（`sweep()`）は生成ページも見る。** `BOOKS` を増やして生成スクリプトを流し
忘れると、`<科目>/books/` や `<科目>/osusume/` の冊数が古いまま残る。これも実データに
無い値として報告される。数え方は「100 以上の『◯◯◯冊』」で、100 未満を見ないのは
参考書の紹介文に「3 部作の 2 冊目」「アクセス 3 冊で」という書き方が大量にあり
区別が付かないため。冊数ではない数字を報告されたら `build/data/count-ignore.json` に
**理由付きで**登録する。`docs/` は当時の記録なので走査しない。

**OGP 画像に焼き込む冊数は `build/gen-ogp.mjs` が流し込む。** 画像はビルドの生成物で、
数字はテンプレートに書かず `BOOKS` から数える。作り直しは `node build/gen-ogp.mjs`、
作り忘れは `node build/gen-ogp.mjs --check`（CI が push のたびに流す）で落ちる。
2026-08 に置かれた初代の画像は元の SVG も生成手順も無く更新できなかったが、2026-09-04 に
作り直した（「[OGP 画像](#ogp-画像)」を参照）。

**参考書を削除したときは、生成済みの個別ページを手で消す。** 生成スクリプトは書き出すだけで消さないので、`BOOKS` から外しても `<科目>/books/<id>/` が残り、`sitemap.xml`（実ファイルを走査して作る）にも載り続ける。次で孤児を洗い出す。

```bash
node --input-type=module -e "
import fs from 'fs'; import path from 'path';
import {SUBJECTS} from './build/lib/extract.mjs';
import {loadSubjectData} from './build/lib/load-subject-data.mjs';
const bad = [];
for (const s of SUBJECTS) {
  const ids = new Set(loadSubjectData('.', s.dir).books.map(b => b.id));
  const dir = path.join(s.dir, 'books');
  for (const e of fs.readdirSync(dir, {withFileTypes: true}))
    if (e.isDirectory() && !ids.has(e.name)) bad.push(dir + '/' + e.name);
}
console.log(bad.length ? bad : '孤児ページなし');"
```

消したあとに `generate-sitemap.mjs` を流し直す。

診断の質問（`QUIZ`）を変えたときは、あわせて `assets/js/share.js` の `SCHEMA_VERSION` を上げるか判断する。判断の基準は「[共有・保存](sharing.md#共有保存)」の節に書いた。

push の前にテストを流す。何をどのタイミングで流すかは「[テスト](testing.md#テスト)」の表を見る。

```bash
node --test test/share.test.mjs test/search.test.mjs test/pace.test.mjs test/new-books.test.mjs test/mobile-layout.test.mjs test/style-guide.test.mjs
```

## 新刊の掲載

新しく発売された参考書と、サイトに載っていない既刊を随時足すための仕組み。
設計と運用手順の正本は [docs/new-books-plan.md](docs/new-books-plan.md)。

**検知は自動化していない。月 1 回、X の投稿文を作るセッションで Claude が調べる。**
手順は毎月の `docs/x-posts/YYYY-MM.md` の「新刊調査」節に出る（`gen-x-posts.mjs` の
`survey()` が生成する）。調べに行く先は `build/data/publishers.json` が正本。

```bash
node build/apply-new-books.mjs               # 承認済みの新刊を科目 HTML に注入する
node build/apply-count.mjs                   # 冊数の表記を実数に合わせる
node build/gen-x-posts.mjs 2026-09 --force   # F 型が入った月次ファイルに作り直す
```

**調査を B・C・D 型より先にやること。** 新刊が見つかると F 型の枠が増え、その分
A 型が減るため、後からだと作り直しになる。`--force` で作り直しても **A 型の中身は
変わらない**（`used.json` の `byMonth` がその月の分を覚えている）。

楽天ブックス書籍検索 API を週次で叩く案は実装まで進めたが捨てた。アプリ登録が
**IP アドレスの許可制**で、GitHub Actions の実行 IP（7,000 以上のレンジ）を
登録しきれないためである。経緯は [docs/new-books-plan.md](docs/new-books-plan.md) の 3 節。

同じ理由で、**書籍ページの楽天リンクは商品ページではなく ISBN の検索結果ページ**へ飛ぶ。
楽天ブックスの商品 URL に入っているのは楽天内部の商品 ID で、ISBN からは作れず、
対応表はこの API でしか取れない。ボタンの文言は「楽天ブックスで検索」にして
遷移先と表示を一致させてある。Amazon 側は ISBN-10 から `/dp/<ISBN10>` を直接作れる。

### 評価が未了の本の扱い

**新刊は現物を読んでいないので、難易度・到達目安・強み・注意点・向いている人を
書かない。** 推測で埋めると、既存 1,390 冊を並べている 10 段階の物差しが狂う。
書名・出版社・ISBN・刊行年といった検証できる事実と、役割（`stage`）だけを入れ、
`provisional: true` を立てて「新刊・評価準備中」と画面に明示する。

判定の根拠は `provisional` の 1 か所だけにしてある。生成側は
`build/lib/newbooks.mjs` の `isProvisional()`、科目トップは各 `index.html` の
`isProv()` が持つ。**文言（「新刊・評価準備中」）は両方に書いてあるので、
変えるときは `rg` で全箇所を出してから直す**（`X_HANDLE` と同じ注意）。

`diff` を持たない本は 3 通りに壊れる。描画を触るときはこの 3 つを確かめる。

| 壊れ方 | 症状 |
|---|---|
| `${b.diff}` の素の埋め込み | 画面に `undefined` が出る |
| `b.pros.map()` / `b.subjects.split()` / `b.fb.bg` | **TypeError で描画そのものが止まる** |
| `d<=2 ? … : 最難関` 形の分類 | 比較が全部 false になり、**静かに最難関へ化ける** |

3 つ目が最も危ない。科目トップの `bookLv()`（英語のみ）と `diffColor()` が該当する。
`test/new-books.test.mjs` が全科目に分岐が入っていることを見張っている。

評価が固まったら `build/data/new-books.json` から消し、`data/subjects/<科目>/books.json` の本体へ
`provisional` を外した完全なエントリとして移す。**JSON に残っている数が評価の
残作業そのものになる。**

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

生成ページ側は `build/lib/extract.mjs` の `affiliateEnabled()` が各科目の `CONFIG` を読んで同じ判定をする。**ID を入れたあとは必ず全ページを再生成する。**

### Amazon アソシエイトに申請して承認されたら

```bash
# 全科目 + ポータルへ一括反映する（ID は自分のものに置き換える）
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

## Google AdSense

ページに Google の広告枠を置き、表示・クリックに応じて収益を得る仕組み。アフィリエイトと違って
「読まれるだけ」で収益が立つ一方、単価は低い（一般に 1,000 表示あたり数十〜数百円）。
参考書の紹介リンク（Amazon・楽天）とは併用できる。

### 状態は ID 1 つで決まる

アフィリエイト ID と同じ考え方で、**ID が入っていないあいだは広告も広告の表記も一切出力しない**。
`build/lib/ads.mjs` の `ADSENSE_CLIENT` が空なら、生成されるページに AdSense 由来の記述は 1 文字も残らない。

ID の置き場は 3 種類ある（生成側の定数・手書き HTML の `<head>`・手書き HTML の `CONFIG`）。
手で書き換えると必ずどれかが取り残されるので、**書き換えは `build/apply-adsense.mjs` に集約する。**

```bash
node build/apply-adsense.mjs --check                    # いまの状態を全箇所ぶん表示する
node build/apply-adsense.mjs ca-pub-1234567890123456    # 有効にする
node build/apply-adsense.mjs --off                      # 取り消す（ads.txt も消える）

# 広告ユニットを作ったあとにスロット ID を入れる
node build/apply-adsense.mjs ca-pub-1234567890123456 \
  --in-article=1234567890 --bottom=9876543210
```

実行したら**生成ページを全部流し直す**。`apply-adsense.mjs` は生成物に触らない。

### ID の有無で自動的に変わるもの

| 箇所 | 未設定 | 設定済み |
|---|---|---|
| 全ページの `<head>` | 何も入らない | AdSense のローダーを静的に出力 |
| 本文中・本文末の広告枠 | 出さない | スロット ID がある枠だけ出す |
| ページ最上部の PR バー | アフィリエイトの文だけ | 第三者配信広告の一文を追加（手書き HTML の静的な PR バーも `apply-adsense.mjs` が書き換える） |
| プライバシーポリシー | AdSense の節を出さない | Cookie・パーソナライズ広告の停止方法を明記 |
| 「広告について」 | AdSense の節を出さない | 第三者配信であることを明記 |
| `ads.txt` | 存在しない | `google.com, pub-…, DIRECT, f08c47fec0942fa0` |

ローダーは JS で差し込まず、**HTML に静的に書き出す**。審査時の Google のクローラーは
HTML そのものからこのタグを探すため、動的に足すと検出されないことがある。

PR バーの文言は「掲載しています」ではなく**「掲載することがあります」**にしてある。
審査の通過前や、広告ユニットを 1 つも置いていない状態では実際に広告が出ないため、
断定すると事実に反する。ローダーの設置と実際の配信開始にはずれがある。

### 広告枠の位置

`AD_SLOTS` の 2 種類だけを使う。増やすときは `build/lib/ads.mjs` に足して、各生成スクリプトから呼ぶ。

| キー | 位置 | 入るページ |
|---|---|---|
| `inArticle` | 本文の途中 | 書籍詳細（「どんな人に向いているか」の直後）・解説記事（目次の直後） |
| `bottom` | 本文の終わり | 書籍詳細・解説記事・記事一覧・参考書一覧・おすすめ・ルート一覧・ルート詳細 |

科目トップ（SPA）とポータル・404 にはローダーだけを置き、手動の広告枠は置かない。
枠には必ず「広告」のラベルを付ける（`.ad-slot__t`）。広告をコンテンツと誤認させる配置は
AdSense のポリシー違反になるため、ラベルで明確に分ける。

購入ボタンのすぐ上下には枠を置かない。誤クリックを誘う配置とみなされるおそれがあるため、
書籍ページの `bottom` は「購入する」ではなくページ末尾の CTA の後ろに置いている。

### 審査に出すときの注意

- 申し込みの時点で `ca-pub-…` は発行される。**承認前にローダーを設置しておく必要がある**ので、
  ID を受け取ったらすぐ `apply-adsense.mjs` で反映して本番へ push する
- スロット ID（広告ユニット）は**承認後**でないと作れない。承認までは `AD_SLOTS` は空のままでよい
- 承認後は、管理画面の「自動広告」を使うか、広告ユニットを作って `--in-article` / `--bottom` に渡すかを選ぶ。
  自動広告は全画面広告（ビネット）を差し込むことがあるので、入れる場合は管理画面で個別に切る

#### 2026-09-05 の不承認と、そのとき打った手

**「有用性の低いコンテンツ」で不承認になった。** 原因は生成ページの共通テンプレートが本文量の
過半を占めていたこと。対応として「この情報の確かめ方」ブロックを全ページから削除し、
1 ページあたりの共通テンプレートを **2,195 → 1,317 字（−40%）**、オリジナル比率を
**47% → 60%** にした（`28955d2ac`）。

**再審査はまだ申請していない。** 申請前に判断すべき点が 1 つ残っている。
**1 冊あたりのオリジナル文は 200 字のままで、ここは今回の対応で変わっていない。**
効き目が大きいのは**記事を 13 → 25 本に増やす**ことなので、記事を足してから
再審査に出すかどうかを決める。

## X アカウント

公式アカウントは `@route_taizen`。運用設計の正本は [docs/x-account-plan.md](docs/x-account-plan.md)。

ハンドルの正本は `assets/js/subject-common.js` の `X_HANDLE` の 1 か所だけ（2026-09-11 から。
改修仕様書 5.5）。**変えるときはここを直して `npm run build` を流す。**ほかの置き場はすべてここから読むか、
生成で書き込まれる。

| 読む側 | 用途 |
|---|---|
| `build/lib/extract.mjs` の `X_HANDLE`（subject-common.js を読んで再 export） | 生成ページの `twitter:site`・共有ボタンの `via=`・フッターの導線 |
| `assets/js/share.js`（押された時点で `window.RTCommon.X_HANDLE` を読む） | 診断結果とルート画面の共有ボタンの `via=` |
| `build/apply-site-meta.mjs` | 手書き HTML 8 枚（ポータル・科目トップ 7 枚）の `twitter:site` メタと、ポータルの JSON-LD の `sameAs` |
| `build/apply-footer.mjs` | 手書き HTML 9 枚（404 を含む）のフッターの導線 |

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

出力は `docs/x-posts/YYYY-MM.md`。1 か月分がこのファイル 1 枚に収まる。

| 中身 | 誰が作るか |
|---|---|
| 新刊調査の手順・調べに行く先・収録状況 | スクリプト（Claude が読んで作業する） |
| A 図鑑カード / E エンタメ / F 新刊速報 | スクリプトが `BOOKS` と `new-books.json` から組み立てる |
| B ルート提示 / C 判断基準 / D 対決 | 空欄。Claude が書く |

空欄を埋めるときに渡すのは**このファイルだけでよい**（科目トップの HTML は読ませない）。
判断に要る集計はファイル内に出してある。

`.github/workflows/x-posts.yml` が毎月 1 日に実行してコミットする。同じ月が既に
あれば作り直さない。作り直すには `--force` を付ける。

**`--force` で作り直しても A・E 型の中身は変わらない。** `used.json` の `byMonth` が
その月に選んだ本を覚えており、作り直すときはそれを「既出」から外して選び直すため。
これがないと「新刊を調べてから月次ファイルを作り直す」という運用が成り立たない。

`BOOKS` の `diff` は **1〜10 の 10 段階**である。投稿でも `build/lib/cards.mjs` と
同じ 10 段階で書く。5 段階の星に丸めると、サイトを開いた読者が見る数字と食い違う。

## OGP 画像

> **2026-09-11 から OGP 画像はリポジトリにコミットしない**（`.gitignore` の `assets/ogp/` `assets/ogp.png` `assets/ogp-*.png`）。
> 公開物は `.github/workflows/pages.yml` が CI で作り、`dist/` に入れる。**ローカルで見るときだけ `npm run ogp` を流す。コミットしない。**
> ハッシュ台帳 `build/data/ogp-hashes.json` はコミットする（`test.yml` は `gen-ogp.mjs --check --no-files` で台帳だけを見る。
> 画像の無い環境の `check-site.mjs` は `RT_OGP_FROM_LEDGER=1` で台帳を実在の代わりにする）。本番に画像が出ているかは
> `npm run check:production` が `/assets/ogp/english/rules4.png` で確かめる。

SNS やチャットにリンクを貼ったときに出る 1200×630 の画像。**全部がビルドの生成物**で、
`node build/gen-ogp.mjs` で作り直せる。

| 画像 | 何を出すか | どのページが指すか |
|---|---|---|
| `assets/ogp.png` | サイト名・7 科目・**合計冊数** | ポータル・信頼性ページ・科目に属さない記事 |
| `assets/ogp-<科目>.png` | 科目名・分野・**その科目の冊数**・役割の一覧 | 科目トップ・一覧・おすすめ・ルート・その科目の記事 |
| `assets/ogp/<科目>/<id>.png` | 書名・役割・難易度・到達目安 | 参考書 1 冊の詳細ページ |

**冊数はテンプレートに書かない。**`BOOKS` から数えて流し込む。初代の OGP は画像に数字を
焼き込んだまま元の SVG が残らず、冊数が増えても直せなくなっていた。同じことを繰り返さない
ために、数字の出どころはデータだけにしてある。

数字の出し方はサイトの他の画面と同じ判断にそろえる。

- 評価が未了の新刊（`provisional: true`）は難易度も到達目安も持たないので出さない。役割だけを出す
- レベル別・分冊・参照系（`build/lib/series.mjs` の `seriesOf()`）は、難易度の数字の代わりに
  「レベル別 6 巻」「全レベル（調べ先）」のような注記を出す。**数字を単独で読ませない**
- 書名は略さない。2 行に収まる大きさを大きいほうから探し、どうしても入らないときだけ末尾を「…」で切る

### 作り直し

```bash
npm ci                     # @resvg/resvg-js と sharp。初回だけ
node build/gen-ogp.mjs
```

- **変わった画像だけを書き出す。** SVG の文字列のハッシュを `build/data/ogp-hashes.json` に
  持ち、前回と同じならスキップする（毎回 1,390 枚を書き換えると git の履歴が膨らむ）
- 量子化やレイアウトを変えたときは `build/gen-ogp.mjs` の `RENDER_VERSION` を上げる。
  上げないと SVG が同じ画像が古い設定のまま残る
- `BOOKS` から消えた本の画像は自動で削除する

### フォント

ラスタライズに使う書体は Zen Kaku Gothic New と Shippori Mincho B1（サイト本文と同じ）。
**`loadSystemFonts` に任せない。**環境によって字形も行送りも変わり、同じデータから違う画像が出て
`--check` が手元と CI で食い違う。初回だけ Google Fonts から取って `build/.cache/fonts/` に置き、
以後はそれを使う。**フォントファイルはリポジトリに入れない**（ライセンス表記と容量のため。
`.gitignore` 済み）。`--check` は画像を作らないのでフォントを取りに行かない。

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
| Google Search Console | 所有権確認メタ設置済み。**サイトマップの送信は未了** | インデックス登録・検索順位の把握 | ポータルと科目トップの `<head>`。送信する URL は `https://route-taizen.com/sitemap.xml` |
| Google アナリティクス 4 | 導入済み（`G-DQ5WFXEFMX`） | アクセス解析 | 手書き HTML 9 件（ポータル・科目トップ 7 枚・404）と `build/lib/parts.mjs` の `analytics()` |
| Google AdSense | ID 設置済み・**審査に落ちた**（`ca-pub-4704595822429716`）。2026-09-05 に「ポリシー違反：有用性の低いコンテンツ」の通知。**再審査は未申請**（「[審査に出すときの注意](#審査に出すときの注意)」を参照） | ページ表示による収益化 | `build/lib/ads.mjs` の `ADSENSE_CLIENT`（`apply-adsense.mjs` が全箇所へ反映） |
| 楽天アフィリエイト | 導入済み | 書籍リンクの収益化 | 科目トップとポータルの `CONFIG.rakutenId` |
| Amazon アソシエイト | 導入済み（`routetaizen-22`） | 書籍リンクの収益化 | 科目トップとポータルの `CONFIG.amazonTag` |
| IndexNow | 通知済み | Bing・Yahoo・DuckDuckGo・Yandex への即時インデックス通知 | サイト直下の `<キー>.txt` と `build/submit-indexnow.mjs` |
| Bing Webmaster Tools | 未登録 | Bing の掲載状況の確認 | — |

広告表記は ID の有無だけを根拠に自動で出し分ける。ID が入っている販売サイトだけを広告リンクとして扱い、もう一方はタグ無しの通常リンクとして扱う（未参加のプログラムの表記を出さないため）。詳細は「[アフィリエイト ID の設定](#アフィリエイト-id-の設定)」を参照。

測定 ID を変えるときは、手書き HTML と `parts.mjs` の両方にあるので `rg G-DQ5WFXEFMX` で全箇所を出してから直す。

## リポジトリの説明

GitHub の Description と Topics を実態に合わせたときのコマンドと完了判定（2026-09-08 実施。README の「運営者が行う手動設定」から移した）。

- [x] Description を実態に合わせる。冊数を書かない案（増えるたびに古くなるため）:

      ```bash
      gh repo edit daichi-ikeda-170329/study-route-compendium \
        --description "大学受験の参考書を科目・目的別に整理し、学習ルートと進捗管理を提供する静的サイト"
      ```

      完了判定: `gh repo view --json description` の出力に `1,052` が含まれないこと。

- [x] Topics を実態に合わせる。

      ```bash
      gh repo edit daichi-ikeda-170329/study-route-compendium \
        --add-topic static-site --add-topic github-pages --add-topic education --add-topic japanese
      ```

      完了判定: `gh repo view --json repositoryTopics` が `null` でないこと。
