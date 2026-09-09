---
name: seo-rank-watch
description: route-taizen.com の検索順位を継続的に改善する。1 位を取れそうなキーワードを 1 つ選び、検索ニーズに答える改善を 1 つ行い、7 日間観察して実測で判定する。「SEO 改善」「順位を上げて」「seo-rank-watch」「検索順位を見て」と言われたら起動する。
---

# SEO Rank Watch

対象サイト: https://route-taizen.com （GitHub Pages。`main` に push すると公開される）

**1 回の実行で改善するキーワードは必ず 1 つだけ。**「測定 → 1 位に近い語を 1 つ選ぶ →
検索意図を調べる → 改善 → 7 日観察 → 実測で判定」を、1 位になるまで繰り返す。

## データ

| ファイル | 役割 |
|---|---|
| `data/seo/watchwords.json` | 監視キーワード / 対象ページ / 優先度 |
| `data/seo/rank-history.json` | 順位履歴。**追記専用** |
| `data/seo/improvement-log.json` | 改善履歴 / status / 次回レビュー日 |

`status` の意味。

| 値 | 意味 |
|---|---|
| `active` | 改善候補 |
| `observing` | 改善後 7 日間の観察中。**nextReviewDate まで絶対に再改善しない** |
| `achieved` | 1 位達成。監視のみ |

## スクリプト

```bash
# 今日どのキーワードを触ってよいかを一覧する（最初に必ず実行する）
node .claude/skills/seo-rank-watch/scripts/status.mjs --repo .

# GSC から順位を取る（認証情報が要る。未設定なら終了コード 2）
node .claude/skills/seo-rank-watch/scripts/fetch_gsc_ranks.mjs --repo . --append
node .claude/skills/seo-rank-watch/scripts/fetch_gsc_ranks.mjs --repo . --days 7

# WebSearch で目視した順位を追記する
echo '[{"keyword":"青チャート Focus Gold どっち","rank":3,"url":"https://route-taizen.com/math/guides/ao-vs-fg/"}]' \
  | node .claude/skills/seo-rank-watch/scripts/record_ranks.mjs --repo . --source websearch
```

## 順位の取り方

**原則として Google Search Console を正とする。** ただし 2026-09-09 時点で GSC API は
**まだセットアップされていない**（認証情報が無く、`fetch_gsc_ranks.mjs` は終了コード 2 で
止まる）。それまでは WebSearch による目視を使う。

- WebSearch の順位は**概算**。GSC が使えるようになったら GSC を正にする
- `rank: null` + `impressions: 0` は未インデックスとは限らない。必要なら WebSearch で確認する
- 改善効果を見るときは 28 日平均ではなく **7 日窓**を使う（`--days 7`）

### GSC を有効にする（運営者の作業）

1. Google Cloud でプロジェクトを作り、**Search Console API** を有効化する
2. サービスアカウントを作り、JSON 鍵をダウンロードする
3. Search Console の `route-taizen.com` プロパティに、そのサービスアカウントの
   メールアドレスを**制限付きユーザー**として追加する
4. 鍵を `private/gsc-service-account.json` に置く（`private/` は `.gitignore` 済み）。
   または環境変数 `GSC_SERVICE_ACCOUNT_JSON` にパスを渡す

`fetch_gsc_ranks.mjs` は**まだ実データで検証していない。**初回実行時は終了コードと
出力を必ず目で確かめる。

## Workflow

### 1. 順位を測る

`status.mjs` で現状を出し、GSC か WebSearch で順位を取って追記する。
前回からの変動（上昇・下降）を確認する。

### 2. 7 日経過した改善をレビューする

`nextReviewDate <= 今日` のキーワードを、**7 日窓**の順位で判定する。

| 結果 | status |
|---|---|
| 1 位 | `achieved` |
| 改善したが 1 位未達 | `active`（次も同じ方向で深める） |
| 効果なし | `active`（**次回は前回と違う改善方法を使う**） |

