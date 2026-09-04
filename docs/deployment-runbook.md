# 配信の手順書（deployment runbook）

公開サイト（`https://route-taizen.com/`）と `main` の中身を一致させ続けるための手順。
**やっていないことを「やった」と書かない。** 確認は `npm run check:production` の出力を写す。

正本の分担:

| 内容 | 正本 |
|---|---|
| 手動設定の実施状況（Pages Source・Search Console・AdSense など） | `README.md` の「運営者が行う手動設定」 |
| 配信の切替・切り戻し・反映待ちの切り分け手順 | **この文書** |
| 公開状態の機械検査 | `build/check-production.mjs`（`npm run check:production`） |

---

## 1. 現在の配信構成（2026-09-05 時点で実測）

GitHub Pages の Source は **「GitHub Actions」**。`.github/workflows/pages.yml` が
`build/build-public.mjs` の作る `dist/` だけを artifact にして配信する。

```
$ npm run check:production
公開サイトを検査する: https://route-taizen.com
通過 19 / 不一致 0 / 未検査 0
公開サイトはリポジトリと一致している。
```

以前はリポジトリ直下がそのまま配信されていて、本番から `build/`・`test/`・
`data/_backup/`・`package.json` を取得できた。**その状態に戻っていないことを、
`/package.json` などが 404 であることで確かめている。**

> 実装指示書 §10 は「Pages の Source はまだ GitHub Actions ではない」を前提にしているが、
> 2026-09-04 に切り替わり、`README.md` と commit `dabdb86d` に反映済み。
> 指示書 §3 の「作業開始時に再測し、食い違ったら現行コードを正とする」に従い、
> 切替そのものは `OWNER ACTION` ではなく**完了済み**として扱う。

## 2. ふだんの反映

1. `main` へ push する。
2. Actions タブの「Pages 公開」が成功するのを待つ（build → deploy の 2 job）。
3. 反映まで通常 1〜2 分。CDN のキャッシュがあるので、体感はもう少しかかることがある。
4. `npm run check:production` を流す。

`pages.yml` の build job は、配信の前に次を全部通す。ここが赤いまま deploy されることはない。

- `node build/all.mjs` のあと `git diff --exit-code`（生成物がコミット済みと一致するか）
- `node build/build-public.mjs`
- `node --test test/dist.test.mjs`（公開してはいけないものが `dist/` に無いか）

## 3. 反映待ちと不具合を混同しない

「本番に出ていない」と思ったとき、**先にどちらかを切り分ける。**

### 3.1 deploy が終わっているか

Actions タブ →「Pages 公開」→ 最新の run。deploy job の `github-pages` environment に
`page_url` が出ていれば配信は済んでいる。**deploy が走っていないのに本番を見ても意味がない。**

`main` の SHA と、成功した run の SHA が同じであることを確かめる:

```bash
git rev-parse origin/main
gh run list --workflow="Pages 公開" --limit 5   # gh が使えるなら
```

### 3.2 キャッシュを掴んでいないか

GitHub Pages はレスポンスヘッダーを制御できない（`cache-control: max-age=600` が付く）。
**毎回違う query を付けて取り直す。**

```bash
curl -sS -D- -o /dev/null "https://route-taizen.com/?_pc=$(date +%s)"
```

`npm run check:production` はこれを自動でやり、`cache-control` と `age` も出す。
`age` が大きいときは CDN の古い応答を見ているので、数分おいて取り直す。

**`?_pc=` を付けた URL は canonical にも sitemap にも出さない。検査の中だけで使う。**

### 3.3 それでも出ないとき

`npm run check:production` の「不一致」の行を読む。
`/package.json が 404 — HTTP 200` が出ていたら Source が「Deploy from a branch」に
戻っている（下の 5 を見る）。

## 4. 切り替え直す手順（環境を作り直す場合）

一度きりの手順だが、環境を作り直すときのために残す。**順番を守る。**

1. `pages.yml` が入った状態で `main` へ push する。**この時点では配信先は変わらない。**
2. Actions タブで「Pages 公開」が**成功していること**を確かめる。
3. Settings → Pages → Build and deployment → Source を **GitHub Actions** に変える。
4. 数分後、`npm run check:production` が終了コード 0 で終わることを確かめる。

**2 を確かめる前に 3 をやらない。** workflow が失敗する状態で Source を変えると配信が止まる。

## 5. 切り戻し

配信が止まったときの緊急手段。

Settings → Pages → Build and deployment → Source を **Deploy from a branch**（`main` / `/`）に戻す。

**戻した瞬間からリポジトリ直下が全部公開される。** `build/`・`test/`・`data/_backup/`・
`package.json` が本番から取得できる状態になるので、**配信が止まっているとき以外は戻さない。**
戻したら `npm run check:production` が終了コード 1 で落ちる（それが正しい振る舞い）。

復旧したら 4 の手順で戻す。

## 6. 検査の使い分け

| コマンド | 何を見る | 必須ゲートか |
|---|---|---|
| `npm test`（`test/dist.test.mjs`） | `dist/` に公開してはいけないものが無いか | **必須**（`pages.yml` と `test.yml`） |
| `npm test`（`test/production-check.test.mjs`） | check-production 自体が旧構成を見分けられるか。localhost のみ | **必須** |
| `npm run check:production` | 公開サイトの実物 | **必須にしない**。手動と週次（`.github/workflows/production.yml`） |

`check:production` を必須ゲートにしないのは、ネットワークと CDN のキャッシュで
不安定になり、赤が常態化すると本当の不具合に気づけなくなるため。
代わりに `test/production-check.test.mjs` が「検査スクリプトが劣化していないこと」を
localhost だけで決定的に固定している。

終了コードは 3 つに分かれる。**2 を成功として扱わない。**

| コード | 意味 | すること |
|---|---|---|
| 0 | 一致している | 何もしない |
| 1 | 食い違っている | この文書の 3 と 5 |
| 2 | 未検査（届かなかった） | ネットワークのある環境で流し直す。**「確認済み」と書かない** |

## 7. 運営者しかできない作業（OWNER ACTION）

コードからは完結しない。実施状況の正本は `README.md` の「運営者が行う手動設定」。

- GitHub リポジトリの Description と Topics を実態に合わせる（`参考書1,052冊` が残っている）。
- Search Console でのサイトマップ送信。
- AdSense の自動広告の除外設定。
- CMP / Consent Mode の方針判断。
- ライセンスの選択、公開連絡先の用意。
