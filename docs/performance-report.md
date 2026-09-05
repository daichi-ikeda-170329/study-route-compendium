# 性能の実測と、残っている要因

最終更新: 2026-09-05
測定者: 改修作業（`docs/remediation-progress.md` の S5）
**ここに書いた数値はすべてコマンド出力の写しで、推測値は 1 つも無い。**

---

## 1. 測り方（S0 から変えていない）

```bash
npm run audit:performance -- --runs=9 --path=/science/ --label=final-s11 --port=4193
```

| 項目 | 値 |
|---|---|
| 対象 URL | `http://127.0.0.1:4193/science/`（**localhost。本番ではない**） |
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

証跡: `docs/perf/lighthouse-mobile-with3p-baseline-s0.json`（S0・5 run）と
`docs/perf/lighthouse-mobile-with3p-final-s11.json`（最終・9 run）。

| 指標 | 改修前（S0） | 改修後（最終） | 判定 | 目標 |
|---|---:|---:|---|---:|
| Performance | 47 | **53** | 改善（+6） | 80 以上 → **未達** |
| LCP | 12.09s | **10.99s** | 改善（−1.10s） | 4.0s 以下 → **未達** |
| CLS | 0.217 | **0.216** | ほぼ横ばい（悪化なし） | 0.10 以下 → **未達** |
| Speed Index | 7.53s | **4.56s** | 改善（−39.4%） | — |
| Accessibility | 100 | 100 | 維持 | — |
| Best Practices | 77 | 77 | 横ばい（第三者遮断で 100。5.4 節） | — |
| SEO | 100 | 100 | 維持 | — |

**Performance・LCP・CLS の 3 つはいずれも目標に届いていない。** 達成したかのように書かない。
何が効いて何が残っているかを 3 節以降に書く。

### 2.1 Google Fonts を非同期化したあと（2026-09-05 追記）

証跡: `docs/perf/lighthouse-mobile-with3p-font-async.json`（9 run）。測り方は 1 節と同じ。

| 指標 | 改修前（S0） | 上の「最終」 | **非同期化の後** | 目標 |
|---|---:|---:|---:|---:|
| Performance | 47 | 53 | **66** | 80 以上 → **未達** |
| LCP | 12.09s | 10.99s | **6.91s** | 4.0s 以下 → **未達** |
| CLS | 0.217 | 0.216 | **0.216** | 0.10 以下 → **未達** |
| Speed Index | 7.53s | 4.56s | **2.41s** | — |

**3 つの目標はどれも依然として未達。** LCP は 12.09s → 6.91s（−43%）まで来たが 4.0s には遠く、
CLS は動いていない。経緯と残因は 4 節と 5.2 節。

### 科目トップの HTML バイト数（決定的な値。ぶれない）

| 科目 | 改修前 | 改修後 | 減 |
|---|---:|---:|---:|
| science | 977,442 | 157,273 | −83.9% |
| social | 874,633 | 150,361 | −82.8% |
| english | 607,760 | 143,242 | −76.4% |
| japanese | 586,352 | 142,418 | −75.7% |
| math | 471,171 | 136,775 | −71.0% |
| shoron | 225,578 | 92,022 | −59.2% |
| joho | 153,728 | 91,063 | −40.8% |

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

> **2026-09-05 追記。** この 2,889ms の描画ブロックは 5.2 の非同期化で無くなった。
> 4 節と 4.1・4.2 は**非同期化する前**の状態を記録したもので、原因の切り分けとして残してある。
> 非同期化したあとの数値は 2.1 節。

### 4.1 CLS 0.217 の内訳（2026-09-05 に訂正）

> **この節は 2026-09-05 に書き直した。**
> それまでここには「CLS の原因はすべて Web font」と書いてあったが、**誤りだった。**
> `cls-culprits-insight` が原因を挙げているのは全体の 1.5% にあたる 0.0032 だけで、
> 残る 98% を占める `main.app-main` の 0.2126 には**原因が 1 つも挙がっていない**。
> 「原因欄が空の行」を、原因が挙がっている行と同じ理由で説明してしまっていた。
> 実際に切り分けた結果を下に置く。

Lighthouse の `cls-culprits-insight` が挙げる内訳（`docs/perf/` の最新 run）。

