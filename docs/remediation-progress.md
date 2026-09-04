# 未解決事項の対応状況

最終更新: 2026-09-05 / 対象 SHA: `dabdb86de0f201ecf8d8d26da1f7c9367d179552`（分岐元 `origin/main`）
実装指示書: `/Users/ikedadaichi/Downloads/ルート大全未解決事項実装指示書.md`
作業ブランチ: `fix/unresolved-items`

> **指示書のパスについて。** 依頼文では `~/Downloads/route-taizen-plan.md` と書かれていたが、
> 実ファイルは `~/Downloads/ルート大全未解決事項実装指示書.md` だった。Downloads 配下に他の候補が
> 無いため、こちらを指示書として扱う。文脈が切れたらこのパスから読み直す。

## チェックポイント

| CP | 名前 | 状態 | コミット | 証跡 | 備考 |
|---|---|---|---|---|---|
| S0 | 基準の固定と進捗台帳 | DONE | (このコミット) | `docs/baseline-2026-09-05.md` / `docs/perf/lighthouse-mobile-with3p-baseline-s0.json` | localhost が本番値を再現することを確認 |
| S1 | 公開物と main の一致 | DONE | (このコミット) | `build/check-production.mjs` / `docs/deployment-runbook.md` / `test/production-check.test.mjs` | Pages Source は 2026-09-04 に切替済み。本番検査 19/19 通過。Description 更新のみ OWNER ACTION |
| S2 | 科目データの読み書き口を 1 本化 | DONE | 016dfe73 / (このコミット) | `build/lib/load-subject-data.mjs` / `test/affiliate-disclosure.test.mjs` / `test/subject-loader.test.mjs` | 生成物は 1 バイトも不変。`check:shape` 通過 |
| S3 | 科目移行 前半（joho/shoron/math） | DONE | 9d4f6a85 / 4ec7d262 / 8c46c52d / c1d732f3 | `build/migrate-subject.mjs` / `data/subjects/{joho,shoron,math}/` | joho 153,728→97,472 / shoron 225,578→98,211 / math 471,171→143,139 バイト |
| S4 | 科目移行 後半（science/english/japanese/social） | DONE | 92d09408 / 3 件 / 7f596b06 / 70b07c22 | `data/subjects/*/` / `test/subject-loader.test.mjs` | 7 科目すべて移行。全科目 250KB 予算内（最大 166,782） |
| S5 | 性能予算の達成 | DONE（目標一部未達） | a893ad6c / (このコミット) | `docs/performance-report.md` / `test/performance-budget.test.mjs` | バイト予算は達成。Performance 47→53 / SI 7.53s→4.55s。目標 80 / 4.0s / 0.10 は未達で、残因は Google Fonts |
| S6 | 進捗管理 | DONE | a28dc50a | `assets/js/progress.js` / `/progress/` / `test/progress.test.mjs` / `e2e/progress.spec.mjs` | 残り時間の下限・上限に同じ係数。既存キー無傷。ネットワーク流出 0 |
| S7 | 任意の追加質問 | DONE | 23cf9908 | `assets/js/refine.js` / `e2e/refine.spec.mjs` | スキップ時の結果と共有 URL が完全一致することを HTML 突き合わせで固定 |
| S8 | 詳細検索 | 未着手 | | | |
| S9 | 書影の出所台帳 | 未着手 | | | |
| S10 | QA・Best Practices・KPI | 未着手 | | | |
| S11 | 最終検証と報告 | 未着手 | | | |

## 未解決事項 8 件との対応

| # | 事項 | 担当 CP | 状態 |
|---|---|---|---|
| 1 | 科目データの分離 | S1〜S5 | DONE（性能目標は一部未達。`docs/performance-report.md` に実測と残因） |
| 2 | 進捗管理の拡張 | S6 | DONE |
| 3 | 任意の追加質問 | S7 | DONE |
| 4 | 検索の絞り込み拡張 | S8 | 未着手 |
| 5 | 書影の出所台帳 | S9 | 未着手 |
| 6 | 手動 QA | S10 | 未着手 |
| 7 | Best Practices 77 の原因分離 | S10 | 未着手 |
| 8 | KPI 基準値 | S10 | 未着手 |

## 次にやること（実行が切れたらここから再開する）

- S8 に着手する。検索の絞り込み拡張。
  **`assets/js/book-index.js` を膨らませない**（`test/performance-budget.test.mjs` の
  300,000 バイト上限が守っている）。出版社・著者・難易度帯・出版年・確認状態は
  `assets/generated/search-facets.json`（v2）へ入れ、`/search/` でだけ読む。
