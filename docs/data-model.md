# データモデル

> 2026-09-11 に README から移した（README を概要と入口だけにするため。改修仕様書 5.1）。`extractSubject()`（2026-09-05 に削除）を使うコード例を `loadSubjectData()` に書き換え、「科目トップの `BOOKS` を手で編集する」という記述を `data/subjects/<科目>/books.json` に直した。


## データの置き場と読み口

**科目データの正本は `data/subjects/<科目>/` の JSON だけ。** 読むのは `build/lib/load-subject-data.mjs` の
`loadSubjectData(ROOT, dir)` の 1 本で、生成スクリプトもテストも必ずここを通す（別の読み口を作らない）。
形の検査は `build/lib/validate-subject-data.mjs`（`npm run check:data` が流す）。

| ファイル | 戻り値のキー | 中身 |
|---|---|---|
| `books.json` | `books` | 参考書 1 冊 1 レコード（下の表） |
| `routes.json` | `routes` / `tiers` | 志望レベルの定義と、志望レベル × トラック × 方針のルート |
| `universities.json` | `unis` | 大学ごとの出題形式・目標偏差値など（科目ごとに持つ項目が違う） |
| `guides.json` | `guides` | 科目トップの学習ガイド（`t` 見出し・`s` 副題・`b` 本文 HTML）。`/<科目>/guides/basics/<nn>/` にもなる |
| `stages.json` | `stages` | 役割（段）の定義（`label` / `short` / `color`） |
| `config.json` | `config` | アフィリエイト ID・AdSense ID・トラックの表示名（`trackLabels`） |
| `focus.json`（任意） | `focus` | 出題形式 → 重点対策の本（英語だけ）。無い科目は `{}` |

どのファイルもトップレベルに `schemaVersion: 1` を持つ。書式は `serializeCanonical()`（1 レコード 1 行）。

### `books.json` の項目

| 項目 | 型 | 意味 |
|---|---|---|
| `id` | string（必須） | URL に使う id（`/<科目>/books/<id>/`）。**公開後に変えない** |
| `name` | string（必須） | 図鑑の一覧で使う短い呼び名。表示は `displayName()`（下の「書名と著者名の決め方」）を通す |
| `official` | string | 正式名称 |
| `stage` | string（必須） | 役割。`stages.json` のキー |
| `sub` | string | 分野（現代文・物理・日本史 …）。国語・理科・社会だけ |
| `pub` / `year` / `isbn10` / `isbn13` | string / number | 書誌情報 |
| `diff` | number | 難易度（1〜10 の整数）。評価未了の新刊は持たない |
| `hensachi` | string | 到達目安（全統記述模試の換算） |
| `problems` / `hours` / `h` / `style` / `subjects` | string / string / number / string / string | 問題数・想定学習時間（文字列と代表値）・形式・対象範囲 |
| `desc` / `bestFor` / `pros` / `cons` | string / string / array / array | 説明文・向いている人・強み・注意点 |
| `bunri` | string | `bun` / `ri` / `both` |
| `unis` | array | この本が向く大学・層のタグ |
| `recordType` | string | `book`（既定）か `routePlaceholder`（ルート上の枠） |
| `provisional` | boolean | 評価未了の新刊 |
| `cover` / `coverExample` / `nocover` / `fb` | — | 書影（下の「書影」） |
| `pages` / `media` / `toc` | number / array / array | 書誌で確かめたページ数・付属（`音声` `アプリ` `電子版` `動画` `別冊解答`）・目次の大きな単位（12 項目まで）。推測で書かない |
| `howto` / `finish` | array / string | 使い方の手順（`phase` は `1周目` `2周目` `3周目以降` `仕上げ`）・終わりの基準。編集部の推定 |
| `editions` | array | 改訂の履歴 `{year, note}`。書誌で確かめた版だけ |

### `routes.json`

```
tiers:  [{ id, no, name, sub, color, goal, hensachi }, …]   並びが志望レベルの順
routes: { <tier>: { <トラック>: { omni: [step…], quick: [step…] },
                    para: { <トラック>: [step…] } | [step…],   並行して進める本
                    final: { <トラック>: [step…] } | [step…] } }
step:   { id, role, lvl, note, alts: [id…] }
```

