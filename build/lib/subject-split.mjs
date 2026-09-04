/**
 * 科目トップの単一 HTML から、データ定数と app JS を切り分ける。
 *
 * 科目ページはビルド工程を持たない単一 HTML で、データも描画コードも 1 つの
 * `<script>` に入っている（理科で 815KB）。これが HTML の解析を止めるので、
 * LCP が 10 秒台になっていた。
 *
 * ここでは**文字列として機械的に切り分ける**だけで、コードの中身は書き換えない。
 * 手で写すと必ず取りこぼすので、変換は必ずこのモジュール経由で行う。
 *
 * ## 切り分けの規則
 *
 * データ定数は 7 科目すべてで**行頭の `const NAME =`** として書かれている
 * （各科目の index.html を rg で走査して確認した）。
 * 行頭から、文字列・テンプレート・コメントを避けつつ括弧の対応を数えて、
 * 深さ 0 の `;` までを 1 つの宣言として取り出す。
 *
 * ## app JS の包み方
 *
 * 取り出した残りを `window.RT_SUBJECT_APP = function (DATA) { … }` で包む。
 * **中身の順序も内容も変えない。** 変えるのは「いつ走るか」だけで、
 * データが届いてから走るようになる。
 *
 * 包むとトップレベルの `function` が window から見えなくなるので、
 * 末尾で明示的に載せ直す。HTML の `onclick="go('catalog')"` などが
 * これらを呼んでいる（全 7 科目で、属性から呼ばれる名前がすべて行頭の
 * `function NAME(` 宣言に対応していることを確認済み）。
 */

/** 外へ出すデータ定数。UNI_RAW は UNIS の圧縮表現で、展開後だけを持つ */
export const DATA_CONSTS = ['CONFIG', 'STAGES', 'ROUTES', 'BOOKS', 'UNI_RAW', 'UNIS', 'TIERS', 'GUIDES'];

/** app 側から window へ載せ直す、関数以外の名前。あるものだけ載せる */
export const EXPOSED_STATE = ['S', 'QUIZ', 'SENSEIS', 'SUBJ', 'SUBJ_KEYS', 'OTHER_SUBJECTS'];

/** インライン `<script>`（src 付き・JSON-LD を除く）を位置つきで拾う */
export function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ start: m.index, end: m.index + m[0].length, open: m[0].slice(0, m[0].indexOf('>') + 1), code: m[1] });
  }
  return out;
}

/**
 * `const NAME = …;` の終わりを返す。
 * 文字列・テンプレートリテラル・コメントの中の括弧と `;` は数えない。
 * @returns {number} `;` の次の位置
 */
export function statementEnd(src, from) {
  let depth = 0;
  let i = from;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return i + 1;
    i++;
  }
  throw new Error(`宣言の終わりが見つからない（${from} から）`);
}

/**
 * 主データの `<script>` から、データ宣言と app コードを切り分ける。
 * @param {string} code `<script>` の中身
 */
export function splitScript(code) {
  const cuts = [];
  for (const name of DATA_CONSTS) {
    const re = new RegExp(`^const ${name}\\b`, 'gm');
    let m;
    while ((m = re.exec(code))) {
      cuts.push({ name, start: m.index, end: statementEnd(code, m.index) });
    }
  }

  // 新刊の注入区間。データ側（books.json）へ移るので app からは外す
  const BEGIN = '/* NEW BOOKS — 自動生成。build/apply-new-books.mjs が書き換える。手で編集しない */';
  const END = '/* /NEW BOOKS */';
  const b = code.indexOf(BEGIN);
  if (b >= 0) {
    const e = code.indexOf(END, b);
    if (e < 0) throw new Error('NEW BOOKS の終端マーカーが無い');
    cuts.push({ name: 'NEW_BOOKS', start: b, end: e + END.length });
  }

  cuts.sort((x, y) => x.start - y.start);
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i].start < cuts[i - 1].end) {
      throw new Error(`宣言の範囲が重なっている: ${cuts[i - 1].name} と ${cuts[i].name}`);
    }
  }

  let app = '';
  let last = 0;
  for (const c of cuts) {
    app += code.slice(last, c.start);
    last = c.end;
  }
  app += code.slice(last);

  return { cuts, app };
}

/** 行頭の `function NAME(` をすべて拾う。HTML の onclick から呼ばれる */
export function topLevelFunctions(code) {
  return [...new Set([...code.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]))];
}

/** 行頭の `const|let|var NAME` をすべて拾う（window へ載せ直す候補の判定に使う） */
export function topLevelBindings(code) {
  return new Set([...code.matchAll(/^(?:const|let|var) ([A-Za-z_$][\w$]*)\b/gm)].map(m => m[1]));
}

/**
 * app コードを外部ファイルの中身に仕立てる。
 * @param {string} dir 科目ディレクトリ名
 * @param {string} app splitScript() が返した app コード
 */
export function buildAppFile(dir, app) {
  const fns = topLevelFunctions(app);
  const bindings = topLevelBindings(app);
  const state = EXPOSED_STATE.filter(n => bindings.has(n));

  // 「公開前にここだけ書き換えてください」の案内は、CONFIG が JSON へ移った時点で嘘になる
  const cleaned = app.replace(
    /\/\* =+\n\s*★★★ 設定 — 公開前にここだけ書き換えてください ★★★\n\s*=+ \*\/\n?/,
    '/* 設定（CONFIG）は data/subjects/' + dir + '/config.json が正本。\n'
    + '   ここでは DATA.config として受け取る。 */\n');

  // function 宣言は巻き上げ済みなので、本体より先に載せられる。
  // 本体の途中で例外が出ても onclick が死なないよう、**先に**載せる。
  const exposeFns = fns.map(n => `window.${n} = ${n};`).join(' ');
  // const / let は巻き上げの対象外（一時的死角）なので、本体のあとで載せる
  const exposeState = state
    .map(n => `  try { window.${n} = ${n}; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }`)
    .join('\n');

  return `/**
 * ${dir} 科目トップの描画・操作コード。**手で編集してよい。**
 *
 * もとは ${dir}/index.html のインライン <script> にデータごと入っていた。
 * インラインのままだと HTML の解析が止まり、理科では LCP が 10 秒台になっていた。
 * build/migrate-subject.mjs が、中身を書き換えずにここへ切り出した。
 *
 * データ（BOOKS / UNIS / TIERS / ROUTES / GUIDES / STAGES / CONFIG）はここには無い。
 * 正本は data/subjects/${dir}/ で、配信用は assets/generated/subjects/${dir}.*.json。
 * assets/js/subject-loader.js が取得して RT_SUBJECT_APP(DATA) を呼ぶ。
 *
 * **トップレベルの function は window へ載せ直している。**
 * HTML の onclick="go('catalog')" などがこれらを呼ぶため。
 */
window.RT_SUBJECT_APP = function (DATA) {
var CONFIG = DATA.config;
var STAGES = DATA.stages;
var ROUTES = DATA.routes;
var TIERS  = DATA.tiers;
var GUIDES = DATA.guides;
var UNIS   = DATA.unis;
var BOOKS  = DATA.books;

/* HTML のインライン属性（onclick="go('catalog')" など）から呼ばれる名前を window へ載せ直す。
   function 宣言は巻き上げ済みなので本体より先に載せられる。本体の途中で例外が出ても
   画面の操作が死なないよう、あえてここで載せる。以下は自動生成。 */
${exposeFns}

${cleaned}
/* 状態を持つ束縛は本体のあとで載せる（const / let は巻き上げの対象外のため）。自動生成 */
${exposeState}
};
`;
}
