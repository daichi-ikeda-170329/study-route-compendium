# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T19:25:40.439Z
- commit: `b92680f7d76b3255c0f287032c18f46232af63cf`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4186
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 55 | 100 | 73 | 100 | 10.43 | 0.216 | 0 | 3.81 |
| 2 | 52 | 100 | 77 | 100 | 10.83 | 0.217 | 27 | 4.81 |
| 3 | 52 | 100 | 77 | 100 | 10.26 | 0.217 | 27 | 4.76 |
| 4 | 44 | 100 | 77 | 100 | 29.51 | 0.218 | 0 | 22.69 |
| 5 | 53 | 100 | 77 | 100 | 10.63 | 0.216 | 36 | 4.51 |
| **中央値** | **52** | **100** | **77** | **100** | **10.63** | **0.217** | **27** | **4.76** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1ms / Element render delay 279ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 1740ms
  - `unused-css-rules` Reduce unused CSS — 約 1520ms
  - `unminified-javascript` Minify JavaScript — 約 470ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

