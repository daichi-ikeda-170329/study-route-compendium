# セキュリティヘッダーと、いま可能な対策

## いまのホスティングでできること・できないこと

配信は GitHub Pages（カスタムドメイン `route-taizen.com`）。**任意のレスポンス
ヘッダーを設定する手段が無い。** したがって次のヘッダーは**設定できていない**。
設定済みであるかのように書かない。

| ヘッダー | 現状 | 備考 |
|---|---|---|
| `Content-Security-Policy` | **未設定** | Pages ではヘッダーを足せない。`<meta http-equiv>` でも一部は効くが、`frame-ancestors` と `report-uri` は meta では効かない |
| `Strict-Transport-Security` | **GitHub 側の設定** | Pages は HTTPS を強制する設定があり、そこで付く。サイト側では制御できない |
| `X-Content-Type-Options` | **未設定** | 同上 |
| `Referrer-Policy` | **未設定（ヘッダーとして）** | 要素単位では対応済み。外部画像と外部リンクに `referrerpolicy` / `rel="noreferrer"` を付けている |
| `Permissions-Policy` | **未設定** | 同上 |

## いま実際にやっている対策

ヘッダーが使えない代わりに、生成側で閉じている。**検査はすべて自動化してある**
（`test/analytics.test.mjs`・`test/dist.test.mjs`）。

- 外部リンクはすべて `target="_blank"` に `rel="noopener noreferrer"`。
  アフィリエイトのリンクには `sponsored` も付ける。
- 外部の書影は `referrerpolicy="no-referrer"`。ページの URL を画像の取得先へ渡さない。
- `javascript:` の URL を持たない。
- 利用者の入力を `innerHTML` へ直接入れない。保存項目の id は形を検証してから使い、
  `onclick` へ埋め込まない（`test/share.test.mjs`）。
- 解析へ送る項目は `assets/js/analytics.js` の allowlist を通ったものだけ。
  GA4 へ渡すページ URL からはクエリと `#` 以降を落としている。
- 公開するのは `dist/` だけで、生成の仕組み・検証中のデータ・開発設定は含めない。

## 外部から読み込んでいるもの

用途と所有者を記録しておく。増やすときはここも直す。

| 読み込み先 | 何のため | 誰のもの |
|---|---|---|
| `fonts.googleapis.com` / `fonts.gstatic.com` | 本文と見出しのフォント | Google |
| `www.googletagmanager.com` | アクセス解析（GA4） | Google |
| `pagead2.googlesyndication.com` | 広告配信（AdSense） | Google |
| `images-fe.ssl-images-amazon.com` / `images-na.ssl-images-amazon.com` | 書影 | Amazon |
| `ndlsearch.ndl.go.jp` / `cover.openbd.jp` | 書影（Amazon で取れないとき） | 国立国会図書館 / openBD |

いずれも読み込めなくてもサイトは動く。フォントは代替書体に、書影は書名と出版社を
出す代替表示に落ちる。広告と解析は無くても機能に影響しない
（`e2e/a11y.spec.mjs` と `e2e/privacy.spec.mjs` で確かめている）。

## 将来 CDN へ移した場合の推奨

ヘッダーを設定できるホスティング（Cloudflare Pages・Netlify・Vercel など）へ
移すなら、次を推奨する。**いまは設定できないので、移していないうちは書かない。**

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://pagead2.googlesyndication.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https://images-fe.ssl-images-amazon.com https://images-na.ssl-images-amazon.com https://ndlsearch.ndl.go.jp https://cover.openbd.jp https://pagead2.googlesyndication.com;
  connect-src 'self' https://www.google-analytics.com https://analytics.google.com;
  frame-src https://googleads.g.doubleclick.net;
  frame-ancestors 'none'; base-uri 'self'; form-action 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(), interest-cohort=()
```

`'unsafe-inline'` が要るのは、科目トップがインラインの `<script>` と `<style>` で
できているため。生成テンプレートから外部ファイルへ移せば nonce 方式にできるが、
**移行は別の作業**として扱う（現状の構成を CSP のために壊さない）。
