# 診断結果共有機能 — 現状調査（Phase 0）

調査日: 2026-08-26
対象コミット: 14f6691（`main`）
調査者: Claude Code

実装計画書 `docs/share-feature-plan.md` の Phase 0 として実施した。計画書の前提と実態が食い違った点は「7. 計画書との差異」にまとめている。

---

## 1. 技術スタック

| 項目 | 実態 |
|---|---|
| 構成 | 静的サイト。フレームワーク・バンドラ・npm 依存なし（`package.json` / `node_modules` が存在しない） |
| ホスティング | GitHub Pages（`CNAME` = `route-taizen.com`、`.nojekyll` あり） |
| デプロイ | `main` への push。CI でのビルドは行わないため、生成物もリポジトリにコミットする |
| ビルド | `build/*.mjs` を Node で直接実行（`node build/generate-books.mjs` など）。外部パッケージを import していない |
| ローカル確認 | `python3 -m http.server 8899 --bind 127.0.0.1` |

科目トップ（`<科目>/index.html`）は外部依存のない単一 HTML の SPA で、手で編集する。生成ページ（`books/` `routes/` `guides/` `osusume/`）は科目トップの `BOOKS` / `ROUTES` を正本にビルドスクリプトが出力する。

## 2. 3分診断の実装ファイル

診断は 5 科目それぞれの `<科目>/index.html` に**インラインで直接埋め込まれている**。専用ファイルは存在しない。`assets/` 配下に js ディレクトリもない（`assets/` は `site.css` と OGP 画像のみ）。

`english/index.html` を例に、関係する箇所は次のとおり。

| 要素 | 位置 | 内容 |
|---|---|---|
| 質問定義 `QUIZ` | 2751 行付近 | 質問文・選択肢・条件分岐をまとめた配列 |
| 回答の保持 `quizState` | 3442 行 | `{started, step, ans}`。`ans` は `{key: value}` のプレーンオブジェクト |
| 進行 `startQuiz` / `renderQuiz` / `pickOpt` / `nextQuiz` | 3443〜3474 行 | 質問画面の描画と遷移 |
| 表示対象の算出 `activeQuizSteps` | 3445 行 | `QUIZ` を `cond` でフィルタした配列を返す |
| 結果算出＋描画 `renderQuizResult` | 3475 行 | `quizState.ans` だけを入力に tier / policy / 書籍列を算出し `#quizShell` に描画 |
| ルート画面への反映 `applyQuiz` | 3518 行 | 結果をルートビルダーの状態 `S` に流し込み `go("route")` |
| 描画先 DOM | 728 行 | `<div class="quiz-shell" id="quizShell"></div>` |
| ビュー切替 `go(view)` | 2921 行 | `.view` の `active` クラスを付け替えるだけ。`history` は触らない |
| 初期化 | 3620〜3663 行（メイン `<script>` 末尾） | イベント登録と `renderCatalog()` 等の初回描画をベタ実行 |

`<script>` は 4 か所ある（568 = GA4 設定、934〜3664 = メイン、3665 = JSON-LD）。メインは 1 ブロックにすべて入っている。

### 科目間の重複状況

`renderQuiz()` は 5 科目で md5 が完全一致する（`8c764ee3442b5e4a48ab5c848d85d57a`）。つまり共通ロジックはコピーで運用されている。一方 `renderQuizResult()` は科目ごとに 41〜50 行で中身が異なる（国語・理科・社会は複数科目を並べる、理科は理科基礎の分岐がある、など）。

## 3. 診断の URL 構造

科目ごとに独立したページで、診断はその中の 1 ビュー。診断専用の URL は存在しない。

- `https://route-taizen.com/english/` — 英語の科目トップ（内部に home / 図鑑 / ルート / 診断 / 学習ガイドの 5 ビュー）
- 以下同様に `/japanese/` `/math/` `/science/` `/social/`

ビュー切替はハッシュもパスも使わない純粋な DOM 操作なので、共有 URL は `/<科目>/?v=1&a=...` の形になる。科目はパスで表現されるため、科目 ID をパラメータに載せる必要はない。

## 4. 質問数と選択肢数（全科目）

`QUIZ` を vm 上で実行して機械的に集計した。`cond` 列が「あり」の質問は、前の回答次第で表示されない条件分岐質問。

### english（5 問）

