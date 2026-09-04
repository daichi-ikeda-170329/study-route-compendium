# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T15:44:14.809Z
- commit: `dabdb86de0f201ecf8d8d26da1f7c9367d179552`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4182
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 1（中央値を採る）

## /

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 74 | 100 | 77 | 100 | 4.02 | 0.192 | 0 | 2.72 |
| **中央値** | **74** | **100** | **77** | **100** | **4.02** | **0.192** | **0** | **2.72** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /english/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 100 | 77 | 100 | 8.09 | 0.229 | 0 | 5.72 |
| **中央値** | **50** | **100** | **77** | **100** | **8.09** | **0.229** | **0** | **5.72** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /japanese/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 100 | 77 | 100 | 8.91 | 0.224 | 0 | 5.58 |
| **中央値** | **50** | **100** | **77** | **100** | **8.91** | **0.224** | **0** | **5.58** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /math/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 51 | 100 | 77 | 100 | 7.2 | 0.22 | 0 | 5.75 |
| **中央値** | **51** | **100** | **77** | **100** | **7.2** | **0.22** | **0** | **5.75** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /social/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 44 | 100 | 77 | 100 | 21.48 | 0.225 | 0 | 18.56 |
| **中央値** | **44** | **100** | **77** | **100** | **21.48** | **0.225** | **0** | **18.56** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /joho/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 59 | 100 | 77 | 100 | 5.34 | 0.234 | 0 | 4.05 |
| **中央値** | **59** | **100** | **77** | **100** | **5.34** | **0.234** | **0** | **4.05** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /shoron/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 61 | 100 | 77 | 100 | 5.63 | 0.218 | 0 | 3.47 |
| **中央値** | **61** | **100** | **77** | **100** | **5.63** | **0.218** | **0** | **3.47** |

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

