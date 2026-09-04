# KPI の取り込み手順

`docs/kpi-plan.md` の基準値欄を埋めるための手順。
**この作業は運営者にしかできない。** Search Console・GA4・AdSense の管理画面へ
入る権限が要るためで、コード側からは取りに行けない。

---

## 1. 何を取り込むか

**管理画面から出した集計 CSV だけ。**

| サービス | 取る場所 | 取る値 |
|---|---|---|
| Google Search Console | 検索パフォーマンス → 日付で 28 日間 → エクスポート | クリック数 / 表示回数 / CTR / 平均掲載順位 |
| Google アナリティクス 4 | レポート → エンゲージメント → 28 日間 | セッション / エンゲージメント率 / アクティブユーザー |
| Google AdSense | レポート → 28 日間 | ページビュー / 推定収益額 / ページ RPM |

**3 つとも同じ 28 日間にそろえる。** 期間が違う数字を並べても比べられない。

## 2. 取り込んではいけないもの

`build/import-kpi.mjs` は、次の列が 1 つでも入っていたら**そのファイルをまるごと落とす。**

```
ユーザー ID / client ID / IP アドレス / メールアドレス
検索クエリ（query・検索語・Landing page + query string）
デバイス ID / 広告 ID（IDFA・GAID）
市区町村 / 緯度・経度
```

- **検索クエリ**を外すのは、個人名や志望校を含む語がそのまま残ることがあるため。
- **市区町村・緯度経度**を外すのは、利用者の少ない地域では個人の特定につながるため。

一覧の正本は `build/data/kpi-schema.json` の `rejectColumns`。

## 3. 手順

```bash
# 1. 入力を置く場所を作る（.gitignore 済み。リポジトリにも公開物にも入らない）
mkdir -p private/kpi-input

# 2. 管理画面から出した CSV を置く（ファイル名は自由。拡張子は .csv）
#    例: private/kpi-input/search-console.csv
#        private/kpi-input/ga4.csv
#        private/kpi-input/adsense.csv

# 3. 取り込む。期間を必ず渡す
npm run import:kpi -- --start=2026-08-08 --end=2026-09-04

# 4. 結果を確かめる
cat docs/kpi-baseline.json
cat docs/kpi-baseline.md
```

終了コードの意味。

| コード | 意味 |
|---|---|
| 0 | 1 つ以上のファイルを取り込めた |
| 1 | ファイルはあったが、1 つも取り込めなかった |
| 2 | **未実施。** 入力の置き場所が無いか、CSV が 1 つも無い |

**2 を「取り込んだ」と読まない。**

## 4. 読めなかった値は `null` のまま

**0 で埋めない。** 「0 だった」と「分からなかった」を同じ形にすると、
あとから区別できなくなる。読めなかった理由は `notes` に残る。

範囲の検査に落ちた値も `null` にする（推測で直さない）。

```
負数 / 整数であるべき所に小数 / CTR が 1 を超える / 掲載順位が 1 未満
1 つの列に値が 2 行以上ある（合計値の CSV を出し直す）
```

## 5. 生の CSV を残さない

- 入力の `private/` は `.gitignore` に入っている。
- 出力は集計値だけで、`docs/` へ書く。`docs/` は `build/build-public.mjs` の
  `FORBIDDEN_PATH` に入っているので `dist/` へは出ない。
- **取り込みが終わったら `private/kpi-input/` の CSV は消してよい。**
  必要な数字は `docs/kpi-baseline.json` に入っている。

## 6. 値が入ったあと

`docs/kpi-plan.md` の基準値欄へ、`docs/kpi-baseline.md` の数字を写す。
**写すときも推測で埋めない。** `—` のままの指標は `—` のままにする。

## 7. いまの状態

**実数は 1 つも入っていない。** `docs/kpi-baseline.json` はすべて `null` の雛形で、
`docs/kpi-baseline.example.json` は形を示すための例。
取込の仕組み（`build/import-kpi.mjs` / `build/data/kpi-schema.json` / この手順書 /
雛形）はできているが、**数字を入れるには管理画面の権限が要る**ので、
そこだけが運営者の作業として残っている。
