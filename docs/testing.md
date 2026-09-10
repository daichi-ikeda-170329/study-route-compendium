# テスト

> 2026-09-11 に README から移した（README を概要と入口だけにするため。改修仕様書 5.1）。「科目トップの比較子は単一 HTML で import できないので書き写してある」という記述を、現在の置き場（`assets/js/subject-<科目>.js`）に直した。

## テスト

```bash
npm ci
npm run check:data       # ISBN・id・確認状態（生成の前の関門）
npm test                 # ユニットテスト（test/*.test.mjs をすべて）
npm run check:site       # データと出力 HTML の検査
npm run build            # 生成
git diff --exit-code     # 生成物が最新か
npm run test:e2e         # E2E とアクセシビリティ（320/375/768/1366px）
npm run check:counts     # 収録冊数
npm run check:search-style  # 検索ボックスの CSS が全ページへ配られているか
```

**E2E は HTTP 経由で走る**（`build/serve.mjs` が静的配信する）。`file://` で開いた
確認は、絶対パスのリンクと localStorage の扱いが本番と違うので、確かめたことに
ならない。ブラウザは `npx playwright install chromium` で入れる。

テストと `check-site.mjs`・`prerender-tops.mjs` は Node 標準だけで動く。`gen-ogp.mjs --check`
だけが依存パッケージを使うので、CI では先に `npm ci` を流している。すべて
`.github/workflows/test.yml` が push のたびに流す。

| ファイル | 見ているもの | 流すべきとき |
|---|---|---|
| `test/share.test.mjs` | 診断結果の共有 URL の往復・不正な URL・保存データ・ルート共有の `encode`/`apply`・X の投稿画面に渡す `text=` の書式 | `QUIZ` を変えた / 科目トップのルート画面を触った / 共有の文面を変えた |
| `test/search.test.mjs` | 索引の中身・正規化・あだ名で引けること・`aliases.json` の実在確認 | `BOOKS` を変えた / `aliases.json` を触った（先に `generate-search.mjs` を流す） |
| `test/pace.test.mjs` | 日程の計算（分野の等分・仕上げの後置・端数の切り上げ） | `pace.js` を触った |
| `test/mobile-layout.test.mjs` | 科目トップが狭い画面で崩れる書き方に戻っていないか（タブバー・デスクトップナビが `button` と `a` を同じ規則で整えているか・`.tabbar` が列数を決め打ちしていないか・`a` と `img` の既定値を打ち消しているか・`.opt-fields` の子に `min-width:0` があるか） | 科目トップの CSS・タブバー・ナビの項目を触った |
| `test/style-guide.test.mjs` | `docs/style-guide.md` 2 節の禁止語と `build/lib/words.mjs` が一致していること・機械で見ない語に条文の理由があること・`BANNED_ALLOW` が書名で代替できるものを持たないこと | スタイルガイドの語を増減した / `build/lib/words.mjs` を触った |
| `test/new-books.test.mjs` | 注入マーカーの往復・難易度を持たない本の描画・科目トップ全枚に分岐が入っていること・**難易度順の比較子（`assets/js/subject-common.js` を実際に動かし、`build/lib/rank.mjs` が同じ関数であることを `===` で確かめる）**・F 型の本文・調査先の出版社名 | 新刊まわりを触った / 科目トップの図鑑・モーダルを触った / 並べ替えを触った |
| `build/check-site.mjs` | データと出力 HTML の全件検査（下の表を参照） | 何かを変えたら毎回 |
| `build/prerender-tops.mjs --check` | 科目トップに静的化した中身がデータとずれていないか | `BOOKS` / `ROUTES` / `GUIDES` を触った |
| `build/gen-ogp.mjs --check` | OGP 画像がデータとずれていないか（冊数・書名・役割・難易度・到達目安） | `BOOKS` を触った |

### `build/check-site.mjs` が見ているもの

**ずれていれば終了コード 1 で落ちる。** 誇張語だけは警告として出し、落とさない
（書き換えるかどうかは人が決めるため）。