- 確認状態は `build/data/verification.json` から取る。**科目データ側へ複製しない。**
- `/search/` は `noindex,follow`。指示書 §4.4 の 5 項目を全部通す
  （`ALLOW_DIRS` への `'search'` 追加を忘れない）。
- **filter 未指定では欠損データも検索対象に含める。** 難易度や著者が不明なものを
  「該当なし」に落とさず、「不明・確認中」として区別する。

## S4 時点の実測（S5 の出発点）

| 科目 | 改修前 | S4 後 | 減 |
|---|---:|---:|---:|
| science | 977,442 | 165,157 | −83.1% |
| social | 874,633 | 166,782 | −80.9% |
| english | 607,760 | 151,126 | −75.1% |
| japanese | 586,352 | 151,994 | −74.1% |
| math | 471,171 | 143,139 | −69.6% |
| shoron | 225,578 | 98,211 | −56.5% |
| joho | 153,728 | 97,472 | −36.6% |

**全科目が 250,000 バイトの予算に入った。science は 200,000 バイトの予算にも入っている。**

Lighthouse（localhost / mobile / 5 run 中央値 / 第三者あり）:

| 指標 | S0（改修前） | S4 後 |
|---|---:|---:|
| Performance | 47 | 57 |
| LCP | 12.09s | 9.01〜10.21s |
| CLS | 0.217 | 0.215 |
| Best Practices | 77 | 77 |

LCP 要素は自サイトの `p.lead`（テキスト）で、外部画像ではない。
節約見込みの最大は `unused-css-rules`（約 1.2〜1.65 秒）。**次の一手は CSS。**

## OWNER ACTION（運営者しかできない。台帳で追跡する）

| # | 内容 | 必要な権限 | 手順 | 完了判定 | 状態 |
|---|---|---|---|---|---|
| 1 | GitHub リポジトリの Description が `参考書1,052冊` のまま（実際は 1,390 冊） | 対象リポジトリの admin | `gh repo edit daichi-ikeda-170329/study-route-compendium --description "大学受験の参考書を科目・目的別に整理し、学習ルートと進捗管理を提供する静的サイト"` | `gh repo view --json description` の出力に `1,052` が含まれない | 未実施 |
| 2 | GitHub リポジトリの Topics が未設定 | 同上 | `gh repo edit daichi-ikeda-170329/study-route-compendium --add-topic static-site --add-topic github-pages --add-topic education --add-topic japanese` | `gh repo view --json repositoryTopics` が `null` でない | 未実施 |
| 3 | 書体の読み込み方針。CLS 0.217 の原因は Google Fonts の差し替えで、`&display=swap` を `&display=optional` にすればほぼ 0 になる。ただし**初回訪問・回線が遅いときに指定の書体が出なくなる**（代替は Hiragino / Yu Gothic / Noto Sans JP） | 権限は不要。**見た目の判断** | `rg 'display=swap'` で全箇所（手書き HTML 9 枚と `build/lib/parts.mjs`）を出し、`display=optional` へ変えて `npm run build` | `npm run audit:performance -- --runs=9 --path=/science/` の CLS 中央値が 0.10 以下 | 未判断 |

**1 と 2 は手元の `gh` に `repo` scope があるので技術的には実行できる。**
ただし公開リポジトリの外向き設定を変える操作なので、実行前に運営者の可否を確認する。
確認が取れたら実行し、この表を「実施済み」に書き換える。**確認前に「更新した」と書かない。**

## 引き継ぎメモ

### S0 で決めたこと

1. **`build/audit-performance.mjs` を S10 ではなく S0 で作った。**
   指示書は §51（S10）でこのスクリプトを作ることになっているが、S0 でも「測り方を固定した
   Lighthouse ベースライン」が要る。手打ちの `npx lighthouse` を S0 で使い S10 でスクリプト化すると、
   指示書 §3.1 の「同じ処理の入口を 2 つ作らない」に反し、S0 と S5/S10 で測り方がずれる。
   そこで S0 で作り、S10 では第三者遮断条件（`--block-third-party`）での再実行と報告に使う。
   スクリプトは既に `--block-third-party` を持っている。

