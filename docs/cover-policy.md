# 書影（表紙画像）の扱い

最終更新: 2026-09-05

**「書影 URL を使っている」ことと「使ってよい」ことは別のことである。**
この文書は、いまサイトが**どこの画像を参照しているか**を書き出し、
**利用条件がまだ確認されていない**ことをはっきりさせるために置く。

---

## 1. いまの状態（事実）

| 項目 | 内容 |
|---|---|
| 保存しているか | **していない。** 画像はどこにも複製せず、外部の URL を `<img src>` で参照するだけ |
| 加工しているか | していない |
| 取得元の数 | 生成する候補は 6 種類（下の 2 節）＋ 個別に指定した URL 16 ホスト |
| 利用条件の確認 | **すべて未確認**（`termsReviewed: false`）。誰も規約を読んでいない |

正本は次の 2 つ。

- `build/data/cover-provider-policies.json` — 取得元と、その確認状況
- `build/data/cover-ledger.json` — 1 冊ごとに、どの取得元をどの順で試すか（生成物）

`assets/js/cover-policies.js` は、画面側が読むために `enabled` と `hostPatterns` だけを
書き出した生成物。**確認状況は公開しない**（サイトの表示に関係しないため）。

## 2. `enabled` と `termsReviewed` は別のもの

ここを混ぜると、確かめていないものを確かめたことにしてしまう。

| フィールド | 意味 |
|---|---|
| `enabled` | **いまサイトが実際に参照しているか。** `false` にすると候補から外れ、その取得元の画像は表示されなくなる |
| `termsReviewed` | **人が利用条件を読んで、根拠を書いたか。** いまはすべて `false` |
| `usageBasis` | 読んだ結果の根拠。`termsReviewed` が `true` なら必ず埋まっている（`build/check-covers.mjs` が検査する） |
| `termsUrl` / `lastReviewedAt` | 読んだ規約の場所と日付 |

`termsReviewed: true` にできるのは、**人が規約を読んで根拠を書いた場合だけ**。
`build/check-covers.mjs` は `termsReviewed: true` なのに `usageBasis` が空なら落ちる。
**規約確認を自動化したと偽らない。**

### 実装指示書との違い（記録しておく）

実装指示書 §44 は「利用条件を確認できない provider は `enabled: false`」としている。
そのとおりにすると、**いま表示している 1,390 冊ぶんの書影がすべて消える。**

- これは公開中のサイトの見た目を大きく変える操作で、**運営者の判断が要る**
  （実装指示書 §60 の「運営者確認が必須の項目」に相当する性質のもの）。
- こちらで勝手に消すと、指示書 §2 の「既存の表示を予告なく壊さない」に反する。
- 逆に `enabled: true` のまま「確認済み」と書けば、確かめていないことを確かめたと偽ることになる。

そこで **`enabled`（いま参照しているか）と `termsReviewed`（確認したか）を分けた。**
いまは全部 `enabled: true` / `termsReviewed: false` で、
「参照しているが、条件は確認していない」という**事実そのまま**の状態になっている。
`enabled: false` にすれば実際に候補から外れることは確認済み（下の 5 節）。
**止めるかどうかは運営者が決める。**

## 3. 生成する候補（試す順）

`assets/js/cover-resolver.js` が唯一の正本。生成側（`build/lib/cover.mjs`）も
画面側（各科目トップ・書籍ページ）も、同じファイルを読む。

| 順 | ID | 取得元 | 鍵 | 確認 |
|---|---|---|---|---|
| 1 | `explicit` | `BOOKS[].cover` に個別指定した URL | — | 未確認 |
| 2 | `amazon` | Amazon の商品画像（`images-fe` / `images-na` / `m.media-amazon`、`.09.` と `.01.` の 5 候補） | ISBN10 / ASIN | 未確認 |
| 3 | `gakusan` | 学参ドットコム | ISBN13 | 未確認 |
| 4 | `ndl` | 国立国会図書館サーチ | ISBN13 | 未確認 |
| 5 | `googlebooks` | Google Books | ISBN13 | 未確認 |
| 6 | `openbd` | openBD | ISBN13 | 未確認 |
| 7 | `gakusanSmall` | 学参ドットコム（小サイズ） | ISBN13 | 未確認 |

### なぜこの順にしたか

**統一する前、7 科目それぞれが自前の候補生成を持ち、中身が 4 通りに分かれていた。**

| 科目 | 統一前の候補 |
|---|---|
| 社会 | 10 候補（Amazon 5 / 学参 2 / NDL / Google Books / openBD） |
| 国語 | 6 候補（Amazon 2 / NDL / Google Books / openBD） |
| 英語・理科 | 5 候補（Amazon 2 / NDL / openBD） |
| 数学・情報・小論文 | 3 候補（Amazon 2 のみ） |
| 生成側（`build/lib/cover.mjs`） | 5 候補（Amazon 2 / NDL / openBD） |