| 分類 | 内容 |
|---|---|
| データ | 必須フィールド・ISBN-13 のチェックディジット・難易度が 1〜10 の整数・`STAGES` に無い役割・`build/lib/flow.mjs` の接続表の穴 |
| 想定学習時間 | `hours` が `/methodology/` に書いた 4 つの書き方（総時間・ペース・参照・定期購読）のどれかであること・ペースと参照が役割と合っていること・代表値 `h` と桁が食い違っていないこと |
| 文章 | ハングル / キリル文字 / 想定外のギリシャ文字 / **JIS X 0208・0213 に無い CJK 文字（簡体字）** の混入、`docs/style-guide.md` の禁止語（警告。**収録している全書籍の書名を取り除いてから探す**ので、他書の書名の引用では鳴らない）、「本アプリ」などの禁止表現 |
| HTML | h1 が 1 つ・見出しの階層が飛んでいない・全ページに 7 科目のナビ・信頼性ページ 6 つへのリンク・Amazon アソシエイトの必須表記・title 60 字以内・meta description 120 字以内・canonical・`img` の alt・入力欄の名前（`label for` か `aria-label`）・JSON-LD が妥当な JSON・内部リンク切れ・書籍ページの最終更新日 |
| OGP | `og:image` / `twitter:image` が指すファイルが実在すること・書籍ページがその本の OGP を指していること |
| 重複 | 書籍ページの半数以上に同じ段落が出ていないか（全冊共通の定型文の再発防止） |
| 孤立 | どこからもリンクされていない書籍ページ・`sitemap.xml` への記載漏れ・`BOOKS` から外したのに残っているページ |
| 導線（2026-09-10〜） | 全ページに詳細検索（`/search/`）と学習の記録（`/progress/`）へのリンク（手書き HTML は `build/apply-footer.mjs` が入れる） |
| ルートの重複（2026-09-10〜） | 志望校別ルートで、同じ本編（`<ol>` 以下）を持つトラックの節が 2 つ以上並んでいないか（`build/lib/tracks.mjs` の `groupTracks` でまとめる） |
| 書名（2026-09-10〜） | カード・ルートの行・おすすめの行の書名要素に、内部略称の書名が単独で出ていないか（`build/lib/booktitle.mjs` の `displayName` を通す） |
| 大学ページの重複（2026-09-10〜） | 大学別ページの段落を「。」で文に分け、同じ文が 2 回出ていないか |

### 2026-09-10 の改修で足したテスト

| ファイル | 見ているもの |
|---|---|
| `test/route-tracks.test.mjs` | トラックの表示名・本編が同じトラックのまとめ方・ルートの始まり（「ここより前の段階」）・志望レベルの帯・冊数と想定時間 |
| `test/uni-picks.test.mjs` | 大学別ページのおすすめ（重点対策・トラック別・シリーズ・並び順）と、ページ内の同じ文の重複 |
| `test/display-name.test.mjs` | 読者に見せる書名（内部略称の判定・科目内で重ならないこと・配信データの `dn`） |
| `test/book-links.test.mjs` | 書籍ページの「あとに進む本」「同じ役割・同じレベル」の並び・見出しの順・比較ページへのリンク |
| `test/book-extras.test.mjs` | 書籍の任意項目（`pages` `media` `toc` `howto` `finish` `editions`）の検査と描画・「この本の前に置く本」 |
| `test/university-sources.test.mjs` | 大学の出典台帳の形・出典行と学部表・大学別 OGP・学部別ページの判定 |
| `test/footer.test.mjs` | フッターのリンク（`FOOTER_LINKS`）が手書き HTML と一致していること |
| `test/new-page.test.mjs` | `/new/` と `new-books.json` の一致・X の F 型の本文 |
| `test/readme.test.mjs` | README に廃止した仕組みの記述が残っていないこと・コマンドが `package.json` にあること |

簡体字の判定表は `build/data/jis-kanji.txt`。作り直し方は `build/check-site.mjs` の
コメントにコマンドごと書いてある。

診断は、科目ページから `QUIZ` を取り出し、到達しうる回答の組み合わせをすべて列挙して往復を確認する。あわせて不正な URL を 30 ケース以上、壊れた保存データの読み込みも検証する。

ルート共有の `encode` / `apply` は科目トップの描画コード側にあるので、`test/helpers.mjs` の `loadPage()` が `assets/js/subject-common.js` と `assets/js/subject-<科目>.js` をこの順に vm 上で走らせ（ブラウザと同じ順）、`RTShare` を差し替えて設定を受け取る。全科目・全志望レベルで `encode → apply → encode` が同じトークンに戻ること、実在しない値のトークンを拒むこと、大学名が `UNIS` と一致したときだけ志望校モードになることを確かめている。