| # | key | 選択肢数 | cond | 値 |
|---|---|---|---|---|
| 0 | `bunri` | 2 | なし | bun, ri |
| 1 | `tier` | 5 | なし | kyote, nikkoma, march, chikoku, top |
| 2 | `tier2` | 4 | あり（`tier==="top"`） | sokei, kyutei, top, med |
| 3 | `level` | 3 | なし | 0, 1, 2 |
| 4 | `time` | 3 | なし | long, mid, short |

### japanese（5 問）

| # | key | 選択肢数 | cond | 値 |
|---|---|---|---|---|
| 0 | `tier` | 5 | なし | kyote, nikkoma, march, chikoku, top |
| 1 | `tier2` | 4 | あり（`tier==="top"`） | sokei, kyutei, top, hitotsubashi |
| 2 | `subj` | 4 | なし | all, gk, g, kyote |
| 3 | `level` | 3 | なし | 0, 1, 2 |
| 4 | `time` | 3 | なし | long, mid, short |

### math（5 問）

| # | key | 選択肢数 | cond | 値 |
|---|---|---|---|---|
| 0 | `bunri` | 2 | なし | bun, ri |
| 1 | `tier` | 5 | なし | kyote, nikkoma, march, chikoku, top |
| 2 | `tier2` | 4 | あり（`tier==="top"`） | sokei, kyutei, top, med |
| 3 | `level` | 3 | なし | 0, 1, 2 |
| 4 | `time` | 3 | なし | long, mid, short |

### science（6 問）

| # | key | 選択肢数 | cond | 値 |
|---|---|---|---|---|
| 0 | `tier` | 6 | なし | kyote, nikkoma, march, chikoku, med, top |
| 1 | `tier2` | 3 | あり（`tier==="top"`） | sokei, kyutei, top |
| 2 | `subj` | 7 | なし | pc, cb, p, c, b, g, kiso |
| 3 | `kiso` | 5 | あり（`subj==="kiso"`） | bg, cb, pc, cg, all |
| 4 | `level` | 4 | なし | 0, 1, 2, 3 |
| 5 | `time` | 3 | なし | long, mid, short |

### social（6 問）

| # | key | 選択肢数 | cond | 値 |
|---|---|---|---|---|
| 0 | `tier` | 5 | なし | kyote, nikkoma, march, chikoku, top |
| 1 | `tier2` | 4 | あり（`tier==="top"`） | sokei, kyutei, top, hitotsubashi |
| 2 | `course` | 3 | なし | bun2, bun1, ri1 |
| 3 | `subj` | 5 | なし | nihonshi, sekaishi, chiri, komin, undecided |
| 4 | `level` | 3 | なし | 0, 1, 2 |
| 5 | `time` | 3 | なし | long, mid, short |

質問数は最大 6、各質問の選択肢は最大 7。回答列を「1 質問 1 桁＋ドット区切り」で表現すると最長 11 文字（`1.2.3.4.5.6`）にしかならず、URL 全長 2,000 文字の制約には遠く及ばない。

条件分岐を考慮した組み合わせの上限概算は english 450 / japanese 900 / math 450 / science 12,096 / social 3,375。全パターンのラウンドトリップテストは総当たりで実行できる規模。

## 5. 既存のクエリパラメータ・ストレージ利用

5 科目の `index.html` すべてで、次の識別子の出現回数は **0** だった。

- `location` / `location.search` / `URLSearchParams`
- `history`
- `localStorage` / `sessionStorage`
- `navigator.share` / `navigator.clipboard`

したがってパラメータ名・ストレージキーの衝突は起きない。

## 6. `<head>` の canonical・OGP・アクセス解析

| 項目 | 実態 | 追加作業 |
|---|---|---|
| canonical | 5 科目とも静的にパラメータなしの自ページ URL を出力（`<link rel="canonical" href="https://route-taizen.com/english/">` 等、12 行目） | **不要**。計画書 Phase 5-1 の受け入れ条件をすでに満たす |
| OGP | `og:url` `og:image`（`assets/ogp-<科目>.png`）`og:image:width/height` `twitter:card=summary_large_image` を静的に出力 | 不要。共有 URL でもこの静的 OGP がそのまま使われる |
| CSP | `Content-Security-Policy` の meta なし | 外部 JS の追加やインラインスクリプトの制約なし |
| アクセス解析 | GA4 導入済み。測定 ID `G-DQ5WFXEFMX` を 5 科目共通で使用（`gtag('config', ...)`） | イベント送信可能。計画書 Phase 5-3 は「導入済み」の分岐で進める |