トラックは科目で意味が違う（英語の `bun` / `ri` は国公立二次型・私立個別型、数学は文系・理系、
国語・理科・社会は分野）。表示名は `config.json` の `trackLabels`、無ければ `SUB_LABELS`。
扱いは `build/lib/tracks.mjs`（本編が同じトラックは `groupTracks()` で 1 節にまとめる）。
志望レベルの科目共通の帯（早慶上智など）は `build/lib/tiers.mjs` の `TIER_GROUP`。

### `universities.json`

全科目で `n`（大学名）・`a`（別名）・`t`（志望レベル）・`ty`（区分）・`h`（目標偏差値）・`no`（出題の特徴）を持つ。
英語は `fx`（重点対策の形式。`focus.json` のキー）、国語は `g` `k` `kan` `ri` `time`、理科は `p` `c` `b` `g` `need` `fix` `med` `bun` `time`、
社会は科目ごとの可否と `n2` `ri` `kyote_bun` `kyote_ri` `time` を持つ。値の読み方は各科目の `resolveUni()` と
`build/generate-universities.mjs` の説明にある。

大学別ページの URL は `build/data/university-slugs.json`（公開後に slug を変えない）、出典の年度・確認日・
公式 URL・学部×方式は `build/data/university-sources.json`（形は `build/lib/university-sources.mjs`）。

### 配信する形

科目トップへは `build/lib/subject-assets.mjs` の `buildAssets()` が `assets/generated/subjects/<科目>.<種類>.json`
（`core` `books` `routes` `unis` `guides`）として配る。`books` には表示名 `dn`（略称の本だけ）、`routes` には `focus`、
`core` には画面に出す注記の文言（`legal`）が足される。

## 参考書図鑑の分け方

科目トップの図鑑は、並べ替えの既定を「まとまりごと × 難易度順」にしてある。過去問と共通テストは役割（`stage`）として独立しているので、この表示にすると参考書とは別のまとまりになる。

| 科目 | まとまりの作り方 | 並べ替えの選択肢の名前 |
|---|---|---|
| 英語・数学・情報・小論文 | 役割（`STAGES`）ごとに 1 セクション | 分野別・難易度順 |
| 国語・理科・社会 | 科目（現代文／物理／日本史 …）ごとに大見出し、その中を役割ごとに小見出し | 科目別・難易度順 |

国語・理科・社会の科目の分け方は、各科目トップの `catGroups()` が持つ。**絞り込みチップの `SUBFILTER` とは別物**で、`SUBFILTER` は「古文」と「漢文」の両方に `koten` を出すなど重複を許すのに対し、`catGroups()` は 1 冊が 1 か所にだけ出るようにしてある。`catGroups()` のどれにも当たらない本は末尾の「その他」に出るので、そこに本が現れたら `catGroups()` へ足す。

`catGroups()` は `SUBJ` の宣言より前に置いてあるため関数にしてある（`const` にすると初期化前アクセスで `BOOKS` の取り出しごと落ちる）。

生成ページの参考書一覧（`/<科目>/books/`）は、以前から役割ごとのセクションに分かれている。こちらは役割が大見出し・分野が小見出しで、図鑑とは入れ子の向きが逆である。

## 難易度順の並び

図鑑・一覧・おすすめ・書籍ページの「次に進む本」は、すべて同じ規則で並べる。

1. 評価が未了の新刊（`provisional`）は必ず末尾
2. `diff`（1〜10）の昇順
3. 目安偏差値の下限 → 上限
4. 書名

**`diff` だけで並べると難易度順に見えない。** 同じ `diff` の中に「40〜55」「〜48」「35〜50」が混ざり、画面上は偏差値が前後する。3 を足して初めて単調に並ぶ。

目安偏差値は「共テ7割〜9割」「東大合格レベル」「全レベル」のように偏差値で書けない本がある。これらは偏差値の軸に乗せず、同じ `diff` の中で数値の本のうしろへまとめる（混ぜると得点率の「7」が偏差値として並び、偏差値 40 の本より前に出る）。降順のときも先頭へ出さない。該当する冊数は次で数える。

