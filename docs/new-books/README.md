# 新刊候補の置き場

`build/fetch-new-books.mjs` が週次で書き出す。設計は [new-books-plan.md](../new-books-plan.md)。

| ファイル | 中身 |
|---|---|
| `YYYY-Www.md` | その週に見つけた新刊候補の一覧 |
| `seen.json` | 一度候補に出した ISBN。掲載しないと決めた本が毎週出続けないための記録 |

**このディレクトリのファイルは掲載の記録ではない。** 掲載を決めた本は
`build/data/new-books.json` に足す。候補ファイルを消しても掲載には影響しない。
