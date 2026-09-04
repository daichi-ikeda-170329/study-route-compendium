# Lighthouse 計測 (mobile / 第三者 遮断)

## 測定条件

- 実行日時: 2026-09-04T17:01:02.775Z
- commit: `b92680f7d76b3255c0f287032c18f46232af63cf`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4185
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 遮断した
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 56 | 100 | 77 | 100 | 9.61 | 0.216 | 0 | 4.06 |
| 2 | 55 | 100 | 77 | 100 | 23.47 | 0 | 0 | 16.44 |
| 3 | 55 | 100 | 77 | 100 | 23.61 | 0.001 | 0 | 16.54 |
| 4 | 55 | 100 | 77 | 100 | 8.86 | 0.215 | 0 | 4.19 |
| 5 | 55 | 100 | 77 | 100 | 23.76 | 0 | 0 | 16.59 |
| **中央値** | **55** | **100** | **77** | **100** | **23.47** | **0.001** | **0** | **16.44** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.9ms / Element render delay 1633ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 2680ms
  - `unused-javascript` Reduce unused JavaScript — 約 2650ms
  - `unminified-css` Minify CSS — 約 170ms
  - `unminified-javascript` Minify JavaScript — 約 160ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

