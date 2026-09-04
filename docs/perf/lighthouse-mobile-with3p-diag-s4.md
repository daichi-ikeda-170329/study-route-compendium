# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T16:34:32.674Z
- commit: `92d09408d70880d6355f5b4e7dbf8758c389b080`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4184
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 1（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 57 | 100 | 77 | 100 | 8.41 | 0.216 | 0 | 3.49 |
| **中央値** | **57** | **100** | **77** | **100** | **8.41** | **0.216** | **0** | **3.49** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 2.9ms / Element render delay 275.7ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1200ms
  - `unminified-javascript` Minify JavaScript — 約 450ms
  - `unused-javascript` Reduce unused JavaScript — 約 300ms
  - `unminified-css` Minify CSS — 約 150ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

