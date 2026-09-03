# 説明文のスナップショット

参考書の文章（`desc` / `bestFor` / `pros` / `cons`）を大きく書き換える前に、
その時点の内容をここへ置く。書き換え後に「元は何と書いてあったか」を、
科目 HTML の巨大な差分を追わずに読めるようにするためのもの。

| ファイル | 時点 | 内容 |
|---|---|---|
| `books-text-2026-09-03.json` | 2026-09-03 | スタイルガイド（`docs/style-guide.md`）に沿った全件書き換えの直前。1,390 冊分 |

2026-09-03 の書き換えで流し込んだ新しいテキストは `data/_rewrite/books-text-rewrite-2026-09-03.json`
にある（`build/apply-book-text.mjs` の入力）。

正本はあくまで各科目トップの `BOOKS` と git の履歴で、**ここのファイルは読むためだけに置く**。
生成スクリプトはこのディレクトリを一切参照しない。

作り直すときは次を流す。

```bash
node --input-type=module -e "
import fs from 'fs';
import {extractSubject, SUBJECTS} from './build/lib/extract.mjs';
const out = { _note: '説明文を書き換える前のスナップショット。', taken: new Date().toISOString().slice(0,10), subjects: {} };
let n = 0;
for (const s of SUBJECTS) {
  const d = extractSubject('.', s.dir);
  out.subjects[s.dir] = Object.fromEntries(d.books.map(b => {
    n++;
    return [b.id, { name: b.name, desc: b.desc ?? null, bestFor: b.bestFor ?? null, pros: b.pros ?? null, cons: b.cons ?? null }];
  }));
}
out._count = n;
fs.writeFileSync('data/_backup/books-text-' + out.taken + '.json', JSON.stringify(out, null, 1) + '\n');
console.log(n + ' 冊');"
```