```bash
node --input-type=module -e "
import {SUBJECTS} from './build/lib/extract.mjs';
import {loadSubjectData} from './build/lib/load-subject-data.mjs';
import {hensachiRange} from './build/lib/rank.mjs';
let n = 0, t = 0;
for (const s of SUBJECTS) for (const b of loadSubjectData('.', s.dir).books) { t++; if (hensachiRange(b)[0] === 999) n++; }
console.log(n + ' / ' + t);"
```

実装は 2 か所にある（生成ページは `build/lib/rank.mjs`、科目トップは `assets/js/subject-<科目>.js` の描画コード）。`test/new-books.test.mjs` が両方を動かして一致を確かめる。

| 置き場 | 使う画面 |
|---|---|
| `build/lib/rank.mjs` の `byDifficultyAsc()` / `byDifficultyDesc()` / `hensachiRange()` | 生成ページ |
| 科目トップの `byDiffAsc()` / `byDiffDesc()` / `hRange()` | 科目トップの図鑑 |

`test/new-books.test.mjs` が両方を実際に動かして、同じ並びになることと評価未了の本が末尾に来ることを確かめている。

## 難易度スケール

難易度は**サイト全体で共通の 1〜10 の 10 段階**。役割（導入 → 網羅 → 標準 → 応用 → 実戦）は別の軸で、数字とは混ぜない。到達目安の偏差値は**河合塾全統記述模試の換算値**で、ルート画面は模試の種類を選ぶと全統換算に直してから比較する。

定義は `build/lib/scale.mjs` の `LEVELS` が正本で、表示も同じファイルの `degreeTable()` が出す。**この文言を各ページに書き下ろさない。** 2026-09 の点検では、トップに「難易度は共通の1〜5段階」、書籍詳細に「10段階中7」、一覧に「難易度 7」と 3 通りが同居していた。定義を 1 か所に閉じ込めたのはこれを繰り返さないため。

読者向けの説明ページは `/methodology/`。難易度・到達目安・想定学習時間のどれが公開情報でどれが編集部の推定値かを分けて書いてある。

## 参考書どうしの接続

書籍ページの「同じ役割・同じレベルの参考書」「この本のあとに進む参考書」は自動生成する。規則は 2 つだけ。

1. **同じレベルの選択肢** — 同じ役割・同じ分野で、難易度の差が 1 以内
2. **次に進む本** — ①同じ役割のまま難易度が上の本、②`build/lib/flow.mjs` の接続表に載っている「次の役割」の本

**`STAGES` の並び順で「自分より後ろの役割」を全部拾ってはいけない。** そうすると英文解釈のページに英作文の本が「次に進む本」として並ぶ（解釈 → 英作文は積み上げの順序ではなく別トラック）。並行して進めるトラック（英語のリスニング・英作文、社会の資料集）は接続表に入口を持たず、ルート画面の並行枠と図鑑から辿る。

科目トップの `STAGES` にキーを足したら `flow.mjs` にも足す。足し忘れは `check-site.mjs` が落とす。

## 複数の巻を 1 レコードで持つ本

「英文法レベル別問題集(1〜6)」「データベース(3300/4800)」のようなシリーズは 1 冊として持っている。そのままだと難易度の数字がシリーズ全体の代表値になり、「この本は難易度 3」と読まれてしまう（実際は巻によって 2〜7 に散る）。

**巻ごとに分割しない。** 分割すると巻ごとの ISBN・刊行年・問題数を現物なしに埋めることになり、このサイトが守っている「確認していない数字を置かない」に反する。代わりに、シリーズであることを表示に出して数字を単独では読ませない。

判定は `build/lib/series.mjs`。根拠は `BOOKS[].hensachi` の末尾に既に入っている注記で、新しいフィールドは増やしていない。

| 注記 | 意味 | 表示 |
|---|---|---|
| `(6段階)` | レベル別に 6 巻ある | 「レベル別 6 巻」 |
| `(2冊構成)` `(3分冊)` | 複数冊で 1 セット | 「2 冊構成」 |
| `(全レベル)` `(全期間)` `(通読)` | 総合英語・辞書のように学習中ずっと引く本 | 「全レベル（調べ先）」 |

`check-site.mjs` は、レベル別・複数冊の本に**到達目安が範囲であること**を求める。
「45〜65」だけでなく、下限を書かない「〜70」も範囲として認める（「最初の巻から 70 まで」の意味で、
数字を単独で読ませてはいないため）。参照系（`(全レベル)` `(全期間)` `(通読)`）は通読して終える本ではなく
到達点そのものを持たないので、範囲を求めない。**足りないぶんを `hensachi` に数字で埋めて黙らせない。**

