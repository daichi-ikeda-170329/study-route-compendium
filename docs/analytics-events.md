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

| イベント | 許可するパラメータ | いつ |
|---|---|---|
| `subject_open` | `subject_id` | 科目トップを開いた |
| `catalog_filter` | `subject_id`, `filter_id` | 図鑑の絞り込みを使った |
| `book_open` | `subject_id`, `book_id` | 書籍の詳細を開いた |
| `book_search_open` | `subject_id`, `book_id` | 全体検索から書籍へ抜けた |
| `route_start` | `subject_id`, `mode` | ルート作成を始めた |
| `route_complete` | `subject_id`, `mode` | ルートが表示された |
| `route_save` | `subject_id`, `storage`（`"local"` 固定） | ルートを保存した |
| `pace_start` / `pace_complete` | `subject_id` | ペース計算 |
| `share_copy` / `share_native` / `share_x` | `subject_id` | 共有した |
| `route_share` | `subject_id`, `channel` | 共有した（新しい名前） |
| `shared_link_open` / `shared_route_open` | `subject_id` | 共有リンクから開かれた |
| `shared_link_invalid` / `shared_route_invalid` | `subject_id`, `reason` | 共有リンクを復元できなかった |
| `affiliate_click` | `subject_id`, `book_id`, `store` | 販売サイトへのリンクを押した |
| `book_buy_click` | `subject_id`, `book_id`, `store` | 同上（配信済みの名前。GA4 の集計を切らさないために残す） |

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
