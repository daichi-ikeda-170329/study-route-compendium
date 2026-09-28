# 性能の実測と、残っている要因

最終更新: 2026-09-08（計測）/ 2026-09-29（構成の整理）
測定者: 改修作業（`docs/archive/remediation-progress-history-2026-09-29.md` の S5）
**ここに書いた数値はすべてコマンド出力の写しで、推測値は 1 つも無い。**

## いまの状態（2026-09-08 の計測が最新）

| 指標 | 最新（localhost・`/science/`・5 run 中央値。9 節） | 目標 | 判定 |
|---|---:|---:|---|
| Performance | 76 | 80 以上 | **未達** |
| LCP | 6.93s（Lantern の推定値） | 4.0s 以下 | **未達** |
| CLS | 0.004 | 0.10 以下 | **達成** |

- CLS の原因は `assets/js/search.js` が実行時に差し込んでいた検索ボックスの CSS で、描画をブロックする CSS として配り直して解消した（9 節）。Google Fonts ではなかった
- LCP が未達なのは科目トップと参考書一覧だけで、Google Fonts でも広告でもない。相関しているのはページの重さ（9 節「LCP について分かったこと」）。**実利用者の値は Search Console の Core Web Vitals（CrUX）で見る**（`docs/remediation-progress.md` の OWNER ACTION 7）
- 本番の最新は 2026-09-05 の 5 run（6.6 節。CLS の修正より前）。2026-09-19 に本番を PerformanceObserver で測った CLS は 3 ページとも 0.10 未満（`docs/growth-plan-2026-09-18.md` 6.9。Lighthouse とは測り方が違う）
- 判断待ちは 2 つ: 書体の自前配信（6.2 節）、参考書一覧の `data-srcs` を外すか（9 節の末尾）

4 節（覆った原因の切り分け）・6.1・6.5（外れ値の本番計測）・7 節（単発計測）は
`docs/archive/performance-report-history-2026-09-29.md` へ移した。下の節番号は移す前のまま。

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
CLS はこの時点では動いていない（2026-09-08 に 9 節の修正で 0.004 になった）。経緯は 5.2 節と 9 節。

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

当初は「CLS が悪化するのでやらない」としていたが、その根拠の原因特定が誤っていた
（archive の 4.1）。9 run で実測すると **CLS は悪化せず、LCP が 4 秒縮んだ**ので実施した。

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

第三者を遮断しても CLS は 0.215 のまま（遮断前 0.215）。**CLS の原因は広告ではない。**
当時は書体の差し替えが原因と書いていたが誤りで、実際は `search.js` が差し込んでいた CSS だった（9 節）。

### この項目の完了条件について

実装指示書 §51 は「77 を必ず 90 へ上げる」ことを完了条件にしていない。
**「自サイト由来の修正可能な失敗が 0、第三者残差が再現可能な形で分離・記録されている」**
が条件で、それは満たしている。

第三者サービス（AdSense / GA4）を続けるかどうかは運営判断である。
**cookie 警告を消すためだけにサービスを削除しない。**
Consent Mode v2 の既定値は 2026-09-11 に導入済み。認定 CMP を入れるかどうかは、対象地域と
運営者の同意方針を確かめたうえでの判断で、こちらでは決めない（`docs/remediation-progress.md` の OWNER ACTION 8）。
**見せかけの同意バナーは作らない。法的適合を断定しない。**

## 6. 運営者に判断してもらいたいこと（OWNER ACTION）

CLS は 9 節の修正で達成した。LCP の残因は Google Fonts ではない（9 節）。書体について残る判断は
6.2 の自前配信だけで、「見た目をどこまで守るか」の判断なので、こちらでは決めない。

### 6.2 書体を自前で配信するか — **いまも判断待ち**

`fonts.googleapis.com` を止めて測ると、上限がどこにあるかが見える
（localhost / mobile / 5 run。`--blocked-url-patterns` で CSS ごと遮断）。

| 指標 | 非同期化の後（2026-09-05） | Google Fonts を完全に止めた場合 |
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

### 6.6 本番の再計測（2026-09-05・書体の非同期化を入れたあと）

`942f893c` を main へ入れ、Pages に反映されたのを確認してから同じ手順で 5 回測った。
**今回は前回（archive の 6.5）のような桁違いの外れは出ず、localhost の値と整合した。**

