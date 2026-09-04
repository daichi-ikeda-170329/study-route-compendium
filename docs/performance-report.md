# 性能の実測と、残っている要因

最終更新: 2026-09-05
測定者: 改修作業（`docs/remediation-progress.md` の S5）
**ここに書いた数値はすべてコマンド出力の写しで、推測値は 1 つも無い。**

---

## 1. 測り方（S0 から変えていない）

```bash
npm run audit:performance -- --runs=9 --path=/science/ --label=after-s5 --port=4187
```

| 項目 | 値 |
|---|---|
| 対象 URL | `http://127.0.0.1:4187/science/`（**localhost。本番ではない**） |
| Lighthouse | 13.4.1 |
| Chrome | Google Chrome 152.0.7977.76 |
| form factor | mobile |
| throttling | `simulate`（Lighthouse mobile 既定） |
| 第三者スクリプト | 通常どおり読み込んだ |
| 実行回数 | 改修前 5 回 / 改修後 9 回、いずれも中央値 |

**localhost の値を本番の値として報告しない。** 本番との突き合わせは
`npm run check:production` と Pages 反映後の再計測で行う。
改修前の localhost 計測は本番の監査値（Performance 47 / Best Practices 77 / CLS 0.216）を
再現していた（`docs/baseline-2026-09-05.md` §7）。

## 2. 改修前と改修後

証跡: `docs/perf/lighthouse-mobile-with3p-baseline-s0.json` / `…-after-s5.json`

| 指標 | 改修前（S0） | 改修後（S5） | 判定 | 目標 |
|---|---:|---:|---|---:|
| Performance | 47 | **53** | 改善（+6） | 80 以上 → **未達** |
| LCP | 12.09s | **11.06s** | 改善（−1.03s） | 4.0s 以下 → **未達** |
| CLS | 0.217 | **0.217** | 横ばい（悪化なし） | 0.10 以下 → **未達** |
| Speed Index | 7.53s | **4.55s** | 改善（−39.6%） | — |
| Total Blocking Time | 0ms | 19ms | 微増 | — |
| Accessibility | 100 | 100 | 維持 | — |
| Best Practices | 77 | 77 | 横ばい | S10 で扱う |
| SEO | 100 | 100 | 維持 | — |

**目標 3 つはいずれも未達である。** 達成したかのように書かない。
何が効いて何が残っているかを 3 節以降に書く。

### 科目トップの HTML バイト数（決定的な値。ぶれない）

| 科目 | 改修前 | 改修後 | 減 |
|---|---:|---:|---:|
| science | 977,442 | 165,181 | −83.1% |
| social | 874,633 | 166,806 | −80.9% |
| english | 607,760 | 151,150 | −75.1% |
| japanese | 586,352 | 152,018 | −74.1% |
| math | 471,171 | 143,163 | −69.6% |
| shoron | 225,578 | 98,217 | −56.5% |
| joho | 153,728 | 97,478 | −36.6% |

**全科目が 250,000 バイトの予算に入り、理科は 200,000 バイトの予算にも入った。**
`npm run check:budgets`（`test/performance-budget.test.mjs`）が上限を固定している。

## 3. 何が効いたか

### 3.1 データと描画コードを HTML の外へ出した（S2〜S4）

科目トップは、データ（BOOKS / UNIS / ROUTES / GUIDES / TIERS / STAGES / CONFIG）も
描画コードも 1 枚の HTML に入っていた。理科ではインライン `<script>` だけで 815,186 バイトあり、
HTML の解析がそこで止まっていた。

- データ → `data/subjects/<科目>/`（正本）と `assets/generated/subjects/<科目>.*.json`（配信）
- 描画コード → `assets/js/subject-<科目>.js`（`defer`）

### 3.2 描画をブロックしていた自前のスクリプトに `defer` を付けた（S5）

**これが最も効いた。** Lighthouse の `render-blocking-insight` の実測:

| | 改修前 | `defer` 後 |
|---|---:|---:|
| Google Fonts のスタイルシート | 2,122ms | 2,889ms |
| `/assets/js/share.js` | 1,051ms | — |
| `/assets/js/pace.js` | 751ms | — |
| `/assets/js/bunri.js` | 451ms | — |
| `/assets/js/analytics.js` | 301ms | — |
| **合計** | **4,676ms（5 本）** | **2,889ms（1 本）** |

自前のスクリプト 4 本が critical path から消えた。Speed Index が 7.53s → 4.55s へ縮んだのは主にこれ。

以前 `analytics.js` に `defer` を付けていなかったのは、「科目トップの `share.js` は本文中の
同期スクリプトで、読み込み直後に共有 URL の復元を記録する。defer にするとその時点でまだ
読めておらず、記録が落ちる」ためだった（`build/lib/parts.mjs` のコメント）。
S2〜S4 で描画コードを `subject-loader.js` の起動後に走らせる形にしたので、この前提は消えた。
復元の記録は起動時に走り、`defer` な `analytics.js` より必ずあとになる。

