# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-05T02:20:57.331Z
- commit: `19616e49d27029bef6740bf43a2837c5fe917227`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4173
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 9（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 51 | 100 | 77 | 100 | 10.38 | 0.213 | 61 | 5.22 |
| 2 | 53 | 100 | 77 | 100 | 11.25 | 0.213 | 40 | 4.51 |
| 3 | 53 | 100 | 77 | 100 | 11.73 | 0.213 | 39 | 4.52 |
| 4 | 52 | 100 | 77 | 100 | 11.07 | 0.213 | 22 | 4.83 |
| 5 | 58 | 100 | 77 | 100 | 10.1 | 0.213 | 0 | 3.16 |
| 6 | 58 | 100 | 77 | 100 | 10.09 | 0.213 | 0 | 3.17 |
| 7 | 52 | 100 | 77 | 100 | 10.86 | 0.213 | 28 | 4.85 |
| 8 | 53 | 100 | 77 | 100 | 11 | 0.213 | 37 | 4.57 |
| 9 | 55 | 100 | 77 | 100 | 10.92 | 0.213 | 11 | 4.11 |
| **中央値** | **53** | **100** | **77** | **100** | **10.92** | **0.213** | **28** | **4.52** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.8ms / Element render delay 310.3ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 1140ms
  - `unused-css-rules` Reduce unused CSS — 約 950ms
  - `unminified-javascript` Minify JavaScript — 約 330ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