## 書影

書影は Amazon・国立国会図書館サーチ・openBD が公開している商品画像 URL を参照するだけで、保存も加工もしない。どれも取れない本があるので、書名と出版社を出す代替表示を必ず画像の下に敷いてある。

**自前ホストへの切り替えはしない**（画像の著作権は各出版社・著作権者にある）。代わりに、生きているかどうかを週 1 回外から確かめる。

```bash
node build/check-links.mjs --covers          # 書影だけ
node build/check-links.mjs --limit=40        # 手元での動作確認
```

`.github/workflows/links.yml` が毎週月曜に流す。**このジョブは落とさない**（外部サービスの一時的な不調で毎週赤くなると、本当の欠損に気づけなくなるため）。結果はジョブのサマリで読む。全候補とも取れない本が出たら、出版社の商品画像を `cover` に入れるか `nocover` を立てる。

候補 URL の作り方は 2 か所にある。同じ順番（`cover` → Amazon 2 種 → NDL → openBD）で並べること。

| 置き場 | 使う画面 |
|---|---|
| `build/lib/cover.mjs` の `coverSrcs()` / `coverBox()` | 生成ページ（一覧・おすすめ・ルート・書籍ページ・解説記事） |
| 科目トップの `coverSrcs()` / `coverHTML()` | 科目トップ（図鑑・ルート・診断結果・モーダル） |

Amazon は画像を持たない ISBN に対して 43 バイトほどの 1x1 画像を HTTP 200 で返すことがある。この場合 `onerror` は発火しないので、表示側で `naturalWidth` を見て次の候補へ送っている。**この分岐を消すと、真っ白な書影が並ぶ。**

### `cover` — 出版社の商品画像を直接指す

学校専売の傍用問題集・図録・検定教科書は、Amazon にも NDL にも openBD にも商品画像が無い。この種の本だけ、出版社が公式サイトで公開している商品画像 URL を `BOOKS[].cover` に持たせて最優先で参照する。現在 121 冊が該当する（内訳は下のコマンドで数える）。

```bash
node --input-type=module -e "
import {SUBJECTS} from './build/lib/extract.mjs';
import {loadSubjectData} from './build/lib/load-subject-data.mjs';
for (const s of SUBJECTS) {
  const b = loadSubjectData('.', s.dir).books;
  console.log(s.ja, 'cover:' + b.filter(x=>x.cover).length, 'nocover:' + b.filter(x=>x.nocover).length);
}"
```

`cover` を足すときは URL を実際に開き、**縦長の表紙画像であること・透かし（Sample など）が入っていないこと・斜めから撮った 3D 画像でないこと**を目で確かめる。出版社サイトの改修で URL が切れたら代替表示に落ちるので、書影が消えた報告があったらまずここを疑う。

**東京書籍の教科書は `ten.tokyo-shoseki.co.jp/text/hs_current/…` を参照している。`hs_current` は「現行年度版」を指す可動パス**で、年度が替わると同じ URL の中身が新版に差し替わる。年度替わりには、表紙左上の教科書番号（「2 東書 日探701」など）が収録データと合っているかを確認する。

### `coverExample` — ルート上の枠に添える見本

「志望校の大学別過去問題集」のようなルート上の枠（`recordType: 'routePlaceholder'`）は特定の商品ではないので、ISBN も `cover` も持たない。ところが枠だけ書影が無いと、一覧とルートの中でそこだけ代替表示（書名＋出版社の地色）になり、並びから浮く。`BOOKS[].coverExample` は**その枠がどんな本を指すかを示す見本**で、赤本の見た目が分かる例として大学赤本シリーズ「東京大学（理科）」（ISBN 978-4-325-27394-3）を使っている（2026-09-05 の判断）。

**見本は表示だけの話で、枠の性質は変えていない。** 枠は ISBN も購入リンク（Amazon 検索へ送る）も Book JSON-LD も持たないままで、書籍ページの画像の `alt` にも見本であることを書く。2026-09 まであった誤りは「枠に東大の赤本の ISBN を入れ、購入リンクと構造化データまで東大の赤本を指していた」ことであって、見本の画像を出すこと自体ではない。`cover` は実在の 1 冊にだけ、`coverExample` は枠にだけ許す（`build/lib/validate-subject-data.mjs` が両方向を検査する）。

