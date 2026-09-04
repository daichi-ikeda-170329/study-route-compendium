# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T19:29:24.955Z
- commit: `b92680f7d76b3255c0f287032c18f46232af63cf`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4187
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 9（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 53 | 100 | 77 | 100 | 10.65 | 0.216 | 40 | 4.58 |
| 2 | 44 | 100 | 77 | 100 | 22.05 | 0.229 | 0 | 16.41 |
| 3 | 58 | 100 | 77 | 100 | 11.23 | 0.216 | 0 | 3.15 |
| 4 | 53 | 100 | 77 | 100 | 11.06 | 0.219 | 36 | 4.51 |
| 5 | 53 | 100 | 77 | 100 | 11.25 | 0.22 | 39 | 4.56 |
| 6 | 58 | 100 | 77 | 100 | 9.76 | 0.215 | 0 | 3.2 |
| 7 | 55 | 100 | 77 | 100 | 9.71 | 0.216 | 0 | 3.93 |
| 8 | 53 | 100 | 77 | 100 | 9.4 | 0.217 | 19 | 4.55 |
| 9 | 51 | 100 | 77 | 100 | 11.24 | 0.22 | 51 | 5.2 |
| **中央値** | **53** | **100** | **77** | **100** | **11.06** | **0.217** | **19** | **4.55** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.9ms / Element render delay 368.3ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1500ms
  - `unused-javascript` Reduce unused JavaScript — 約 1440ms
  - `unminified-javascript` Minify JavaScript — 約 470ms
  - `unminified-css` Minify CSS — 約 150ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