| run | Performance | LCP | CLS | Speed Index |
|---:|---:|---:|---:|---:|
| 1 | 65 | 7.12s | 0.216 | 1.84s |
| 2 | 76 | 4.12s | 0.215 | 1.70s |
| 3 | 67 | 6.30s | 0.216 | 1.95s |
| 4 | 69 | 5.50s | 0.216 | 1.79s |
| 5 | 81 | 3.51s | 0.215 | 1.71s |
| **中央値** | **69** | **5.50s** | **0.216** | **1.79s** |

測定条件: `https://route-taizen.com/science/` / Lighthouse 13.4.1 / Chrome 152.0.7977.76 /
mobile・`simulate` / 第三者は通常どおり / 5 run / 実行 2026-09-05。

**この数字の限界をそのまま書く。**

- **機械 1 台・回線 1 本から 5 回測った値**であって、実際の訪問者の値ではない。
- **ばらつきが大きい**（Performance 65〜81、LCP 3.51〜7.12s）。中央値を 1 つの数として
  扱うより、「おおむね 65〜81 の帯」と読むほうが正しい。
- 前回の計測（archive の 6.5。LCP が 19〜20 秒に張り付いた）と**同じ機械**である。
  今回は安定したが、**この環境が常に信頼できると示せたわけではない。**
- 目標（Performance 80 / LCP 4.0s / CLS 0.10）は、**中央値では 3 つとも未達**。
  5 run 中 1 run だけ Performance 81 / LCP 3.51s が出ているが、これを実力として書かない。

CLS 0.216 は localhost と同じで、本番でも動いていない。

**実利用者の値は依然として Search Console の Core Web Vitals（CrUX）で見るのが正しい。**
PageSpeed Insights も 2026-09-05 に試したが、匿名 API の日次上限
（`pagespeedonline.googleapis.com`）に達していて実行できなかった。枠が戻れば使える。

## 8. この文書を更新するとき

- 数値は必ず `npm run audit:performance` の出力から写す。手で書き換えない。
- 測り方（対象 URL・実行回数・throttling・第三者の扱い）を変えたら、変えたことを明記する。
- **未達を達成と書かない。** 目標に届いていないなら、届いていないと書く。

---

## 9. CLS の原因の取り違え（2026-09-08）

### 何が起きていたか

4.2 節（archive へ移した）は「CLS の引き金は Google Fonts のスタイルシートが描画をブロックしていること」と
結論づけていた。**現行のコードで測り直したところ、そうではなかった。**

引き金は `assets/js/search.js` だった。ヘッダー検索ボックスの CSS を、このスクリプトが
実行時に `<style>` を作って `<head>` へ差し込んでいた（手書き HTML 9 枚が
`assets/site.css` を読まないため、全ページ共通の置き場が JS しか無かった）。

CSS が届く前のヘッダーは、検索欄がロゴの横に並ぶ 1 行になっている。
`.rt-search{flex:1 1 100%;order:9}` が効いた瞬間に検索欄が 2 行目へ回り、
ヘッダーが約 35px 高くなって、`main.app-main` から下が丸ごとずれる。
これが 4.1 節（archive）の表で「原因が挙がっていない」まま 98% を占めていた
`body > main.app-main` の 0.2126 の正体である。

### 切り分け（Playwright / Chromium・412×823・`layout-shift` を PerformanceObserver で合算）

回線と CPU を絞って測った（latency 150ms / 1.6Mbps / CPU 4x）。

| 条件 | CLS | いちばん大きいずれの発生源 |
|---|---:|---|
| 通常 | 0.2225 | `#rtSearch` 114→164px・`.logo` 41→36px・`main.app-main` が 34px 下へ |
| `fonts.googleapis.com` を遮断 | 0.2169 | 同じ |
| `/assets/js/**` を遮断 | 0.0569 | ヘッダーのずれが消える |
| `/assets/generated/**` だけ遮断 | 0.2204 | 同じ |

**書体を止めても減らず、自前 JS を止めると消える。** 4.2 節の測り方と結論が食い違うのは、
4.2 が書体のスタイルシートを描画ブロックのまま測った時点の記録で、その後 5.2 節で
非同期化したあとに測り直していなかったためである。

### 直し方

CSS の正本は `search.js` の `STYLE` のまま残し、**配り方だけ変えた。**
`build/apply-search-style.mjs` が `STYLE` を読んで

- `assets/site.css` の末尾（生成ページ 1,476 枚はこれを `<link>` で読む）
- 手書き HTML 9 枚のインライン `<style>` の末尾

