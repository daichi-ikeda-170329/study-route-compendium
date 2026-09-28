# 性能の実測（履歴: 覆った切り分けと、参考にしない計測）

> **2026-09-29 に `docs/performance-report.md` から移した節。** 節番号・本文は移した時点のまま。
> 4 節（4.1・4.2）の「CLS・LCP の原因は Google Fonts」という結論は、2026-09-08 の測り直しで覆った
> （正しい切り分けは `docs/performance-report.md` 9 節）。6.1 は試して効かなかった案、6.5 は外れ値が
> 張り付いた本番計測、7 節は 1 run だけの単発値。**いまの数値と判断には使わない。**

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

> **2026-09-08 追記。この節の結論は、いまのコードには当てはまらない。**
> 引き金は Google Fonts ではなく、`assets/js/search.js` が実行時に差し込んでいた
> ヘッダー検索ボックスの CSS だった。切り分けと修正後の数値は 9 節。

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

### 6.1 `display=optional` にするか → **判断は不要になった（試して、効かなかった）**

2026-09-05 に実測した。**`display=optional` は CLS をほとんど動かさない**
（0.216 → 0.213。9 run すべてで同じ）。Performance も LCP も変わらなかった。
4.2 のとおり CLS の 98% は書体の差し替えとは別の原因なので、
**「初回訪問者に指定の書体を見せない」代償を払う理由が無い。**

したがって `display=swap` のまま残した。証跡は
`docs/perf/lighthouse-mobile-with3p-font-optional.json`（9 run）。

代わりに 5.2 の非同期化を入れた。こちらは LCP を 4 秒縮める。

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

