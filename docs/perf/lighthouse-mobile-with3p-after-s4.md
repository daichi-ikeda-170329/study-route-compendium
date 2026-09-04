# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T16:31:00.637Z
- commit: `14a3c8ba92dd44a90249e4457b1200035de742e9`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4183
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 57 | 100 | 77 | 100 | 9.01 | 0.215 | 5 | 3.46 |
| 2 | 64 | 100 | 77 | 100 | 10.12 | 0.003 | 0 | 4.37 |
| 3 | 55 | 100 | 77 | 100 | 22.33 | 0.001 | 0 | 14.97 |
| 4 | 55 | 100 | 77 | 100 | 23.36 | 0 | 0 | 16.5 |
| 5 | 57 | 100 | 77 | 100 | 9.01 | 0.216 | 0 | 3.45 |
| **中央値** | **57** | **100** | **77** | **100** | **10.12** | **0.003** | **0** | **4.37** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