へ、`rt-search:start`〜`rt-search:end` のマーカーで挟んだ同じ中身を書き込む。
どちらも描画をブロックするので、最初の描画から正しい版面になる。
`search.js` 側の差し込みは、書き込みが無いページのための保険として残した
（配布物に入れた `:root{--rt-search-css:1}` が読めれば差し込まない）。

ずれは `npm run check:search-style`（`build/all.mjs --check` にも入っている）で落ちる。
配布物と `STYLE` の一致は `test/search-style.test.mjs` が固定する。

### 修正後（`npm run audit:performance -- --runs=5 --path=/science/`・1 節と同じ測り方）

証跡: `docs/perf/lighthouse-mobile-with3p-after-search-css.json`（5 run）。

| 指標 | 非同期化の後（2.1 節） | **この修正の後** | 目標 |
|---|---:|---:|---:|
| Performance | 66 | **76** | 80 以上 → **未達** |
| LCP | 6.91s | 6.93s（横ばい） | 4.0s 以下 → **未達** |
| CLS | 0.216 | **0.004** | 0.10 以下 → **達成** |
| Speed Index | 2.41s | 2.35s | — |
| Accessibility | 100 | 100 | — |
| SEO | 100 | 100 | — |

5 run すべてで Performance 76 / CLS 0.003〜0.004 と、ばらつきがほとんど無い。

**LCP と Performance は依然として未達。** 達成したのは CLS だけである。

### LCP について分かったこと（未解決）

この修正では LCP は動かなかった。追加で測って分かったのは次のとおり。

| 対象ページ | Performance | LCP | LCP になった要素 |
|---|---:|---:|---|
| `/`（ポータル） | 100 | 1.39s | `p.lead` |
| `/about/` | 100 | 1.35s | `p` |
| `/science/routes/kyote/` | 99 | 1.80s | `p.sec-lead` |
| `/science/books/` | 57 | 5.55s | `p.sec-lead` |
| `/science/` | 76 | 6.93s | `p.lead` |

（`--runs=1`。証跡はローカルの一時ファイルで、`docs/perf/` へは残していない）

- **未達なのは科目トップと参考書一覧の 2 種類だけ**で、ほかのページ種別はすでに 99〜100。
- どちらも LCP 要素はテキストで、Lighthouse の内訳は
  `Time to first byte 6.4ms / Element render delay 65.7ms`（合計 72ms）にしかならない。
  同じ run の `observedLargestContentfulPaint` は **79ms**。
  6.93s は Lantern（`--throttling-method=simulate`）の推定値である。
- **Google Fonts でもなく、広告でもない。** 6.2 節が示すとおり書体を完全に止めても
  LCP は 6.91→6.93s で動かず、今回 `--block-third-party` で広告・解析を遮断して
  測っても 7.21s（3 run すべて同じ）と、むしろ悪化した。
- 相関しているのはページの重さである。`/science/books/` は HTML が 875KB、
  `/science/` は HTML 160KB に加えて表示直後に科目アセット 686KB を取りに行く。

**したがって「LCP の残因は Google Fonts」という 4 節（archive）の見出しは、いまのコードでは成り立たない。**
次に確かめるべきは、この 6.9s が実利用者にも起きているかどうかで、それは
Search Console の Core Web Vitals（CrUX）で見る（`docs/remediation-progress.md` の OWNER ACTION 7）。
**Lantern の推定値だけを根拠に、重さを削る大工事へ進まない。**

### 手を付けなかった案（数値だけ置く）

`/科目/books/` の HTML の 35%（`/science/books/` で 307KB）は、書影 1 枚ごとに埋め込んだ
候補 URL 9 本（`data-srcs`）と、全画像で同一の `onload` / `onerror` 属性が占めている。
`assets/js/cover-resolver.js` が同じ候補を組み立てられるので、ISBN だけを持たせて
実行時に組み直せば減らせる。

| 施策 | raw | gzip |
|---|---:|---:|
| 現状（`/science/books/`） | 875,236B | 79,981B |
| `data-srcs` を外す | 636,546B | 60,082B（−19.9KB） |
| `onload`/`onerror` を外す | 806,205B | 77,941B（−2.0KB） |

**実施していない。** 書影の候補列は `build/check-covers.mjs` が HTML の `data-srcs` から
読み取って取得元を監査しており、失敗しても画面に出ないまま書影だけが消える。
効果（gzip で約 20KB・一覧ページ 7 枚）に対して壊れ方が静かなので、運営者の判断を待つ。