同じ本なのに、書籍ページでは表紙が出て科目トップでは出ない、という差が実際にあった。
統一にあたっては**いちばん候補の多い社会の順をそのまま採った**。
こうすると**どの科目でも候補が減らない**（減ると、いま出ている表紙が出なくなる）。
候補が 3 つしか無かった数学・情報・小論文は増えるので、表紙が出る本は増えることはあっても減らない。

### 個別に指定した URL（`BOOKS[].cover`）

上の取得元で取れない本に、出版社の商品画像などを 1 冊ずつ指定している。
**取得元がばらばらなので provider としてまとめて扱えない。**
2026-09 時点で 16 ホスト。

```
baseec-img-mng.akamaized.net   daiichi-shoron.net           image.maruzenjunkudo.co.jp
image.rakuten.co.jp            shop.r10s.jp                 ten.tokyo-shoseki.co.jp
toho.tokyo-horei.co.jp         www.biseisha.co.jp           www.chart.co.jp
www.hamajima.co.jp             www.jikkyo.co.jp             www.kirihara.co.jp
www.ninomiyashoten.co.jp       www.shimizushoin.co.jp       www.shinko-keirin.co.jp
www.teikokushoin.co.jp
```

この一覧は `node build/check-covers.mjs` が毎回出す。**新しいホストが増えたら気づける。**

## 4. 画像の出し方（壊さないための約束）

すべての書影に次を付ける。`test/performance-budget.test.mjs` と
`build/check-site.mjs` が守っている。

- `referrerpolicy="no-referrer"` — どのページから見に来たかを相手に渡さない
- `loading="lazy"`（書籍ページの主画像だけ `eager`）
- `decoding="async"`
- `width` / `height`、または枠側の `aspect-ratio` — **読み込む前から場所が決まる**ので版面が跳ねない
- 意味のある `alt`（カードの中で書名がすぐ隣に読まれる場所では空 `alt`）
- どの候補も取れなかったときの代替表示（書名と出版社）。**大きさは同じ**なので、
  表紙が出ても出なくてもカードの寸法は変わらない

Amazon が「画像を持たない ISBN に 1x1 の画像を HTTP 200 で返す」ことへの対応も維持している
（`naturalWidth <= 1` で次の候補へ送る）。書名だけを刷った自動生成画像を返す場合は
それにも掛からないので、その本は `BOOKS[].nocover` を立てて候補を空にする。

## 5. 検査

```bash
npm run check:covers          # 取得元の整合。外部へ 1 回も出ない。**必須ゲート**
npm run check:covers:live     # 実際に HTTP で取りに行く。週次か手動
```

### 整合の検査（必須ゲート）

- 公開 HTML に出ている書影の URL が、すべて既知の取得元に対応づいているか
- **`enabled: false` の取得元の URL が公開 HTML に出ていないか**
- 台帳が実データと食い違っていないか
- 台帳に認証情報らしい語が入っていないか
- `termsReviewed: true` なのに `usageBasis` が空でないか

`enabled: false` が本当に効くことは確認済み。`googlebooks` を `false` にすると
候補が 10 → 9 に減り、`books.google.com` の URL が生成されなくなる。
その状態で古い `dist/` を検査すると終了コード 1 で落ちる。

### 到達の検査（必須ゲートにしない）

相手のサイトの調子で結果が変わる。外部障害で CI が赤くなり続けると、
本当の欠損に気づけなくなる（`build/check-links.mjs` と同じ考え方）。
timeout 12 秒・同時 4 本・再試行 1 回・識別できる User-Agent を付けている。

結果は `build/data/cover-ledger.json` の `availability` に残る。

| status | 意味 | すること |
|---|---|---|
| `ok` | 取れた | 何もしない |
| `not_found` | 404 / 410 / 1x1 相当 | **データを直す対象。** `BOOKS[].cover` に出版社の商品画像を入れるか、どこにも無いと確認できたら `BOOKS[].nocover` |
| `transient_error` | タイムアウト・5xx・429 | 次回の再確認に回す |
| `unchecked` | まだ確かめていない | — |

## 6. OWNER ACTION — 運営者にしかできないこと

**これは法務・運営の判断で、こちらでは決めない。**

1. 上の 6 種類の取得元について、**利用条件を人が読む**。読んだら
   `build/data/cover-provider-policies.json` の該当 provider に
   `termsUrl` / `usageBasis` / `lastReviewedAt` を書き、`termsReviewed` を `true` にする。
   完了判定: `node build/check-covers.mjs` の「利用条件が未確認の取得元」が 0 件になる。

2. 読んだ結果、条件を満たせない取得元があれば `enabled` を `false` にして
   `npm run build` を流す。その取得元の画像は候補から外れ、代替表示（書名と出版社）に落ちる。
   完了判定: `node build/check-covers.mjs` が終了コード 0 で終わり、
   公開 HTML にそのホストの URL が出ていないこと。

3. 個別指定の 16 ホスト（3 節）についても、同じ判断が要る。
   ホストごとに `BOOKS[].cover` を外すか残すかを決める。

4. 「規約を読んでいないので全部止める」という判断もありうる。その場合は
   すべての provider を `enabled: false` にする。**書影は 1 枚も出なくなるが、
   代替表示があるのでレイアウトは崩れない。**
