# 解析イベントの契約

## 目的

どのページが読まれ、どの導線が使われているかを見て、確認と改善の順番を決める。
**受験生個人を追いかけるためではない。**

## 送信口はひとつ

送信は `assets/js/analytics.js` の `RTAnalytics.track()` だけを通る。
`gtag()` をその場で呼ぶ書き方は残さない。「この 1 か所だけ」と足した値が、
いつのまにか外へ出るのを防ぐのは注意ではなく仕組みである。

`track()` は次の 3 段で絞る。allowlist を通らないものは黙って落とす。

1. 送ってよいイベント名か
2. そのイベントで送ってよいパラメータ名か
3. 値の形が許可された範囲か（未知の値は落とす）

開発環境（localhost / 127.0.0.1 / 192.168.\*）では**送らず**、コンソールに
何を送ろうとして何を落としたかだけ出す。

## 送ってよいイベント

**この表は「送ってよい」ものの一覧（allowlist）であって、「送っている」ものの一覧ではない。**
`assets/js/analytics.js` が許可しているだけで呼び出しがまだ無いイベントがある。
**2026-09-19 に実測して区別した**（科目トップを実ブラウザで開き、図鑑・ルート・診断を
操作して `RTAnalytics.track` が呼ばれるかを見た。1 件も呼ばれなかった）。
実装するときは呼び出しを足すだけでよく、この表は変えなくてよい。

### 送っている（呼び出しがある）

| イベント | 許可するパラメータ | いつ | 呼ぶ場所 |
|---|---|---|---|
| `book_search_open` | `subject_id`, `book_id` | 全体検索から書籍へ抜けた | `assets/js/search.js` |
| `route_save` | `subject_id`, `storage`（`"local"` 固定） | ルートを保存した | `assets/js/share.js` |
| `share_copy` / `share_native` / `share_x` | `subject_id` | 共有した | `assets/js/share.js` |
| `shared_link_open` / `shared_route_open` | `subject_id` | 共有リンクから開かれた | `assets/js/share.js` |
| `shared_link_invalid` / `shared_route_invalid` | `subject_id`, `reason` | 共有リンクを復元できなかった | `assets/js/share.js` |
| `affiliate_click` | `subject_id`, `book_id`, `store` | 販売サイトへのリンクを押した | `build/generate-books.mjs`（書籍ページ） |

### 許可しているが、まだ呼び出しが無い

**科目トップ（図鑑・ルート・診断・ペース計算）の計測は 1 つも実装されていない。**
allowlist と契約だけが先に書かれ、呼び出しは 2026-09-19 時点で入っていない
（`1891ec25d` で allowlist を作ったときの対象は share.js・search.js・書籍ページの
購入リンクの 3 つで、科目トップは最初から入っていない）。ページ単位の閲覧は GA4 の
`page_view` で取れているので、足りないのは画面の中の行動だけである。

| イベント | 許可するパラメータ | 実装したら送る場面 |
|---|---|---|
| `subject_open` | `subject_id` | 科目トップを開いた |
| `catalog_filter` | `subject_id`, `filter_id` | 図鑑の絞り込みを使った |
| `book_open` | `subject_id`, `book_id` | 書籍の詳細を開いた |
| `route_start` | `subject_id`, `mode` | ルート作成を始めた |
| `route_complete` | `subject_id`, `mode` | ルートが表示された |
| `pace_start` / `pace_complete` | `subject_id` | ペース計算 |
| `route_share` | `subject_id`, `channel` | 共有した（新しい名前） |
| `book_buy_click` | `subject_id`, `book_id`, `store` | `affiliate_click` の旧名。GA4 の集計を切らさないために残してある |

**実装の優先度は流入しだい。** 2026-09 時点の検索流入は 1 日 30〜40 表示で、
診断完了率のような率をこの母数で測っても有意にならない。流入が戻ってから入れる
（`docs/growth-plan-2026-09-18.md`）。

値の形は `assets/js/analytics.js` の `CHECK` が持つ。
`subject_id` は収録している 7 科目のいずれか、`book_id` と `filter_id` は
`[a-z0-9][a-z0-9_-]*`、`store` は `amazon` か `rakuten` だけ。

## 送ってはいけないもの

- **大学名・学部名・偏差値・得点・模試名**
- **完了済み教材の id の配列・診断の回答内容・自由入力**
- 共有 URL の query / hash 全体
- localStorage の値
- 検索語をそのまま（許可済みの固定 id へ変換していないもの）

サイト内で入力した志望校・学部・偏差値・既習教材は、この端末の localStorage の
中だけで扱う。解析にも広告にも外部画像の取得先にも渡さない。

## 保持

Google アナリティクス 4 の既定の保持期間に従う。管理画面の設定は運営者が行う
（README の「運営者が行う手動設定」）。個人を特定する情報は送っていないため、
サイト側で追加の保持設定は持たない。

## 増やすとき

1. `assets/js/analytics.js` の `EVENTS` に足す
2. この表に足す
3. `test/analytics.test.mjs` が両者を突き合わせる。片方だけ増やすと落ちる

## 同意モード（Consent Mode v2）

2026-09-11 から、GA4 と AdSense のタグより前に同意の既定値を宣言している（改修仕様書 5.3）。

- EEA・英国・スイス（`build/lib/parts.mjs` の `CONSENT_REGIONS`）: `ad_storage` `ad_user_data` `ad_personalization` `analytics_storage` をすべて `denied`、`wait_for_update: 500`
- それ以外の地域: すべて `granted`（region 付きの宣言が優先されるので、日本からのアクセスは従来どおり）
- 正本は `build/lib/parts.mjs` の `CONSENT_DEFAULT`。生成ページは `analytics()` の中、手書き HTML（ポータル・科目トップ 7 枚・404）は `build/apply-consent.mjs` がマーカーの間に書き込む
- 上の地域向けの同意バナーは**置いていない**（IP の地域を JS から判定できず、全員に出すと日本の読者の体験を落とすため）。代わりに `/privacy/` に「同意が得られるまで解析・広告の Cookie を使わない」と書いている
- `test/analytics.test.mjs` が、全ページで `gtag('consent','default'` が `gtag('config'` より前にあることを見る

