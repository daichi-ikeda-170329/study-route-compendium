# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T21:55:35.741Z
- commit: `9f0846fc8ace2103609ae61d2473511fd3901de0`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: external
- base URL: https://route-taizen.com
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 44 | 100 | 77 | 100 | 20.16 | 0.229 | 0 | 17.04 |
| 2 | 55 | 100 | 77 | 100 | 19.79 | 0.001 | 0 | 16.16 |
| 3 | 44 | 100 | 77 | 100 | 20.38 | 0.229 | 0 | 17.21 |
| 4 | 55 | 100 | 77 | 100 | 19.23 | 0.001 | 0 | 16.13 |
| 5 | 76 | 100 | 77 | 100 | 5.12 | 0.003 | 20 | 2.92 |
| **中央値** | **55** | **100** | **77** | **100** | **19.79** | **0.003** | **0** | **16.16** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 46.7ms / Element render delay 365.4ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1140ms
  - `unused-javascript` Reduce unused JavaScript — 約 490ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

