/**
 * 科目トップの app JS（assets/js/subject-<科目>.js）から、必要な名前を拾う。
 *
 * ## いま何に使っているか
 *
 * `build/generate-subject-assets.mjs` が、HTML の `onclick="go('catalog')"` などから
 * 呼ばれる名前の一覧を作るために使う。データが届く前に押されたときの受け皿
 * （呼び出しを覚えておくだけの関数）を、その一覧から組み立てる。
 *
 * ## もとは何だったか
 *
 * 2026-09-05 まで、ここには科目 HTML のインライン `<script>` を「データ定数」と
 * 「描画コード」へ切り分ける機能もあった。7 科目すべてを移し終えたので削除した。
 * 中身は commit 9d4f6a85〜7f596b06 に残っている。
 *
 * そのとき分かった落とし穴を、名前を拾う側の理由として残しておく。
 *
 *   - 描画コードを関数で包むと、トップレベルの `function` が window から見えなくなる。
 *     HTML のインライン属性がそれらを呼ぶので、載せ直す必要がある。
 *   - `var X = (typeof X !== "undefined" && X) || {no-op}` という防御の書き方は、
 *     関数で包むと **必ず no-op を選ぶ**（`var` が関数スコープになるため）。
 *     共有・診断・学習ペースが例外も出さずに死ぬので、window から橋渡しする。
 */

/** app 側から window へ載せ直す、関数以外の名前。あるものだけ載せる */
export const EXPOSED_STATE = ['S', 'QUIZ', 'SENSEIS', 'SUBJ', 'SUBJ_KEYS', 'OTHER_SUBJECTS'];

/** 行頭の `function NAME(` をすべて拾う。HTML の onclick から呼ばれる */
export function topLevelFunctions(code) {
  return [...new Set([...code.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]))];
}

/** 行頭の `const|let|var NAME` をすべて拾う（window へ載せ直す候補の判定に使う） */
export function topLevelBindings(code) {
  return new Set([...code.matchAll(/^(?:const|let|var) ([A-Za-z_$][\w$]*)\b/gm)].map(m => m[1]));
}

/**
 * `var X = (typeof X !== "undefined" && X) || { …no-op… };` という防御の書き方を拾う。
 *
 * 科目トップは共通スクリプト（assets/js/share.js・pace.js）が読めなかったときに
 * 画面が落ちないよう、この形で受け皿を用意している。グローバル直下に書いてあるうちは
 * `typeof X` が既に読み込まれた本物を指すので問題ない。
 *
 * **ところが関数で包むと `var X` が関数スコープになり、入口では必ず undefined になる。**
 * すると条件が常に偽になり、**本物ではなく no-op スタブが選ばれる**。
 * 例外も警告も出ないまま、共有 URL の生成・診断の復元・学習ペースの表示が黙って死ぬ
 * （2026-09-05 の math の移行で実際に起きた。test/share.test.mjs が捕まえた）。
 *
 * そこで包む前に window から橋渡しして、元と同じ意味に戻す。
 */
export function bridgedGlobals(code) {
  return [...new Set(
    [...code.matchAll(/^var ([A-Za-z_$][\w$]*) = \(typeof \1 !== ["']undefined["']/gm)].map(m => m[1]),
  )];
}
