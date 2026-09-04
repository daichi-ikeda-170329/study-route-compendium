# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T21:06:39.262Z
- commit: `0efeb4d545aea52fdeb0d71734e8fd317758e341`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4191
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 53 | 100 | 77 | 100 | 10.98 | 0.214 | 40 | 4.54 |
| 2 | 53 | 100 | 77 | 100 | 11.46 | 0.22 | 40 | 4.57 |
| 3 | 52 | 100 | 77 | 100 | 11.14 | 0.215 | 27 | 4.84 |
| 4 | 55 | 100 | 77 | 100 | 27.91 | 0.001 | 0 | 19.98 |
| 5 | 58 | 100 | 77 | 100 | 8.68 | 0.216 | 0 | 3.3 |
| **中央値** | **53** | **100** | **77** | **100** | **11.14** | **0.215** | **27** | **4.57** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1ms / Element render delay 267.9ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1070ms
  - `unminified-javascript` Minify JavaScript — 約 470ms
  - `unused-javascript` Reduce unused JavaScript — 約 220ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