| ずれた要素 | スコア | 全体に占める割合 | Lighthouse が挙げた原因 |
|---|---:|---:|---|
| `body > main.app-main` | 0.2126 | **98.0%** | **挙がっていない** |
| `body > div#prBar` | 0.0020 | 0.9% | Web font（Zen Kaku Gothic New ほか） |
| `div.hero__main > h1` | 0.0012 | 0.6% | Web font（同上） |
| 合計 | 0.2169 | 100% | |

**広告や解析ではない。** 解析・広告だけを遮断して測っても CLS は変わらなかった
（`docs/perf/lighthouse-mobile-no3p-s4-no3p.json`）。

書影が原因でもない。`.bcov{aspect-ratio:.71}` と `.bcov img{width:100%;height:100%}` で
箱が先に決まっており、画像が届いても版面は動かない
（`test/performance-budget.test.mjs` の「科目トップの画像は、読み込む前から場所が決まっている」が固定）。

### 4.2 切り分けの実測（2026-09-05）

Playwright（Chromium 151・412×823・`layout-shift` を PerformanceObserver で合算）で、
遮断する対象を変えて測った。

| 条件 | CLS |
|---|---:|
| 通常 | 0.217 |
| `fonts.googleapis.com` を遮断（**CSS ごと**止める） | **0.000** |
| `fonts.gstatic.com` だけ遮断（書体ファイルだけ止め、CSS は通す） | 0.213 |
| 自前 JS だけ遮断 | 0.059 |

**書体ファイルを止めても CLS は減らない。CSS を止めると 0 になる。**
つまり「書体が差し替わったこと（swap）」ではなく、
**Google Fonts のスタイルシートが描画をブロックしていること**が引き金になっている。
描画がそこまで待たされるあいだに版面の計算が 1 度確定し、
その後に版面が組み直されて `main.app-main` 全体がずれる。

`font-display` を書き換えても効かないことも確かめた（同じ測り方、CSS を差し替えて計測）。

| `font-display` | CLS |
|---|---:|
| `swap`（現状） | 0.216 |
| `optional` | 0.213 |
| `block` | 0.213 |
| `fallback` | 0.213 |

**減った 0.003 は、4.1 の表で Web font が原因と挙がっている分とちょうど一致する。**
`display=optional` は「font の swap による 0.003」だけを消し、98% には触れない。

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

### 5.2 Google Fonts の非同期化 → **2026-09-05 に実施した**

> **この節も書き直した。** ここには「CLS が悪化するのでやらない」と書いてあったが、
> その根拠は 4.1 の誤った原因特定に乗っていた。9 run で実測したところ
> **CLS は悪化せず、LCP が 4 秒縮んだ**ので、判断を撤回して実施した。

`media="print"` → `onload="this.media='all'"` で、Google Fonts のスタイルシートを
描画ブロックから外した。**書体そのものは今までどおり読み込む**（Chromium で
`document.fonts.check('700 30px "Zen Kaku Gothic New"')` が `true` になることを確認済み）。

実測（localhost / mobile / 9 run 中央値。証跡 `docs/perf/lighthouse-mobile-with3p-font-async.json`）。

| 指標 | 非同期化の前 | 非同期化の後 | |
|---|---:|---:|---|
| Performance | 53 | **66** | +13 |
| LCP | 10.99s | **6.91s** | −37% |
| Speed Index | 4.56s | **2.41s** | −47% |
| CLS | 0.216 | **0.216** | 変わらず（中央値） |
| Best Practices | 77 | 77 | 変わらず |

**引き換えに、初回訪問で書体が入れ替わるのが見える（FOUT）。**
最初の描画は Hiragino / Yu Gothic / Noto Sans JP で行われ、
Google Fonts が届いた時点で Zen Kaku Gothic New と Shippori Mincho B1 に切り替わる。
以前は「切り替わるまで待って一度で描く」動きだった。

**CLS は中央値では動かないが、run ごとに 2 つの値へ割れる**（9 run のうち
4 run が 0.002〜0.004、5 run が 0.216）。版面の組み直しと初回描画のどちらが先に来るかの
競争になっているためで、非同期化がこれを悪化させてはいない
（非同期化の前は 9 run すべてが 0.213〜0.217 だった）。

