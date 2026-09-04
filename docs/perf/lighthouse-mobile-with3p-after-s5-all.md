# Lighthouse 計測 (mobile / 第三者 含む)

## 測定条件

- 実行日時: 2026-09-04T19:31:40.869Z
- commit: `b92680f7d76b3255c0f287032c18f46232af63cf`
- Lighthouse: 13.4.1
- Chrome: Google Chrome 152.0.7977.76
- 対象: localhost (build/serve.mjs, .)
- base URL: http://127.0.0.1:4188
- form factor: mobile / throttling: simulate (lighthouse mobile default)
- 第三者スクリプト: 通常どおり読み込んだ
- 実行回数: 1（中央値を採る）

## /

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 71 | 100 | 77 | 100 | 4.05 | 0.189 | 0 | 3.47 |
| **中央値** | **71** | **100** | **77** | **100** | **4.05** | **0.189** | **0** | **3.47** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 3ms / Element render delay 255.7ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1040ms
  - `unused-javascript` Reduce unused JavaScript — 約 850ms
  - `unminified-css` Minify CSS — 約 170ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /english/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 57 | 100 | 77 | 100 | 9.61 | 0.225 | 0 | 3.3 |
| **中央値** | **57** | **100** | **77** | **100** | **9.61** | **0.225** | **0** | **3.3** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1.1ms / Element render delay 359.1ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1330ms
  - `unused-javascript` Reduce unused JavaScript — 約 1290ms
  - `unminified-javascript` Minify JavaScript — 約 470ms
  - `unminified-css` Minify CSS — 約 150ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /japanese/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 43 | 100 | 77 | 100 | 20.58 | 0.236 | 0 | 15.85 |
| **中央値** | **43** | **100** | **77** | **100** | **20.58** | **0.236** | **0** | **15.85** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1ms / Element render delay 1613ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 2560ms
  - `unused-css-rules` Reduce unused CSS — 約 1490ms
  - `unminified-css` Minify CSS — 約 320ms
  - `unminified-javascript` Minify JavaScript — 約 230ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /math/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 53 | 100 | 77 | 100 | 9.84 | 0.217 | 41 | 4.54 |
| **中央値** | **53** | **100** | **77** | **100** | **9.84** | **0.217** | **41** | **4.54** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1ms / Element render delay 397.8ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 1290ms
  - `unused-css-rules` Reduce unused CSS — 約 1160ms
  - `unminified-javascript` Minify JavaScript — 約 320ms
  - `unminified-css` Minify CSS — 約 60ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /social/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 52 | 100 | 77 | 100 | 10.32 | 0.222 | 40 | 4.7 |
| **中央値** | **52** | **100** | **77** | **100** | **10.32** | **0.222** | **40** | **4.7** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 1.1ms / Element render delay 283.8ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 1780ms
  - `unused-css-rules` Reduce unused CSS — 約 1710ms
  - `unminified-javascript` Minify JavaScript — 約 660ms
  - `unminified-css` Minify CSS — 約 150ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /joho/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 60 | 100 | 77 | 100 | 6.87 | 0.234 | 0 | 2.9 |
| **中央値** | **60** | **100** | **77** | **100** | **6.87** | **0.234** | **0** | **2.9** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.9ms / Element render delay 379.6ms
- 節約見込みの大きい順:
  - `unused-css-rules` Reduce unused CSS — 約 1110ms
  - `unused-javascript` Reduce unused JavaScript — 約 970ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

## /shoron/

| run | Performance | A11y | Best Practices | SEO | LCP(s) | CLS | TBT(ms) | SI(s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 67 | 100 | 77 | 100 | 7.25 | 0.002 | 0 | 3.76 |
| **中央値** | **67** | **100** | **77** | **100** | **7.25** | **0.002** | **0** | **3.76** |

### 診断（最終 run）

- LCP になった要素: `<p class="lead">`
- その位置: `div.hero > div.hero__grid > div.hero__main > p.lead`
- LCP の内訳: Time to first byte 0.9ms / Element render delay 364.5ms
- 節約見込みの大きい順:
  - `unused-javascript` Reduce unused JavaScript — 約 810ms
  - `unused-css-rules` Reduce unused CSS — 約 400ms

### Best Practices で落ちた audit（最終 run）

- `third-party-cookies` — Uses third-party cookies
- `inspector-issues` — Issues were logged in the `Issues` panel in Chrome Devtools