2. **Lighthouse は 5 回流して中央値を採る（指示書 §7 の 3 回ではなく）。**
   3 回で測ったとき 1 run だけ LCP 23.32 秒・CLS 0 の外れ値が出た（第三者読み込みが詰まった run）。
   3 回だと外れ値が中央値の位置を動かすので 5 回に固定した。詳細は `docs/baseline-2026-09-05.md` §7。

3. **`build/audit-performance.mjs` は git を呼ばない。**
   `test/data-integrity.test.mjs` の「生成スクリプトが git のメタデータに依存していない」が
   `build/**` 全体の `spawnSync('git')` を禁じている（浅いクローンで生成物が環境依存になる事故の再発防止）。
   測定スクリプトも例外にせず、commit SHA は `--commit=` か `GITHUB_SHA` で受け取る。
   `package.json` の `audit:performance` が `git rev-parse HEAD` を渡す。
   **テストを緩めるのではなく、スクリプト側を規約に合わせた。**

4. **Lighthouse は localhost で測る。** 本番（`https://route-taizen.com/`）を毎回叩くと
   ネットワークとキャッシュで値がぶれ、改修の効果と切り分けられない。
   localhost 計測が本番の監査値（Performance 47 / Best Practices 77 / CLS 0.216）を再現したので
   （`docs/baseline-2026-09-05.md` §7）、比較は localhost で行い、本番との突き合わせは S10 で行う。
   **報告では必ず「localhost で測った」と書く。**

5. **Node は手元 v25.8.1 で作業する。** CI は 22 系。`build/*.mjs` は Node 標準 API しか使っておらず、
   22 と 25 で挙動が変わる箇所は見当たらない。CI（`test.yml`）が 22 で回るので、
   バージョン差で壊れるならそこで検出できる。

### S1 で決めたこと

1. **Pages Source の切替は `OWNER ACTION` ではなく完了済みとして扱う。**
   指示書 §10 は「まだ GitHub Actions ではない」を前提にしているが、README の
   「運営者が行う手動設定」に 2026-09-04 切替済みと書かれており、`npm run check:production` を
   本番へ流して 19 項目すべて通過することを実測した（`/package.json`・`/build/all.mjs`・
   `/README.md` などが 404）。指示書 §3 の「食い違ったら現行コードを正とする」に従う。

2. **`check-production.mjs` は必須ゲートにしない。**
   代わりに `test/production-check.test.mjs` が localhost に旧構成（リポジトリ直下配信）と
   新構成（`dist/` 配信）の 2 つを立て、**旧構成で終了コード 1 になること**を決定的に固定した。
   公開サイトへの HTTP は `.github/workflows/production.yml`（週次 + 手動）に置き、
   終了コード 2（未検査）では CI を赤くしない。

3. **README への引用 1 件を `count-ignore.json` に登録した。**
   OWNER ACTION の完了判定として、現在の GitHub Description（`参考書1,052冊`）を README に
   そのまま引用する必要がある。`apply-count.mjs` の `sweep()` がこれを「実データに無い冊数」として
   拾って `check:counts` が落ちたので、理由付きで登録した。**テストは緩めていない。**
   もう 1 件（`test/production-check.test.mjs` の `1,390冊`）は ignore に足さず、
   期待値を `count-state.json` から組み立てる形に書き直して解消した。

### S2 で決めたこと

1. **`extractSubject()` の直接呼び出しを 0 にした。**
   `build/` 19 本と `test/` 7 本を `loadSubjectData()` へ差し替え、残っていないことを
   `test/subject-loader.test.mjs` の「科目データの読み口が 1 本だけになっている」で固定した。
   `build/lib/extract.mjs` と `build/lib/load-subject-data.mjs` だけが例外。

2. **移行が途中の科目は、黙って HTML へ落とさず落とす。**
   `books.json` はあるが `routes.json` が無いような状態でフォールバックすると、
   「移したつもりで移っていない」に気づけないまま生成が通る。ローダーは全 6 ファイルの
   存在を確かめ、欠けていれば例外にする。

3. **戻り値の比較に `assert.deepStrictEqual` を使わない。**
   `extractSubject()` は vm 上で script を実行するので、返る配列は**別 realm の prototype** を
   持つ。`deepStrictEqual` は prototype も比べるため、中身が同一でも落ちる。
   キー順を揃えた JSON 文字列（`canonical()` 経由）で比べる。