## 7. 決定性の確認（計画書 Phase 0 タスク 2）

**回答 → 結果は決定的である。実装変更を要する再現性の問題は見つからなかった。**

5 科目すべての `renderQuizResult()` を読み、入力を確認した。

- 入力は `quizState.ans` のみ。ここから `tier` / `policy` / `level` / 対象科目を導き、`TIERS` `ROUTES` `STAGES` `BOOKS` という静的定義を引いて書籍列を作る
- `Math.random()` / `Date` / `new Date()` / タイムスタンプへの依存はいずれの科目にもない
- ルートビルダー側の状態 `S`（志望校入力・偏差値・習得済み書籍）には依存しない。診断結果は `S` を読まず、`applyQuiz()` で一方向に `S` へ書き込むだけ

この性質により、復元処理は「`quizState.ans` を組み立てて既存の `renderQuizResult()` をそのまま呼ぶ」だけで済む。結果算出ロジックを複製する必要はない（計画書 4-3 の要件を構造的に満たせる）。

## 8. ビルド工程からの制約

`build/lib/extract.mjs` は科目 HTML の `<script>` を切り出して vm 上で実行し、`BOOKS` / `UNIS` / `TIERS` / `ROUTES` / `GUIDES` / `STAGES` / `CONFIG` を回収する。ここから 2 つの制約が出る。

1. **切り出し対象は `src` 属性を持たない `<script>` だけ**（正規表現 `(?![^>]*\bsrc=)` で除外）。したがって `assets/js/share.js` を `<script src>` で読み込む形にすれば、ビルドはこのファイルを実行しない
2. **科目 HTML に追記するコードは、上記定数の定義より後ろに置く**。vm 実行は例外を握りつぶす作りだが、定数定義より前で throw すると回収に失敗する

vm のコンテキストには `document` / `window` / `localStorage` / `navigator` のスタブはあるが、`location` と `history` はない。科目 HTML 側から共有機能を呼ぶ行は `typeof RTShare !== "undefined" && ...` で囲み、ビルド時に ReferenceError を出さないようにする。

## 9. 計画書との差異

| 計画書の記述 | 実態 | 対応 |
|---|---|---|
| 新規ファイルは `assets/js/share-diagnosis.js`（パスは既存構成に合わせる） | `assets/` に js ディレクトリなし。科目トップは外部依存ゼロの単一 HTML | `assets/js/share.js` を新設し、5 科目から `<script src>` で読む方針を採用（2026-08-26 に確認済み）。5 重複を避け、`node:test` から直接読めるようにするため |
| 共有 URL は `/{subject}/shindan/?v=1&a=...` | 診断専用ページはなく科目トップ内の 1 ビュー | `/<科目>/?v=1&a=...` とする |
| `a` は「要素数が当該科目の質問数と完全一致」 | 条件分岐質問があり、表示される質問数は回答によって変わる | `QUIZ` の宣言順に固定長のトークン列とし、非表示の質問は `0` を置く。復元時に `cond` を再評価して整合性を検証する |
| Phase 5-1 で canonical を静的に追加 | すでに全科目で出力済み | 確認のみ。変更不要 |
| Phase 5-3 は GA4 未導入なら送信コードを入れない | 導入済み | イベント送信を実装する |
| 保存データの `answers` は配列（`[2,1,3,4,2]`） | — | 共有 URL と同じトークン列の文字列（`"2.1.3.4.2"`）にした。読み出し時に `decodeAnswers` をそのまま使えるので、検証ロジックが 1 本で済む |
| 保存上限 10 件（科目ごとか全体かは未指定） | — | localStorage のキーは 1 つなので全科目あわせて 10 件とし、確認ダイアログにその旨を明記した。一覧に出すのは現在の科目の項目だけ |
| プライバシーポリシーへの追記は文面案を出し、適用は運営者判断 | — | 2026-08-26 に直接追記する方針で確認済み。5 科目とポータルの `LEGAL` に反映した。ポータルの「ページを閉じると入力内容は失われます」は保存機能と食い違うため、あわせて修正した |

## 10. 受け入れ条件

- [x] 調査ドキュメントが作成され、上記の全項目が埋まっている
- [x] 回答 → 結果が決定的（同じ回答なら常に同じ結果）であることを確認済み
