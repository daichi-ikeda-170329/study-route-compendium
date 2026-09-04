# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T15:43:01.455Z
- commit: `dabdb86de0f201ecf8d8d26da1f7c9367d179552`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4181
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 5（中央値を採る）

## /science/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 47 | 100 | 77 | 100 | 12.09 | 0.216 | 0 | 7.55 |
| 2 | 47 | 100 | 77 | 100 | 12.12 | 0.217 | 0 | 7.51 |
| 3 | 47 | 100 | 77 | 100 | 12.93 | 0.216 | 0 | 7.38 |
| 4 | 47 | 100 | 77 | 100 | 10.94 | 0.217 | 0 | 7.53 |
| 5 | 47 | 100 | 77 | 100 | 9.94 | 0.217 | 0 | 7.54 |
| **中央値** | **47** | **100** | **77** | **100** | **12.09** | **0.217** | **0** | **7.53** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