4. **`apply-new-books` の canonical 側の冪等性は「id を除いて入れ直す」で作った。**
   マーカー区間は HTML にしか無いので使えない。`new-books.json` に載っている id を
   既存書からいったん全部除き、末尾へ入れ直す。何度流しても同じ結果になり、
   並び順もマーカー区間が BOOKS 末尾にある現行の見え方と揃う。

### S3 で決めたこと・見つけたこと

1. **app JS の外部化を S5 ではなく移行と同時に行った。**
   指示書は §28.1（S5）で app JS を外へ出すことになっているが、app コードは
   `BOOKS` などをスコープに閉じ込めて参照している。データだけ先に外へ出すと、
   その間ずっと壊れた状態になる。**両方を同じコミットで動かすほうが安全**なので、
   `build/migrate-subject.mjs` が同時に行う。S5 は `<style>` の外部化と予算の固定に使う。

2. **アセットの取得は「初期表示のあとに 5 本まとめて」にした。**
   指示書 §21 はタブを開いたときに `books` / `routes` / `unis` を個別に取る表を
   示しているが、科目 app は同期前提の 1 スコープなので、タブ単位の遅延にすると
   7 本の app それぞれで描画の入口を書き換えることになり、事故の面が広がる。
   LCP を決めているのは事前描画済みのカードと CSS で、そこはどちらの案でも同じ。
   **アセットはファイル単位に分けてあるので、必要になればタブ単位の遅延へ進める。**
   効果は S5 の実測で確かめて報告する。

3. **移行で 3 つの事故を見つけた。いずれも「黙って壊れる」形だった。**
   - `build/generate-books.mjs` の `extractConfig()`（HTML 正規表現）→ 購入リンクから
     アフィリエイト経路と `rel="sponsored"` が消える。指示書 §3.4 が挙げていない 3 か所目。
   - 宣言のあとの `BOOKS.push(...)` / `TIERS.push(...)` が app に残る → 起動時に件数が増える
     （math で 162 → 256）。`check:shape` では捕まらない。
   - `var RTShare = (typeof RTShare !== "undefined" && RTShare) || {no-op}` が
     関数スコープになり no-op に落ちる → 共有・診断・ペースが黙って死ぬ。
   3 つとも、再発を捕まえる検査を同じコミットに入れた。

4. **e2e の対象ページに国語・社会・小論文のトップが入っていなかった。**
   7 科目のうち 4 科目しか見ていなかったので `KEY_PAGES` に足した。

### S4 で決めたこと

1. **`extractSubject()` と `build/migrate-subject.mjs` を削除した（指示書 §25・§26 のとおり）。**
   移行が終わった時点で、この 2 つは実行できない（データが HTML に無い）。
   残すと「使えないのに残っているコード」になり、読む人を迷わせる。
   変換の中身は commit `9d4f6a85`〜`7f596b06` に残っており、
   `git show 9d4f6a85:build/migrate-subject.mjs` で取り出せる。

2. **フォールバック削除を「本番確認後」まで待たなかった。**
   指示書 §25 は待ってもよいとしているが、**フォールバックには救済の価値が無い。**
   データはもう HTML に無いので、落ちても `BOOKS を取り出せなかった` で失敗するだけ。
   一方で残すと、移行が壊れても黙って通る経路になる。害だけがあるので即削除した。

3. **e2e に `waitForApp()` を入れた。**
   データが同期スクリプトだった頃は `domcontentloaded` で DOM が確定していたが、
   いまは fetch のあとに描画する。待たずに測ると描画途中を見てしまい、
   並行実行の負荷が高いときに axe が落ちた（実際に 1 件）。
   **テストを緩めたのではなく、測る時点を正した。** そのあと 3 回連続で 188 件 pass。

### S5 で決めたこと

1. **`<style>` の外部化はしなかった（指示書 §28.2 からの逸脱）。**
   実測が支持しなかった。インライン `<style>` は `render-blocking-insight` に挙がらず、
   ネットワークの critical path に乗っていない。外へ出すと描画ブロックのリクエストが
   1 本増える（指示書 §28.2 自身が「かえって悪化しうる」と書いている）。
   バイト予算は外部化せずに達成済み。理由と実測は `docs/performance-report.md` §5.1。

2. **代わりに `defer` を入れた。これが最も効いた。**
   自前のスクリプト 4 本（share / pace / bunri / analytics）が描画をブロックしていた。
   合計 4,676ms（5 本）→ 2,889ms（Google Fonts の 1 本のみ）。
   Speed Index が 7.53s → 4.55s（−39.6%）。