## 4. 何が残っているか — **Google Fonts が唯一の残因**

`defer` を入れたあと、描画をブロックしているのは 1 本だけになった。

```
https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900
  &family=Shippori+Mincho+B1:wght@600;700;800
  &family=IBM+Plex+Mono:wght@400;500;600;700&display=swap
  → 転送 207,854 バイト / 描画ブロック 2,889ms
```

日本語の書体は文字数が多いため、Google Fonts は `unicode-range` で 100 以上の
サブセットに分けて配信する。そのため**スタイルシート自体が 207KB** ある。

### 4.1 CLS 0.217 も同じ原因

Lighthouse の `cls-culprits-insight` は、ずれた要素ごとに原因を挙げる。
**列挙された原因はすべて `Web font`** で、`fonts.gstatic.com` の `.woff2` が並ぶ。

| ずれた要素 | スコア | Lighthouse が挙げた原因 |
|---|---:|---|
| `body > main.app-main` | 0.2126 | （下の各要素の移動が合算されたもの） |
| `div.hero__main > h1` | 0.0017 | Web font（Zen Kaku Gothic New / Shippori Mincho B1） |
| `div.hero > div.stat-row` | 0.0008 | Web font（同上） |
| `body > div#prBar` | 0.0004 + 0.0003 | Web font（IBM Plex Mono / Zen Kaku Gothic New ほか） |

**広告や解析ではない。** 解析・広告だけを遮断して測っても CLS は変わらなかった
（`docs/perf/lighthouse-mobile-no3p-s4-no3p.json`）。

書影が原因でもない。`.bcov{aspect-ratio:.71}` と `.bcov img{width:100%;height:100%}` で
箱が先に決まっており、画像が届いても版面は動かない
（`test/performance-budget.test.mjs` の「科目トップの画像は、読み込む前から場所が決まっている」が固定）。

## 5. ここで**やらなかった**こと と、その理由

### 5.1 `<style>` の外部化（実装指示書 §28.2）

**やっていない。** 指示書は共通の `<style>`（科目あたり 51〜58KB、7 ページでほぼ同じ）を
`/assets/css/subject.css` へ出す想定だったが、実測がそれを支持しなかった。

- インライン `<style>` は**ネットワークの critical path に乗っていない**。
  `render-blocking-insight` に挙がっているのは Google Fonts だけで、`<style>` は挙がらない。
- 外へ出すと**新しい描画ブロックのリクエストが 1 本増える**。指示書 §28.2 自身が
  「全部を外部化すると描画がブロックされ、LCP がかえって悪化しうる」と書いている。
- バイト予算は外部化しなくても達成済み（全科目 250,000 未満・理科 200,000 未満）。

`unused-css-rules`（節約見込み 約 1.2〜1.65 秒）は残っているが、これは
「使っていない規則を消す」話であって「外へ出す」話ではない。7 科目でほぼ同じ CSS を
規則単位で分割すると、カスケードの順序が変わって見た目が壊れる恐れがある。
**バイト予算を満たしている以上、見た目の回帰を賭ける利得が無い。**

### 5.2 Google Fonts の非同期化

**やっていない。CLS が悪化するため。**

`media="print"` → `onload` で非同期にすると FCP と LCP は縮むが、
書体の差し替え（swap）がさらに遅い時点で起きる。4.1 のとおり CLS の原因は
まさにこの swap なので、いま 0.217 の CLS が悪化する。
指示書の受入条件「CLS が S0 より悪化していない」に反する。

### 5.3 読み込む字体の重みを減らす

**やっていない。見た目が変わる恐れを確かめきれないため。**

現在 11 面（Zen Kaku Gothic New 400/500/700/900、Shippori Mincho B1 600/700/800、
IBM Plex Mono 400/500/600/700）を読み込んでいる。CSS 全体の `font-weight` の出現は
500 が 21 回、600 が 246 回、700 が 262 回、800 が 260 回、900 が 43 回で、
**どの重みも使われている**（どの書体に効いているかまでは静的に確定できない）。
使っていない面が特定できないので削らなかった。

## 5.4 Best Practices 77 の切り分け（S10）

**自サイト由来の修正可能な失敗は 0。** 残差はすべて広告・解析の第三者 cookie。

### 測り方

```bash
npm run audit:performance -- --runs=5 --path=/science/ --label=s10-with3p --port=4191
npm run audit:performance -- --runs=5 --path=/science/ --label=s10-no3p --port=4192 --block-third-party
```

`--block-third-party` は googletagmanager / google-analytics / googlesyndication /
doubleclick / adsbygoogle / pagead を遮断する。**Google Fonts は遮断しない**
（書体はサイトの見た目そのもので、解析や広告とは性質が違う）。

### 結果（証跡: `docs/perf/lighthouse-mobile-*-s10-*.json`）