判定結果を `improvement-log.json` に記録する。

### 3. 今日改善するキーワードを 1 つ選ぶ

`observing` と `achieved` は除外する。次の順で **1 つだけ**選ぶ。

1. 2〜10 位 + impressions あり（1 位に近いものを優先）
2. 11〜20 位 + impressions が多い
3. 改善したが 1 位未達 / 効果なし
4. 高優先度の `rank: null`
5. GSC で見つかった有望な未登録クエリ

**候補が無ければ、順位チェックとレポートだけで終了する。**
改善するために無理やり対象を作らない。

### 4. 検索ニーズを分析する

改善の前に、必ず次の 4 つを済ませる。

1. 「誰が・何を知りたくて検索しているか」を 1〜2 文で定義する
2. WebSearch で現在の上位 1〜3 ページを確認する
3. 上位ページと対象ページを比較する
4. 検索ニーズに対して不足している情報を**ギャップ**として特定する

**SEO のために文章量を増やさない。**検索ユーザーが欲しい情報を足す。

### 5. 1 つのキーワードを改善する

ギャップに応じて、必要なものだけ実装する。

- title / description / 導入文 / FAQ の改善
- 不足しているコンテンツの追加
- 記事 ↔ 大学別ページ ↔ 参考書詳細ページの内部リンク
- 不足している実データの追加

内部リンクは SEO 目的だけでなく、検索ユーザーの「次に知りたい・やりたいこと」へ誘導する。

**このサイト固有の注意。** `<科目>/guides/<slug>/` などの生成ページは
`build/` のスクリプトが出力する。**HTML を直接編集しない。**正本
（`<科目>/index.html` の `BOOKS` / `ROUTES`、`build/data/` のデータ）を直してから
`npm run build` で作り直す。どのページが生成物かは README「ディレクトリ構成」を見る。

編集後は必ず次を通す。

```bash
npm run build && npm test
npm run check:site
node build/check-links.mjs --internal
```

`npm run check:links`（引数なし）は**流さない。**1,390 冊ぶんの外部リンクを
Amazon・楽天へ問い合わせる週次 CI 用のジョブで、記事 1 本の編集には重すぎる
（`build/check-links.mjs` の冒頭を参照）。記事の編集で見るべきは内部リンクだけ。

### 6. 改善を記録して 7 日待つ

`improvement-log.json` に記録する。

```json
{
  "keyword": "...",
  "targetPath": "...",
  "status": "observing",
  "nextReviewDate": "今日+7日",
  "actions": [{
    "date": "...",
    "rankAtAction": 4.2,
    "rankSource": "websearch",
    "needs": "検索ニーズ",
    "done": "実際に行った改善"
  }]
}
```

`data/seo/*.json` の変更は Git にコミットする。

## Report

最後に簡潔に報告する。

- 前回から大きく上昇 / 下降したキーワード
- 今回行った効果判定
- 今日選んだキーワードと選定理由
- 推測した検索ニーズ
- 実際に行った改善
- `observing` 中のキーワードと `nextReviewDate`

**順位改善を予測で断定しない。**何を変更したかを報告し、効果は次回の実測で判断する。

## Guardrails

- Google SERP を独自スクリプトでスクレイピングしない。GSC または WebSearch を使う
- 1 回につき改善は 1 キーワードだけ
- `observing` の 7 日間クールダウンを厳守する
- `rank-history.json` の過去データを書き換えない（`record_ranks.mjs` が同日二重記録を拒否する）
- 認証キーや秘密情報を出力・コミットしない
- `noindex` や大きな構造変更は承認なしで適用しない
- 改善効果を断定しない
- 改善対象が無ければ何もしない
- **生の検索クエリをリポジトリに入れない。** `watchwords.json` に登録済みのキーワードだけを
  記録する。GSC の未登録クエリは画面に出すだけで、ファイルには書かない
  （理由は `docs/kpi-import-guide.md`「2. 取り込んではいけないもの」）