3. **Google Fonts は触らなかった。** 残る唯一の描画ブロック（2,889ms / 207,854 バイト）で、
   CLS 0.217 の原因でもある（Lighthouse の `cls-culprits-insight` が挙げる原因は
   すべて `Web font`）。非同期化すると CLS が悪化し、受入条件「CLS が S0 より悪化していない」に反する。
   両立には `display=optional` への変更か自前配信が要るが、どちらも
   **初回訪問者に見せる書体が変わる**ので、見た目の判断として運営者へ回した
   （`docs/performance-report.md` §6、下の OWNER ACTION 3）。

4. **性能目標 3 つは未達。達成と書かない。**
   Performance 53（目標 80）/ LCP 11.06s（目標 4.0s）/ CLS 0.217（目標 0.10）。
   バイト予算（全科目 250,000 未満・理科 200,000 未満）は達成。

### S6 で決めたこと

1. **コミットを 2 つに分けず 1 つにした（指示書 §35 からの逸脱）。**
   指示書は「ストア」と「週次＋JSON 入出力」を分ける想定だが、`/progress/` の画面は
   ストア無しでは空で、ストアは画面無しでは操作できない。片方だけのコミットは
   単独でテストを通せないので、1 つにまとめた。

2. **操作部品は科目ごとの描画コードへ書かず、後から差し込む形にした。**
   ルートは描き直されるたびに HTML が作り直される。`assets/js/subject-<科目>.js` 5 本へ
   同じ操作部品を書くと必ずずれるので、`assets/js/progress-control.js` が
   `.climb-node[data-book-id]` を見つけて差し込み、`MutationObserver` で描き直しに追従する。

3. **e2e に `waitForApp()` を広げた。**
   `flows.spec.mjs` と `privacy.spec.mjs` も `domcontentloaded` の直後に科目アプリを
   操作していた。データが同期スクリプトだった頃はそれで確定していたが、いまは fetch のあと。
   並行実行の負荷が高いときに落ちた（実際に 1 件）。**測る時点を正した**だけで、
   検査の中身は緩めていない。そのあと 3 回連続で 240 件 pass。

4. **進捗に解析イベントを足さなかった。**
   指示書 §4.2 が「進捗・追加回答・インポート内容は端末内だけ」としているので、
   `docs/analytics-events.md` と `EVENTS` は触っていない。

### S7 で決めたこと

1. **「苦手分野」と「学校教材との重複」は質問しない（指示書 §37 の表から 2 行を落とした）。**
   どちらも「人手で確かめた対応表がある場合だけ」という条件付きだったが、
   その対応表がリポジトリに無い。分野名から教材を機械的に結び付けると推測になり、
   「難易度や適性を推測しない」に反する。**質問を出さない**方を選んだ。
   対応表を人が作って `build/data/` へ置いたときに足せる形にしてある。

2. **スキップ時の一致を fixture ではなく実物の突き合わせで固定した。**
   `e2e/refine.spec.mjs` の「追加質問を開かなければ、結果も共有 URL も変わらない」は、
   `refine.js` を読み込まない状態（＝改修前）と読み込んだ状態で同じ診断を通し、
   結果 HTML と共有 URL・表示名を突き合わせる。固定値を書くより強い。
   書影の読み込み状態（`img` と `.bcov` の `ok` / `fb`）だけは比較から外している
   （中身ではなく読み込みの進み具合なので、比べると環境で落ちる）。

3. **移行で入っていた回帰を 1 件見つけて直した。**
   `covLoad` / `covErr` が `img.closest(".bcov")` を null 検査していなかった。
   起動前に届いた画像イベントを `RT_SUBJECT_FLUSH` があとから流すと、
   そのときには図鑑が描き直されていて `closest` が null を返す。
   null を確かめる形にし、画像の読み込み結果は溜めない（`NO_QUEUE`）ようにした。

### 事実確認済みの前提（作業開始時に実測した）

- 総冊数 1,390。科目別 english 252 / japanese 192 / math 162 / science 373 / social 293 / joho 29 / shoron 89。
- `npm test` は build 後に 253 件 pass / fail 0 / skipped 0。
- `affiliateEnabled()` / `amazonEnabled()` はどちらも現在 `true`。
  科目 HTML から `CONFIG` を外すと黙って `false` になる（指示書 §3.4）。S2 でテストを先に置く。
- Best Practices 77 で落ちている audit は `third-party-cookies` と `inspector-issues` の 2 件。