| 条件 | Best Practices | 落ちた audit | Performance | LCP | CLS |
|---|---:|---|---:|---:|---:|
| 第三者あり | **77**（5 run すべて 77） | `third-party-cookies` / `inspector-issues` | 53 | 11.14s | 0.215 |
| 第三者を遮断 | **100**（5 run すべて 100） | **なし** | 58 | 8.86s | 0.215 |

### 落ちていた audit の中身

どちらも同じ 1 件の cookie が原因だった。

| audit | 重み | 中身 |
|---|---:|---|
| `third-party-cookies` | 5 | `googleads.g.doubleclick.net` が置く `test_cookie` |
| `inspector-issues` | 1 | 同じ cookie についての Chrome DevTools の Issue |

**自サイトの console error・mixed content・壊れた画像・非推奨 API・cookie 設定不備は 0 件。**
直せる余地がこちら側に無いことは、遮断すると 5 run すべて 100 になることで示せる。

### CLS は第三者ではない

第三者を遮断しても CLS は 0.215 のまま（遮断前 0.215）。
**CLS の原因は広告ではなく書体の差し替え**である（4.1 節）。混同しない。

### この項目の完了条件について

実装指示書 §51 は「77 を必ず 90 へ上げる」ことを完了条件にしていない。
**「自サイト由来の修正可能な失敗が 0、第三者残差が再現可能な形で分離・記録されている」**
が条件で、それは満たしている。

第三者サービス（AdSense / GA4）を続けるかどうかは運営判断である。
**cookie 警告を消すためだけにサービスを削除しない。**
CMP や Consent Mode を入れるかどうかも、対象地域と運営者の同意方針を確かめたうえでの判断で、
こちらでは決めない（`README.md` の「同意管理（CMP）」に未判断のまま置いてある）。
**見せかけの同意バナーは作らない。法的適合を断定しない。**

## 6. 運営者に判断してもらいたいこと（OWNER ACTION）

**目標 3 つの未達は、いずれも Google Fonts に帰着する。** ここから先は
「見た目をどこまで守るか」の判断なので、こちらでは決めない。

### 6.1 `display=swap` を `display=optional` にするか

科目トップとポータルの `<head>` にある Google Fonts の URL の末尾、
`&display=swap` を `&display=optional` に変える（手書き HTML 9 枚と
`build/lib/parts.mjs` の `head()`。`rg 'display=swap'` で全箇所が出る）。

| | いま（`swap`） | `optional` にすると |
|---|---|---|
| 初回訪問・回線が遅いとき | 代替書体で表示 → あとで Zen Kaku Gothic New へ差し替え | 代替書体のまま（差し替えない） |
| 2 回目以降（キャッシュ済み） | Zen Kaku Gothic New | Zen Kaku Gothic New |
| CLS | 0.217（差し替えでずれる） | ほぼ 0 になる見込み |

代替書体は `"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",Meiryo,"Noto Sans JP"`
（`assets/site.css` の `--jp`）で、いずれも標準的な日本語書体。
**初回訪問者に指定の書体を見せることと、版面が動かないことのどちらを取るか**の判断になる。

完了判定: 変更後に `npm run audit:performance -- --runs=9 --path=/science/` を流し、
CLS の中央値が 0.10 以下になること。

### 6.2 書体を自前で配信するか

Google Fonts をやめて自前で配信すれば、外部への往復 2 回（`fonts.googleapis.com` と
`fonts.gstatic.com`）が消える。ただし日本語書体はサブセット化しないと数 MB になるため、
サブセット生成と更新の仕組みを持つことになる。**規模が大きいので、6.1 を試したうえで
それでも足りないときの選択肢。**

## 7. 参考: 他のページの単発計測

**1 run のみの値で、中央値ではない。** ばらつきが大きいので傾向として読む。

| ページ | 改修前（1 run） | 改修後（1 run） |
|---|---:|---:|
| `/` | Perf 74 / LCP 4.02s | Perf 71 / LCP 4.05s |
| `/english/` | Perf 50 / LCP 8.09s | Perf 57 / LCP 9.61s |
| `/japanese/` | Perf 50 / LCP 8.91s | Perf 43 / LCP 20.58s ※ |
| `/math/` | Perf 51 / LCP 7.20s | Perf 53 / LCP 9.84s |
| `/social/` | Perf 44 / LCP 21.48s ※ | Perf 52 / LCP 10.32s |
| `/joho/` | Perf 59 / LCP 5.34s | Perf 60 / LCP 6.87s |
| `/shoron/` | Perf 61 / LCP 5.63s | Perf 67 / LCP 7.25s |

※ LCP 20 秒台は、この機械から Google Fonts / AdSense への取得が詰まった run。
9 run 中央値で測った `/science/` では出ていない（改修後 9 run のうち 1 run のみ）。
**単発値どうしの比較で結論を出さない。**

## 8. この文書を更新するとき

- 数値は必ず `npm run audit:performance` の出力から写す。手で書き換えない。
- 測り方（対象 URL・実行回数・throttling・第三者の扱い）を変えたら、変えたことを明記する。
- **未達を達成と書かない。** 目標に届いていないなら、届いていないと書く。
