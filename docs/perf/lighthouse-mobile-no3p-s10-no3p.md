# Lighthouse 計測 (mobile / 第三者 遮断)

## 測定条件

- 実行日時: 2026-09-04T21:09:29.760Z
- commit: `0efeb4d545aea52fdeb0d71734e8fd317758e341`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4192
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 遮断した
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 58 | 100 | 100 | 100 | 8.26 | 0.216 | 0 | 3.15 |
| 2 | 58 | 100 | 100 | 100 | 8.86 | 0.215 | 0 | 3.29 |
| 3 | 58 | 100 | 100 | 100 | 8.86 | 0.215 | 0 | 3.29 |
| 4 | 69 | 100 | 100 | 100 | 8.32 | 0.003 | 0 | 3.21 |
| 5 | 55 | 100 | 100 | 100 | 21.59 | 0 | 0 | 16.62 |
| **中央値** | **58** | **100** | **100** | **100** | **8.86** | **0.215** | **0** | **3.29** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.9ms / Element render delay 2665.2ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1290ms
  - `unminified-javascript` Minify JavaScript — 約 330ms
  - `unused-javascript` Reduce unused JavaScript — 約 330ms