### `nocover` — 商品画像がどこにも無い本

**未発売の本は、Amazon が「書名だけを刷った自動生成画像」を返す。** 1x1 でも 404 でもないので `naturalWidth` の分岐にも `onerror` にも掛からず、そのまま書影として表示されてしまう。どこを探しても実物の表紙が無いと確認できた本には `nocover: true` を立て、候補を空にして代替表示（書名＋出版社）へ落とす。

判定は `build/lib/cover.mjs` の `coverSrcs()` と科目トップの `coverSrcs()` の 2 か所にある（`rg 'nocover'` で全箇所を出す）。

**現在 `nocover` を立てている本は無い。発売前の本はサイトに載せない方針にしたため**（2026-09-03 の判断）。ルート上の枠（`akahon`）も 2026-09-05 に `nocover` をやめ、上の `coverExample` で見本を出すようにした。旺文社「時間をかけたくない受験生のための共通テスト」の生物基礎・地学基礎は、発売が 2026-10-19 で書影がどこにも存在しなかったため収録を取り下げた。発売後に改めて足す。

分岐そのものは残してある。**新刊（`provisional`）は発売直後に載せることがあり、そのとき書影がまだ出回っていない**ためで、そのときは推測の画像を出すより代替表示に落とすほうが正しい。「書名だけが書かれた画像が出ている」という報告が来たら、実物の表紙が本当に無いかを確かめたうえで `nocover` を立てる。

## 書名と著者名の決め方

検索されたときに見つかる形を `build/lib/booktitle.mjs` が決める。`title` / `h1` / パンくずはここを通す。

`BOOKS[].name` は図鑑で使う短い呼び名で、たいていはそのまま検索語になる（「速読英単語 入門編」「英文法ポラリス1」）。ただし一部は編集上の内部略称で、誰も検索しない形になっている（「河合 黒本」「東書『公共』」）。`name` の文字が `official` に 75% 未満しか含まれない本を略称とみなし、そのときだけ `official` を整えて使う。現在 80 冊が該当する。

著者名は `build/data/authors.json` から引く。作るのは `build/fetch-authors.mjs` で、各書の ISBN を **openBD** と **国立国会図書館サーチ** に投げて人名を取得する。342 冊分ある。どちらの API にも著者記載が無い本は、API が実在を確認した人名が `official` に現れる場合にのみ付ける。出版社名・団体名（塾・社・出版・書店・編集部 など）は著者から除外している。

**推測で著者名を補わない。** 判明しない 1,048 冊は未収録のままにし、生成側は著者欄そのものを出さない。大学受験参考書は編集部名義が多く、書誌データベースに個人著者が載らないものが実際に多数ある。

**書誌データベースの人名は「姓, 名, 生年-」の形で返る**（「西, きょうじ, 1963-」）。これをカンマで割って短い断片を捨てると、姓が 1 文字の著者は姓ごと消えて「きょうじ」になる。2026-08 に作った `authors.json` はこの壊れ方をしていて、ポレポレの著者が「きょうじ」、透視図が「中尾・全人・玉置・篠田・重晃」の 5 人に化けていた。`fetch-authors.mjs` は姓と名を連結して 1 人分に戻し、生没年を落とす。

openBD は同じ ISBN に対して null を返すことがある（時期によって変わる）。取り直すたびに著者欄が消えたり出たりしないよう、**前回の結果にあった名前は「今回どこかの本で API が返した人名と完全一致する場合にかぎり」引き継ぐ**。名前を新しく作ることはない。

`official` が「著者名の◯◯」という形を取っている本だけ、`title` と `h1` を著者名込みにする（「関正生の英文法ポラリス1」）。40 冊が該当する。書名にすでに著者名が入っている本には付けない。

著者データを取り直すときは `node build/fetch-authors.mjs` を流す（NDL は 1 冊 1 リクエストなので数十分かかる。`--no-ndl` で openBD だけにもできる）。`authors.json` の `_provenance` に取得日と手順が入る。
