# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-05T02:31:56.147Z
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
| 1 | 76 | 100 | 77 | 100 | 6.94 | 0.003 | 3 | 2.45 |
| 2 | 65 | 100 | 73 | 100 | 6.91 | 0.216 | 2 | 2.82 |
| 3 | 66 | 100 | 73 | 100 | 6.91 | 0.216 | 3 | 2.13 |
| 4 | 76 | 100 | 77 | 100 | 6.94 | 0.003 | 3 | 2.43 |
| 5 | 65 | 100 | 77 | 100 | 6.91 | 0.217 | 2 | 1.84 |
| 6 | 66 | 100 | 77 | 100 | 6.91 | 0.216 | 2 | 2.16 |
| 7 | 66 | 100 | 77 | 100 | 6.91 | 0.216 | 3 | 2.15 |
| 8 | 74 | 100 | 77 | 100 | 11.58 | 0.004 | 2 | 2.41 |
| 9 | 75 | 100 | 77 | 100 | 6.93 | 0.002 | 18 | 3.13 |
| **中央値** | **66** | **100** | **77** | **100** | **6.91** | **0.216** | **3** | **2.41** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.9ms / Element render delay 52.1ms
- 節約見込みの大きい順:
  - `unminified-javascript` Minify JavaScript — 約 450ms
  - `unused-javascript` Reduce unused JavaScript — 約 150ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