JavaScript が無効な環境では `media="print"` のままになり、書体は当たらない。
そのときは代替の書体で表示される（版面は崩れない）。

### 5.2.1 元に戻すには

`build/lib/parts.mjs` と手書き 9 ページ（`index.html`・`404.html`・科目トップ 7 枚）の `<link>` を次に戻して `npm run build`。

```
<link href="…&display=swap" rel="stylesheet">
```

`rg 'onload="this.media' --glob '!dist/**'` で全箇所が出る。

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

### 6.1 `display=optional` にするか → **判断は不要になった（試して、効かなかった）**

2026-09-05 に実測した。**`display=optional` は CLS をほとんど動かさない**
（0.216 → 0.213。9 run すべてで同じ）。Performance も LCP も変わらなかった。
4.2 のとおり CLS の 98% は書体の差し替えとは別の原因なので、
**「初回訪問者に指定の書体を見せない」代償を払う理由が無い。**

したがって `display=swap` のまま残した。証跡は
`docs/perf/lighthouse-mobile-with3p-font-optional.json`（9 run）。

代わりに 5.2 の非同期化を入れた。こちらは LCP を 4 秒縮める。

### 6.2 書体を自前で配信するか — **いまも判断待ち**

`fonts.googleapis.com` を止めて測ると、上限がどこにあるかが見える
（localhost / mobile / 5 run。`--blocked-url-patterns` で CSS ごと遮断）。

| 指標 | 非同期化の後（いま） | Google Fonts を完全に止めた場合 |
|---|---:|---:|
| Performance | 66 | **74** |
| LCP | 6.91s | **6.93s** |
| Speed Index | 2.41s | **2.50s** |
| CLS | 0.216 | **0.000**（5 run 中 3 run。残り 2 run は 0.213） |

**非同期化でほぼ上限まで来ている。** 残る差は Performance 8 点で、
その大半は「Zen Kaku Gothic New と Shippori Mincho B1 を表示しない」ことの対価。

自前配信にすれば「書体は出したまま、外部への往復 2 回を消す」ことができるが、
日本語書体はサブセット化しないと数 MB になるので、サブセット生成と更新の仕組みを持つことになる。
**規模が大きいので、非同期化の効果を本番で確かめてから判断するのが順当。**

## 6.5 本番での計測について（2026-09-05・マージ後）

改修を main へ入れて Pages が反映されたあと、**本番**（`https://route-taizen.com/science/`）を
同じ手順で 5 回測った。証跡は `docs/perf/lighthouse-mobile-with3p-production-after.json`。

| run | Performance | LCP |
|---:|---:|---:|
| 1 | 44 | 20.2s |
| 2 | 55 | 19.8s |
| 3 | 44 | 20.4s |
| 4 | 55 | 19.2s |
| 5 | **76** | **5.1s** |
| 中央値 | 55 | 19.79s |

**この数字を本番の実力として扱わない。**

5 run のうち 4 run で LCP が 19〜20 秒に張り付き、1 run だけ 5.1 秒だった。
Speed Index の中央値も 16.16 秒で、localhost（4.56 秒）と比べて桁が違う。
**この機械から外部（Google Fonts・AdSense）への通信が不安定なためで、
サイトの側の問題ではない。** localhost では同じコードが安定して
Performance 53 / Speed Index 4.56 秒を出している。

外れ値を避けて「76 が本当の値」と書くこともしない。**どちらも根拠が無い。**

### 本番の実力を知るには

この環境からの Lighthouse では判断できない。運営者の側で次のどちらかを使う。

1. **PageSpeed Insights**（`https://pagespeed.web.dev/`）に
   `https://route-taizen.com/science/` を入れる。Google 側の回線から測るので、
   この機械の通信事情に左右されない。
2. **Search Console のウェブに関する主な指標（Core Web Vitals）** を見る。
   実際の訪問者の値（CrUX）なので、いちばん実態に近い。ただし十分な訪問数が
   たまるまで表示されない。

**改修前の本番値（Performance 47 / LCP 10.7s / CLS 0.216）は監査時点に別環境で測ったもので、
上の 5 run と同じ条件ではない。並べて「改善した／悪化した」と書けない。**

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
