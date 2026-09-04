# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T21:32:03.267Z
- commit: `5ebdbeaa21d4480a7fa09935f0d8b9c3401b0237`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4193
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 9（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 58 | 100 | 77 | 100 | 9.95 | 0.216 | 11 | 3.17 |
| 2 | 44 | 100 | 77 | 100 | 22.73 | 0.229 | 0 | 16.76 |
| 3 | 53 | 100 | 77 | 100 | 10.98 | 0.215 | 36 | 4.56 |
| 4 | 52 | 100 | 77 | 100 | 10.63 | 0.216 | 27 | 4.8 |
| 5 | 53 | 100 | 77 | 100 | 11.43 | 0.22 | 42 | 4.54 |
| 6 | 58 | 100 | 77 | 100 | 10.07 | 0.215 | 0 | 3.19 |
| 7 | 57 | 100 | 77 | 100 | 10.99 | 0.216 | 0 | 3.35 |
| 8 | 44 | 100 | 77 | 100 | 22.98 | 0.229 | 0 | 16.62 |
| 9 | 44 | 100 | 77 | 100 | 23.09 | 0.229 | 0 | 16.85 |
| **中央値** | **53** | **100** | **77** | **100** | **10.99** | **0.216** | **0** | **4.56** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1ms / Element render delay 1614.6ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 1800ms
  - `unused-css-rules` Reduce unused CSS — 約 1350ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

