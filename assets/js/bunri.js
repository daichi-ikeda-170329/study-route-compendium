/**
 * 志望校モードで「文理・受験科目」を本人に確認するための共通部品。
 *
 * これまで、大学名だけを選ぶと文理が黙って決まっていた。数学は S.bunri の初期値
 * "bun" がそのまま使われ、東京大学とだけ入力した人に文系ルート（数III・C なし）を
 * 出していた。社会は学部が空のとき文系 2 科目コースを既定にしていた。
 * どちらも「入力していない条件を、入力したかのように使う」ことになる。
 *
 * ここでの方針。
 *
 *   1. 学部名の正規表現は **候補の提示にだけ** 使う。最終確定はしない。
 *   2. 曖昧な学部名（情報・環境・教育・国際・デザイン・総合 など）は、
 *      文理のどちらにも実在するので推定そのものを出さない。
 *   3. 本人が選ぶまでルートを出さない。「まだ分からない」も選べるようにし、
 *      そのときは単一のルートを断定せず、両方の違いを見せる。
 *   4. 大学・学部・入試方式で必要科目は変わる。公式募集要項の確認を必ず添える。
 *
 * ブラウザから直接 <script> で読む。フレームワークは使わない。
 */
(function (root) {
  "use strict";

  /* 学部名から理系・文系を推す手がかり。**確定には使わない**（候補の提示だけ） */
  var RI_HINT = /理|工|農|薬|医|歯|看護|保健|情報理工|数理|物理|化学|生物|地球|建築|機械|電気|土木|航空|船舶|材料|応用科学|生命|食品|水産|林|畜産/;
  var BUN_HINT = /文|法|経済|経営|商|政治|心理|人文|哲学|史学|英文|独文|仏文|外国語/;

  /**
   * 文理のどちらにも実在する学部名。名前だけでは決まらないので推定を出さない。
   * ここを緩めると「情報学部だから理系」と黙って決めるのと同じことになる。
   */
  var AMBIGUOUS = /情報|環境|教育|国際|デザイン|総合|人間|生活|スポーツ|健康|社会|地域|観光|福祉|コミュニケーション|メディア|文化|創造|現代|グローバル|データ|システム/;

  /**
   * 学部名から文理の **候補** を返す。
   * @returns {{bunri: ("ri"|"bun"|null), reason: string}}
   *   bunri が null なら推定を出さない（利用者に選んでもらう）
   */
  function suggest(fac) {
    var f = String(fac == null ? "" : fac).trim();
    if (!f) return { bunri: null, reason: "学部・学科が未入力です" };
    if (AMBIGUOUS.test(f)) {
      return { bunri: null, reason: "「" + f + "」は文系・理系のどちらにも設置されている名称です" };
    }
    if (RI_HINT.test(f)) return { bunri: "ri", reason: "学部名から理系と推定しました" };
    if (BUN_HINT.test(f)) return { bunri: "bun", reason: "学部名から文系と推定しました" };
    return { bunri: null, reason: "「" + f + "」からは文系・理系を判断できませんでした" };
  }

  /** 大学・学部・方式で必要科目が変わることの注記。表示する場所すべてで同じ文にする */
  var OFFICIAL_NOTE =
    "大学・学部・入試方式によって必要科目は異なります。出願時は公式募集要項を確認してください。";

  /** 科目ごとの問いの立て方。文理そのものを聞く科目と、受験タイプを聞く科目がある */
  var KINDS = {
    bunri: {
      q: "受験科目は",
      opts: [
        { v: "bun", b: "文系（数III・Cなし）", s: "二次・個別試験で数III・Cを使わない" },
        { v: "ri", b: "理系（数III・Cあり）", s: "二次・個別試験で数III・Cを使う" }
      ],
      diff: "文系ルートは数I・A・II・B・C までで組み、理系ルートは数III・C の演習まで含みます。"
        + "同じ大学でも学部・方式によって数III・C の要否が変わるため、募集要項の出題範囲欄で確認してください。"
    },
    course: {
      q: "受験する区分は",
      opts: [
        { v: "bun", b: "文系", s: "文系学部として受験する" },
        { v: "ri", b: "理系", s: "理系学部として受験する" }
      ],
      diff: "文系と理系では、個別試験で課される科目そのものが変わります。"
        + "同じ大学でも学部・方式によって異なるため、募集要項の試験科目欄で確認してください。"
    },
    examtype: {
      q: "個別試験の形式は",
      opts: [
        { v: "bun", b: "記述中心", s: "和訳・内容説明・英作文などの記述がある" },
        { v: "ri", b: "マーク中心", s: "マーク式・共テ利用が中心で記述はほぼ無い" }
      ],
      diff: "記述中心の大学では和訳・要約・英作文の演習を、マーク中心の大学では速読と語彙・文法の処理速度を厚くします。"
        + "国公立でもマーク中心の方式、私立でも記述の多い方式があるため、募集要項の出題形式で確認してください。"
    }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /**
   * 確認ブロックの HTML を返す。
   *
   * @param {object} o
   *   kind      "bunri" | "course" | "examtype"
   *   suggested "ri" | "bun" | null   学部名からの推定（あくまで候補）
   *   reason    推定の根拠、または推定できなかった理由
   *   handler   選択時に呼ぶ関数名（グローバル）。引数に "bun" / "ri" / "unknown" を渡す
   *   picked    すでに選ばれている値。"unknown" なら違いの説明を開く
   */
  function promptHTML(o) {
    var k = KINDS[o.kind] || KINDS.bunri;
    var h = o.handler;
    var lead = o.suggested
      ? esc(o.reason) + "。" + k.q + "「" + esc(labelOf(k, o.suggested)) + "」で合っていますか？"
      : esc(o.reason) + "。" + k.q + "どちらですか？";

    var btns = k.opts.map(function (op) {
      var on = o.picked === op.v ? " on" : "";
      var hint = o.suggested === op.v ? '<em class="bnr-hint">推定</em>' : "";
      return '<button type="button" class="bnr-opt' + on + '" aria-pressed="' + (o.picked === op.v) + '"'
        + ' onclick="' + esc(h) + '(\'' + op.v + '\')">'
        + "<b>" + esc(op.b) + "</b>" + hint + "<span>" + esc(op.s) + "</span></button>";
    }).join("");

    var unknownOn = o.picked === "unknown" ? " on" : "";
    var unknown = '<button type="button" class="bnr-opt bnr-opt--unknown' + unknownOn + '"'
      + ' aria-pressed="' + (o.picked === "unknown") + '"'
      + ' onclick="' + esc(h) + '(\'unknown\')"><b>まだ分からない</b><span>違いを見て決めたい</span></button>';

    var body = o.picked === "unknown"
      ? '<div class="bnr-diff" role="note"><p>' + esc(k.diff) + "</p>"
        + "<p>どちらか一方を当サイトが決めることはしません。上の 2 つから選ぶと、その前提でのルートを表示します。</p></div>"
      : "";

    return '<div class="bnr" role="group" aria-label="受験科目の確認">'
      + '<p class="bnr-lead">' + lead + "</p>"
      + '<div class="bnr-opts">' + btns + unknown + "</div>"
      + body
      + '<p class="bnr-note">' + esc(OFFICIAL_NOTE) + "</p>"
      + "</div>";
  }

  function labelOf(k, v) {
    for (var i = 0; i < k.opts.length; i++) if (k.opts[i].v === v) return k.opts[i].b;
    return v;
  }

  root.RTBunri = {
    suggest: suggest,
    promptHTML: promptHTML,
    OFFICIAL_NOTE: OFFICIAL_NOTE,
    KINDS: KINDS,
    /* テストから正規表現そのものを確かめられるようにする */
    __test: { RI_HINT: RI_HINT, BUN_HINT: BUN_HINT, AMBIGUOUS: AMBIGUOUS }
  };

  /* Node からも読めるようにする（テスト用）。ブラウザでは module が無いので何もしない */
  if (typeof module === "object" && module.exports) module.exports = root.RTBunri;
})(typeof globalThis !== "undefined" ? globalThis : this);
