# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-08T09:17:58.908Z
- commit: `c9a24c2cf01b4c6ef26c476344c521d06815ffad`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4194
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 76 | 100 | 77 | 100 | 6.91 | 0.004 | 12 | 2.16 |
| 2 | 76 | 100 | 77 | 100 | 6.93 | 0.004 | 21 | 2.35 |
| 3 | 76 | 100 | 77 | 100 | 6.93 | 0.004 | 26 | 2.43 |
| 4 | 76 | 100 | 77 | 100 | 6.91 | 0.004 | 23 | 2.16 |
| 5 | 76 | 100 | 77 | 100 | 6.93 | 0.003 | 14 | 2.45 |
| **中央値** | **76** | **100** | **77** | **100** | **6.93** | **0.004** | **21** | **2.35** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1ms / Element render delay 65.7ms
- 節約見込みの大きい順:
  - `unminified-javascript` Minify JavaScript — 約 450ms
  - `unused-javascript` Reduce unused JavaScript — 約 150ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

