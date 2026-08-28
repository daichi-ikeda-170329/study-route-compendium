/**
 * ルート大全 — 3分診断の結果共有・保存
 *
 * 科目トップ（<科目>/index.html）から <script src> で読み込む共通スクリプト。
 * 5 科目で質問構成は違うが、この処理はすべて QUIZ 配列を入力に動くため科目ごとの分岐を持たない。
 *
 * 設計の要点
 *  - 共有 URL には「結果」ではなく「回答」を載せる。開いた側は現行ロジックで結果を再計算する。
 *    ロジックや収録書籍を更新しても、過去に共有された URL が古い結果を表示することがない。
 *  - スキーマは v で管理する。質問の追加・削除・選択肢の変更を行うときは SCHEMA_VERSION を上げる。
 *  - URL パラメータは信頼しない。ホワイトリスト検証に通らなければ部分復元せず全体をフォールバックする。
 *  - 画面に出す文字列は、検証を通った選択肢 ID から引いた内部定義のラベルだけ。
 *    URL やストレージ由来の文字列をそのまま DOM に入れることはしない。
 */
(function (global) {
  "use strict";

  /* ============================================================
     スキーマ定義
     ============================================================ */

  /**
   * 公式 X アカウントのハンドル（@ を除く）。共有ボタンの via= に使う。
   * build/lib/extract.mjs の X_HANDLE と手書き HTML にも同じ値がある。
   * 変えるときは `rg route_taizen` で全箇所を出す。
   */
  var X_HANDLE = "route_taizen";

  /**
   * X の投稿画面の URL。twitter.com/intent/tweet は x.com へ 301 で転送されるだけなので、
   * 現行の x.com/intent/post を直接叩く。転送を 1 回挟むと、スマホで X アプリが
   * 開くときに text= 等が落ちて「空の投稿画面が開く」ことがある。
   */
  var X_INTENT = "https://x.com/intent/post";

  /** X に載せる本文の末尾に付けるハッシュタグ行 */
  var X_TAGS = "#ルート大全 #大学受験";

  /**
   * X の投稿画面に渡す URL を組み立てる。
   *
   * 本文・共有 URL・ハッシュタグをすべて text= に入れて、改行の位置まで固定する。
   * intent の url= は本文の末尾に半角スペースで連結されるため、ハッシュタグと
   * リンクが同じ行に並んでしまう。押した人がそのまま投稿できる見た目にしたいので、
   * 連結はこちらで行う。
   *   本文
   *   （空行）
   *   共有 URL
   *   （空行）
   *   ハッシュタグ  ← この後ろに X が " via @route_taizen" を足す
   */
  function intentURL(body, url) {
    var text = String(body) + "\n\n" + String(url) + "\n\n" + X_TAGS;
    return X_INTENT + "?text=" + encodeURIComponent(text) + "&via=" + X_HANDLE;
  }

  /** 共有 URL のスキーマバージョン。質問構成を変えたら必ず上げる（README の運用ルール参照） */
  var SCHEMA_VERSION = 1;
  var PARAM_VERSION = "v";
  var PARAM_ANSWERS = "a";
  var SEP = ".";

  /**
   * 回答列トークンの書式。
   * 各質問につき 1 トークン。0 は「条件分岐により表示されなかった質問」、
   * 1 以上は「その質問の選択肢の 1 始まりインデックス」。
   * 先頭ゼロ（"01"）を弾いて、1 つの回答に対して URL が 1 通りに定まるようにしている。
   */
  var TOKENS_RE = /^(0|[1-9][0-9]?)(\.(0|[1-9][0-9]?))*$/;

  /**
   * ルート画面の共有 URL のスキーマ。
   *   ?rv=1&r=<トークン列>[&ru=<大学名>]
   *
   * 診断（v / a）が「回答」を載せるのに対し、こちらは「ルート画面の設定」を載せる。
   * トークンの意味は科目ごとに違う（理科は使う科目、社会は受験タイプを持つ）ので、
   * 組み立てと検証は科目ページ側の route.encode / route.apply が行い、
   * ここは「英数字と - _ だけ・8 個まで」という書式だけを保証する。
   *
   * 大学名（ru）だけは日本語を許す。UNIS に安定した ID が無く、配列の位置で指すと
   * 収録校を 1 校足しただけで別の大学を指してしまうため、名前で持って
   * 科目ページ側が UNIS と突き合わせる。一致しなければ志望レベルのルートへ落とす。
   */
  var ROUTE_VERSION = 1;
  var PARAM_ROUTE_VERSION = "rv";
  var PARAM_ROUTE = "r";
  var PARAM_ROUTE_UNI = "ru";
  var ROUTE_TOKENS_RE = /^[A-Za-z0-9_-]{1,24}(\.[A-Za-z0-9_-]{1,24}){0,7}$/;
  var ROUTE_UNI_MAX = 60;

  /** localStorage のキーとスキーマ */
  var STORE_KEY = "rt_saved_routes";
  var STORE_VERSION = 1;
  var STORE_LIMIT = 10;

  /** 保存項目に許可する科目 ID。未知の科目 ID を持つ項目は読み込み時に捨てる */
  var SUBJECTS = ["english", "japanese", "math", "science", "social"];

  /**
   * 保存項目 ID の書式。newId() が作るのは英数字だけなので、それ以外は受け付けない。
   * ID は HTML 属性値として書き出されるため、記号を許すと属性やスクリプトの文脈を
   * 抜け出す余地が生まれる。ここで文字種を絞って、その余地自体をなくしておく。
   */
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

  /* ============================================================
     純粋関数 — encode / decode
     DOM・location・localStorage に依存しない。test/share.test.mjs の対象。
     ============================================================ */

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  /**
   * 回答オブジェクトを回答列トークンに変換する。共有できない状態なら null を返す。
   *
   * cond は「自分より前の質問の回答」だけを見る前提で評価する（現行 5 科目の cond はすべてこの形）。
   * 前から順に積み上げた回答で評価するので、表示されない質問に紛れ込んだ古い回答は無視される。
   */
  function encodeTokens(quiz, ans) {
    if (!Array.isArray(quiz) || quiz.length === 0) return null;
    if (!ans || typeof ans !== "object") return null;
    var acc = {};
    var tokens = [];
    for (var i = 0; i < quiz.length; i++) {
      var q = quiz[i];
      if (!q || !Array.isArray(q.opts) || !q.key) return null;
      var shown;
      try {
        shown = !q.cond || !!q.cond(acc);
      } catch (e) {
        return null;
      }
      if (!shown) {
        tokens.push("0");
        continue;
      }
      var v = ans[q.key];
      var idx = -1;
      for (var j = 0; j < q.opts.length; j++) {
        if (q.opts[j].v === v) { idx = j; break; }
      }
      if (idx < 0) return null; /* 表示される質問が未回答。共有 URL を作れない */
      acc[q.key] = v;
      tokens.push(String(idx + 1));
    }
    return tokens.join(SEP);
  }

  /**
   * 回答オブジェクトを共有 URL のクエリ文字列（"?" を含まない）に変換する。
   * 共有できない状態なら null を返す。
   */
  function encodeAnswers(quiz, ans) {
    var tokens = encodeTokens(quiz, ans);
    if (tokens === null) return null;
    return PARAM_VERSION + "=" + SCHEMA_VERSION + "&" + PARAM_ANSWERS + "=" + tokens;
  }

  /**
   * クエリ文字列（または URLSearchParams）を検証つきで回答オブジェクトに復元する。
   *
   * 戻り値は {ok:true, ans} か {ok:false, reason}。
   * reason は原因調査用で、画面には出さない。
   *
   * 保証: 任意の quiz と、その quiz で encodeAnswers が文字列を返した ans について
   *       decodeAnswers(quiz, encodeAnswers(quiz, ans)).ans は
   *       ans のうち「表示される質問の回答」と完全に一致する。
   *       表示されない質問に残っていた回答は落ちるが、結果算出側はいずれの科目でも
   *       その値を条件つきでしか参照しないため、結果は手入力時と一致する。
   */
  function decodeAnswers(quiz, search) {
    if (!Array.isArray(quiz) || quiz.length === 0) return fail("quiz-undefined");

    var params;
    try {
      if (typeof URLSearchParams === "undefined") return fail("no-urlsearchparams");
      params = (search instanceof URLSearchParams) ? search : new URLSearchParams(String(search == null ? "" : search));
    } catch (e) {
      return fail("params-unparsable");
    }

    /* 同じパラメータが複数回現れる URL は、どれを採るかで結果が変わるので受け付けない */
    if (params.getAll(PARAM_VERSION).length !== 1) return fail("version-missing-or-duplicated");
    if (params.getAll(PARAM_ANSWERS).length !== 1) return fail("answers-missing-or-duplicated");
    if (params.get(PARAM_VERSION) !== String(SCHEMA_VERSION)) return fail("version-unsupported");

    var raw = params.get(PARAM_ANSWERS);
    if (!TOKENS_RE.test(raw)) return fail("answers-format");

    var tokens = raw.split(SEP);
    if (tokens.length !== quiz.length) return fail("answers-length");

    var ans = {};
    for (var i = 0; i < quiz.length; i++) {
      var q = quiz[i];
      if (!q || !Array.isArray(q.opts) || !q.key) return fail("quiz-malformed");
      var n = Number(tokens[i]);
      var shown;
      try {
        shown = !q.cond || !!q.cond(ans);
      } catch (e) {
        return fail("cond-threw");
      }
      if (!shown) {
        /* 表示されない質問に回答が入っている URL は改変とみなす */
        if (n !== 0) return fail("answers-cond-mismatch");
        continue;
      }
      if (!(n >= 1 && n <= q.opts.length)) return fail("answers-out-of-range");
      ans[q.key] = q.opts[n - 1].v;
    }
    return { ok: true, ans: ans };
  }

  /** 共有 URL を組み立てる。base は "https://route-taizen.com/english/" のような末尾スラッシュつきのページ URL */
  function buildShareURL(quiz, ans, base) {
    var qs = encodeAnswers(quiz, ans);
    if (qs === null) return null;
    return String(base).split("?")[0].split("#")[0] + "?" + qs;
  }

  /* ============================================================
     以下はブラウザ環境でのみ動く部分
     ============================================================ */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** GA4 が読み込まれているときだけイベントを送る。失敗しても診断の動作には影響させない */
  function track(name, params) {
    try {
      if (typeof global.gtag === "function") global.gtag("event", name, params || {});
    } catch (e) { /* 計測の失敗で機能を止めない */ }
  }

  /* ---------- localStorage ---------- */

  var storageChecked = false;
  var storageUsable = false;

  /**
   * localStorage が実際に書けるかを試して判定する。
   * プライベートブラウズや設定によっては、参照はできても setItem で例外が出る。
   */
  function storageOK() {
    if (storageChecked) return storageUsable;
    storageChecked = true;
    try {
      var k = "__rt_probe__";
      global.localStorage.setItem(k, "1");
      global.localStorage.removeItem(k);
      storageUsable = true;
    } catch (e) {
      storageUsable = false;
    }
    return storageUsable;
  }

  function emptyStore() {
    return { schemaVersion: STORE_VERSION, items: [] };
  }

  /** 保存項目として妥当か。1 つでも型が合わなければその項目だけ捨てる */
  function validItem(it) {
    return !!it && typeof it === "object"
      && typeof it.id === "string" && ID_RE.test(it.id)
      && typeof it.savedAt === "string" && it.savedAt.length <= 40
      && typeof it.subjectId === "string" && SUBJECTS.indexOf(it.subjectId) >= 0
      && typeof it.answers === "string" && TOKENS_RE.test(it.answers)
      && typeof it.label === "string" && it.label.length <= 120;
  }

  /**
   * 保存済みルートを読み込む。
   * パース失敗・スキーマ不一致・型不正はすべて「空」として扱い、画面が壊れないようにする。
   */
  function loadStore() {
    if (!storageOK()) return emptyStore();
    var raw;
    try {
      raw = global.localStorage.getItem(STORE_KEY);
    } catch (e) {
      return emptyStore();
    }
    if (!raw) return emptyStore();
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return emptyStore();
    }
    if (!data || typeof data !== "object" || data.schemaVersion !== STORE_VERSION || !Array.isArray(data.items)) {
      return emptyStore();
    }
    return { schemaVersion: STORE_VERSION, items: data.items.filter(validItem) };
  }

  function saveStore(store) {
    if (!storageOK()) return false;
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      return false; /* 容量超過など。保存できなかったことは呼び出し側で知らせる */
    }
  }

  /** 衝突しない程度に短い ID。暗号用途ではない */
  function newId() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 実行時の状態 ---------- */

  /** setup() で科目ページから受け取る設定 */
  var CFG = null;
  /** 現在表示している結果の共有情報。renderQuizResult が呼ばれるたびに afterResult() が更新する */
  var CURRENT = null;
  /** 共有 URL から復元して表示しているか */
  var restored = false;
  /** URL は付いていたが検証に通らなかったか */
  var linkFailed = false;
  /**
   * ルートの共有 URL から復元して表示しているときの、その URL が表していた設定。
   * 利用者が条件を変えたら値がずれるので、「共有されたルートを表示しています」の
   * 注記を出し続けるかどうかをこれで判定する。
   */
  var restoredRouteKey = null;

  function pageBase() {
    try {
      return global.location.origin + global.location.pathname;
    } catch (e) {
      return "";
    }
  }

  /** 共有・保存の見た目。5 科目に同じ CSS を配らずに済むよう、ここから 1 度だけ差し込む */
  var STYLE = [
    ".rt-share{margin-top:22px;padding:18px;border:1px solid var(--line);border-radius:var(--r-m);background:var(--surface-2)}",
    ".rt-share__head{font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--muted);margin-bottom:12px}",
    ".rt-share__btns{display:flex;flex-wrap:wrap;gap:10px}",
    ".rt-share__btns .btn{flex:1 1 160px;justify-content:center;padding:12px 16px;font-size:13.5px}",
    ".rt-share__note{margin-top:12px;font-size:11.5px;line-height:1.6;color:var(--muted-2)}",
    ".rt-share__box{margin-top:12px;width:100%;padding:10px;font-family:var(--mono);font-size:12px;border:1px solid var(--line-d);border-radius:var(--r-s);background:var(--surface)}",
    ".rt-notice{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;border:1px solid var(--line);border-left:3px solid var(--indigo);border-radius:var(--r-s);background:var(--indigo-soft);font-size:12.5px;line-height:1.6;color:var(--ink-2)}",
    ".rt-notice p{flex:1 1 200px;margin:0}",
    ".rt-notice__btn{flex:0 0 auto;padding:8px 14px;font-size:12.5px;font-weight:700;border:1px solid var(--line-d);border-radius:4px;background:var(--surface);color:var(--ink);cursor:pointer}",
    ".rt-notice--warn{border-left-color:var(--gold);background:var(--gold-soft)}",
    ".rt-saved{margin-bottom:20px;padding:16px;border:1px solid var(--line);border-radius:var(--r-m);background:var(--surface)}",
    ".rt-saved__head{font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--muted);margin-bottom:10px}",
    ".rt-saved__item{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line-2)}",
    ".rt-saved__item:first-of-type{border-top:0}",
    ".rt-saved__open{flex:1;text-align:left;background:none;border:0;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.5}",
    ".rt-saved__open small{display:block;font-size:11px;font-weight:600;color:var(--muted-2);letter-spacing:.04em}",
    ".rt-saved__del{flex:0 0 auto;min-height:44px;padding:6px 14px;font-size:11.5px;font-weight:700;color:var(--muted);background:var(--surface-3);border:1px solid var(--line);border-radius:4px;cursor:pointer}",
    ".rt-saved__open{min-height:44px}"
  ].join("\n");

  function injectStyle() {
    try {
      if (global.document.getElementById("rt-share-style")) return;
      var el = global.document.createElement("style");
      el.id = "rt-share-style";
      el.textContent = STYLE;
      global.document.head.appendChild(el);
    } catch (e) { /* head に触れない環境では見た目だけ素になる */ }
  }

  /* ---------- 画面に差し込む HTML ---------- */

  /**
   * 質問画面の先頭に差し込む。step が 0 のときだけ、
   * 壊れた共有リンクの注記と、保存済みルートの一覧を出す。
   */
  function beforeQuiz(step) {
    if (!CFG || step !== 0) return "";
    var html = "";
    if (linkFailed) {
      html += '<div class="rt-notice rt-notice--warn"><p>リンクの読み込みに失敗したため、最初から診断できます。</p></div>';
    }
    html += savedListHTML();
    /* 最初の質問まで戻ったら、共有リンク由来の表示状態は役目を終える。
       ここで落としておくと、ページ側から startQuiz() が直接呼ばれた場合でも
       「共有されたルートを表示しています」が自分の結果に残らない。 */
    restored = false;
    linkFailed = false;
    return html;
  }

  /** 結果画面の先頭に差し込む。共有 URL から復元して表示していることを伝える */
  function beforeResult() {
    if (!CFG || !restored) return "";
    return '<div class="rt-notice"><p>共有されたルートを表示しています。回答をやり直すと、あなた自身の結果に切り替わります。</p>'
      + '<button type="button" class="rt-notice__btn" onclick="RTShare.restart()">自分でも診断する</button></div>';
  }

  /**
   * 結果画面の末尾に差し込む共有・保存ブロック。
   *
   * opts に渡すラベルは、呼び出し元（renderQuizResult）が内部定義から組み立てた文字列であること。
   * URL やストレージ由来の文字列を渡してはいけない。
   *   opts.tier    志望レベルの表示名（TIERS[].name）
   *   opts.variant 科目・型などの補足ラベル（省略可）
   *   opts.policy  学習方針の表示名
   */
  function afterResult(opts) {
    if (!CFG) return "";
    opts = opts || {};
    var ans = CFG.state && CFG.state.ans;
    var url = buildShareURL(CFG.quiz, ans, pageBase());
    if (!url) { CURRENT = null; return ""; }

    var parts = [];
    if (opts.tier) parts.push(String(opts.tier));
    if (opts.variant) parts.push(String(opts.variant));
    if (opts.policy) parts.push(String(opts.policy));
    var label = CFG.subjectLabel + "：" + parts.join(" / ");

    CURRENT = {
      url: url,
      tokens: encodeTokens(CFG.quiz, ans),
      label: label
    };

    return shareBox({
      head: "SHARE &amp; SAVE — この結果を共有・保存する",
      url: url,
      label: label,
      tweet: "【ルート大全で診断】\n" + label + "のルートが出ました",
      save: true,
      note: "共有リンクに含まれるのは回答だけです。開いた人には、そのときの最新の診断ロジックで同じルートが表示されます。"
        + (storageOK() ? "保存はこの端末の中だけで行われ、外部には送信されません。" : "")
    });
  }

  /**
   * 共有ブロックの共通の見た目。
   *
   * 共有対象（URL と表示名）はブロックの data 属性に持たせる。診断結果とルート画面に
   * 同時に出るため、どちらを押したかはボタンからブロックをたどって決める。
   *   opts.head  見出し
   *   opts.url   共有 URL
   *   opts.label 表示名（X の本文と端末の共有シートに使う）
   *   opts.tweet X に載せる本文（共有 URL とハッシュタグは intentURL が足すので入れない）
   *   opts.save  「この結果を保存」を出すか（診断結果だけ）
   *   opts.note  下に出す注記
   */
  function shareBox(opts) {
    var xURL = intentURL(opts.tweet, opts.url);

    var canNative = false;
    try { canNative = typeof global.navigator.share === "function"; } catch (e) { canNative = false; }

    var btns = '<button type="button" class="btn btn-ghost" onclick="RTShare.copyLink(this)">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 9h10v10H9zM5 15H4V4h11v1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + 'リンクをコピー</button>';
    btns += '<a class="btn btn-ghost" href="' + esc(xURL) + '" target="_blank" rel="noopener noreferrer" onclick="RTShare.trackShareX()">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z"/></svg>'
      + 'Xで共有</a>';
    if (canNative) {
      btns += '<button type="button" class="btn btn-ghost" onclick="RTShare.shareNative(this)">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13M8 7l4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '共有</button>';
    }
    if (opts.save && storageOK()) {
      btns += '<button type="button" class="btn btn-ghost" onclick="RTShare.saveRoute(this)">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 3v6h7M8 20v-6h8v6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + 'この結果を保存</button>';
    }

    return '<div class="rt-share" data-rt-url="' + esc(opts.url) + '" data-rt-label="' + esc(opts.label) + '">'
      + '<div class="rt-share__head">' + opts.head + '</div>'
      + '<div class="rt-share__btns">' + btns + '</div>'
      + '<div class="rt-share__msg"></div>'
      + '<p class="rt-share__note">' + esc(opts.note) + '</p></div>';
  }

  /**
   * ルート画面の末尾に差し込む共有ブロック。renderRoute() から呼ぶ。
   *
   * 共有できる状態でなければ空文字を返す（志望レベルを選ぶ前など）。
   * 保存ボタンは出さない。保存の対象は診断の回答であって、ルート画面の設定ではない。
   */
  function routeBlock() {
    if (!CFG || !CFG.route || typeof CFG.route.encode !== "function") return "";
    var st;
    try { st = CFG.route.encode(); } catch (e) { return ""; }
    if (!st || !Array.isArray(st.tokens) || !st.tokens.length) return "";

    var tokens = st.tokens.join(SEP);
    if (!ROUTE_TOKENS_RE.test(tokens)) return "";

    var url = pageBase() + "?" + PARAM_ROUTE_VERSION + "=" + ROUTE_VERSION
      + "&" + PARAM_ROUTE + "=" + tokens;
    if (st.uni && String(st.uni).length <= ROUTE_UNI_MAX) {
      url += "&" + PARAM_ROUTE_UNI + "=" + encodeURIComponent(String(st.uni));
    }
    var label = CFG.subjectLabel + "：" + String(st.label || "");

    var key = tokens + "|" + (st.uni || "");
    var notice = "";
    if (restoredRouteKey !== null) {
      if (restoredRouteKey === key) {
        notice = '<div class="rt-notice"><p>共有されたルートを表示しています。条件を変えると、あなた自身のルートに切り替わります。</p></div>';
      } else {
        /* 条件が変わった時点で、URL に残った共有パラメータは今の画面と食い違う。
           ここで落としておくと、その URL をコピーしても古い設定が付いてこない。 */
        restoredRouteKey = null;
        clearRouteParams();
      }
    }

    return notice + shareBox({
      head: "SHARE — このルートを共有する",
      url: url,
      label: label,
      tweet: "【ルート大全】\n" + label + "のルートで進めます",
      save: false,
      note: "共有リンクに含まれるのは志望レベル・型・方針・現在地だけです。模試の偏差値や既習の参考書は含まれません。"
    });
  }

  /** 保存済みルートの一覧。現在の科目の分だけを出す */
  function savedListHTML() {
    if (!CFG || !storageOK()) return "";
    var items = loadStore().items.filter(function (it) { return it.subjectId === CFG.subject; });
    if (items.length === 0) return "";
    var rows = items.map(function (it) {
      var date = it.savedAt.slice(0, 10);
      /* ID は onclick の中ではなく data 属性に置く。
         属性値の中で JavaScript の文字列を閉じられる余地をなくすため。 */
      return '<div class="rt-saved__item">'
        + '<button type="button" class="rt-saved__open" data-rt-act="open" data-rt-id="' + esc(it.id) + '">'
        + esc(it.label) + '<small>' + esc(date) + ' に保存</small></button>'
        + '<button type="button" class="rt-saved__del" data-rt-act="remove" data-rt-id="' + esc(it.id) + '">削除</button>'
        + '</div>';
    }).join("");
    return '<div class="rt-saved"><div class="rt-saved__head">SAVED — 保存したルート（' + items.length + '件）</div>' + rows + '</div>';
  }

  /* ---------- 操作 ---------- */

  /**
   * 押されたボタンが属する共有ブロック。
   * 診断結果とルート画面に同時に共有ブロックが出るため、
   * 「今どちらを操作したか」はボタンからたどって決める（id で 1 つに決め打ちしない）。
   */
  function blockOf(btn) {
    try {
      return btn && btn.closest ? btn.closest(".rt-share") : null;
    } catch (e) { return null; }
  }

  /** 共有ブロックが持っている共有対象（URL と表示名）。属性から読む */
  function targetOf(btn) {
    var box = blockOf(btn);
    if (!box) return null;
    var url = box.getAttribute("data-rt-url");
    if (!url) return null;
    return { box: box, url: url, label: box.getAttribute("data-rt-label") || "" };
  }

  function msgHost(box) {
    return box ? box.querySelector(".rt-share__msg") : null;
  }

  function msg(box, text, tone) {
    try {
      var el = msgHost(box);
      if (!el) return;
      el.innerHTML = '<p class="rt-share__note" style="color:' + (tone === "warn" ? "var(--gold)" : "var(--ok)") + ';font-weight:700">' + esc(text) + '</p>';
      global.setTimeout(function () {
        if (el) el.innerHTML = "";
      }, 2000);
    } catch (e) { /* 表示できなくても操作自体は完了している */ }
  }

  /** クリップボードが使えない環境向けに、選択済みのテキストボックスを出す */
  function copyFallback(box, url) {
    try {
      var host = msgHost(box);
      if (!host) return;
      host.innerHTML = '<input class="rt-share__box" readonly value="' + esc(url) + '">'
        + '<p class="rt-share__note">お使いの環境では自動コピーができません。上のリンクを選択してコピーしてください。</p>';
      var input = host.querySelector(".rt-share__box");
      input.focus();
      input.select();
    } catch (e) { /* ここまで来たら打つ手はない */ }
  }

  function copyLink(btn) {
    var t = targetOf(btn);
    if (!t) return;
    var done = function () { msg(t.box, "コピーしました"); track("share_copy", { subject: CFG.subject }); };
    try {
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(t.url).then(done, function () { copyFallback(t.box, t.url); });
        return;
      }
    } catch (e) { /* 下のフォールバックへ */ }
    copyFallback(t.box, t.url);
  }

  function trackShareX() {
    if (!CFG) return;
    track("share_x", { subject: CFG.subject });
  }

  function shareNative(btn) {
    var t = targetOf(btn);
    if (!t) return;
    try {
      global.navigator.share({
        title: "ルート大全 — " + t.label,
        text: t.label + "のルートが出ました",
        url: t.url
      }).then(function () {
        track("share_native", { subject: CFG.subject });
      }, function () { /* 利用者がキャンセルした場合。何もしない */ });
    } catch (e) { /* 共有シートを開けない環境 */ }
  }

  function saveRoute(btn) {
    if (!CFG || !CURRENT || !CURRENT.tokens) return;
    if (!storageOK()) return;
    var box = blockOf(btn);
    var store = loadStore();

    /* 同じ回答をすでに保存していれば、増やさずに保存日時だけ更新する */
    var same = -1;
    for (var i = 0; i < store.items.length; i++) {
      if (store.items[i].subjectId === CFG.subject && store.items[i].answers === CURRENT.tokens) { same = i; break; }
    }
    if (same >= 0) {
      store.items[same].savedAt = new Date().toISOString();
      store.items[same].label = CURRENT.label;
      if (!saveStore(store)) { msg(box, "保存できませんでした", "warn"); return; }
      msg(box, "保存しました（既存の項目を更新）");
      track("route_save", { subject: CFG.subject, updated: true });
      return;
    }

    if (store.items.length >= STORE_LIMIT) {
      var oldest = store.items[0];
      var ok = false;
      try {
        ok = global.confirm("保存できるルートは全科目あわせて " + STORE_LIMIT + " 件までです。\n"
          + "いちばん古い「" + oldest.label + "」を削除して保存しますか？");
      } catch (e) { ok = false; }
      if (!ok) return;
      store.items.shift();
    }

    store.items.push({
      id: newId(),
      savedAt: new Date().toISOString(),
      subjectId: CFG.subject,
      answers: CURRENT.tokens,
      label: CURRENT.label
    });
    if (!saveStore(store)) { msg(box, "保存できませんでした", "warn"); return; }
    msg(box, "保存しました");
    track("route_save", { subject: CFG.subject, updated: false });
  }

  function openSaved(id) {
    if (!CFG) return;
    var items = loadStore().items;
    var it = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { it = items[i]; break; }
    }
    if (!it || it.subjectId !== CFG.subject) return;
    var res = decodeAnswers(CFG.quiz, PARAM_VERSION + "=" + SCHEMA_VERSION + "&" + PARAM_ANSWERS + "=" + it.answers);
    if (!res.ok) {
      /* 質問構成が変わったなどで復元できない項目は、残しておいても押すたびに失敗するので捨てる */
      removeSaved(id);
      return;
    }
    restored = false;
    linkFailed = false;
    CFG.state.started = true;
    CFG.state.ans = res.ans;
    CFG.showResult();
  }

  /**
   * 一覧の削除ボタンから呼ぶ。開くボタンのすぐ隣にあるので、押し間違いを確認で受け止める。
   * 内部都合の削除（復元できない項目の後始末）は removeSaved を直接呼び、確認を出さない。
   */
  function requestRemove(id) {
    if (!CFG) return;
    var items = loadStore().items;
    var target = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { target = items[i]; break; }
    }
    if (!target) return;
    var ok = false;
    try {
      ok = global.confirm("保存した「" + target.label + "」を削除しますか？");
    } catch (e) {
      ok = true; /* 確認を出せない環境では、押した操作をそのまま実行する */
    }
    if (ok) removeSaved(id);
  }

  function removeSaved(id) {
    if (!CFG) return;
    var store = loadStore();
    store.items = store.items.filter(function (it) { return it.id !== id; });
    saveStore(store);
    if (CFG.state.started && CFG.state.step === 0) CFG.renderQuiz();
  }

  /**
   * 保存一覧のボタンは動的に描き直されるので、document 側で 1 度だけ受ける。
   * 押された要素から ID を読むため、ID を onclick の文字列に埋め込まずに済む。
   */
  var delegated = false;
  function wireDelegation() {
    if (delegated) return;
    delegated = true;
    try {
      global.document.addEventListener("click", function (e) {
        var el = e.target && e.target.closest ? e.target.closest("[data-rt-act]") : null;
        if (!el) return;
        var act = el.getAttribute("data-rt-act");
        var id = el.getAttribute("data-rt-id");
        if (act === "open") openSaved(id);
        else if (act === "remove") requestRemove(id);
      });
    } catch (e) { /* クリックを受け取れない環境では保存一覧が操作できないだけ */ }
  }

  /** 共有 URL のパラメータを消してから、自分の診断をやり直す */
  function restart() {
    if (!CFG) return;
    restored = false;
    linkFailed = false;
    clearParams();
    CFG.restart();
  }

  /**
   * クエリパラメータだけを取り除く。
   * replaceState なので履歴のエントリは増えず、ブラウザの「戻る」の動きを変えない。
   */
  function clearParams() {
    try {
      global.history.replaceState(null, "", global.location.pathname);
    } catch (e) { /* replaceState が使えない環境では URL がそのまま残るだけ */ }
  }

  /** ルート共有のパラメータだけを取り除く。画面を指すハッシュ（#route）は残す */
  function clearRouteParams() {
    try {
      var u = new URL(global.location.href);
      u.searchParams.delete(PARAM_ROUTE_VERSION);
      u.searchParams.delete(PARAM_ROUTE);
      u.searchParams.delete(PARAM_ROUTE_UNI);
      global.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) { /* URL を組み直せない環境では、そのまま残しておく */ }
  }

  /**
   * 科目ページから 1 度だけ呼ぶ。
   *   quiz         その科目の QUIZ 配列
   *   subject      科目 ID（SUBJECTS のいずれか）
   *   subjectLabel 科目の表示名
   *   state        quizState
   *   showResult() 結果画面を表示する
   *   renderQuiz() 質問画面を描き直す
   *   restart()    診断を最初からやり直す
   *   route        ルート画面の共有（省略可）
   *     encode()          今のルートを {tokens, uni, label} にする。共有できないときは null
   *     apply(tokens,uni) 検証して適用する。適用できたら true
   *     show()            ルート画面を表示する
   */
  function setup(cfg) {
    if (!cfg || !Array.isArray(cfg.quiz) || SUBJECTS.indexOf(cfg.subject) < 0) return;
    CFG = cfg;
    injectStyle();
    wireDelegation();

    var search = "";
    try { search = global.location.search; } catch (e) { return; }
    if (!search || search.length < 2) return;

    var params;
    try { params = new URLSearchParams(search); } catch (e) { return; }

    if (params.has(PARAM_ROUTE_VERSION) || params.has(PARAM_ROUTE)) {
      restoreRoute(cfg, params);
      return;
    }
    /* 共有リンク以外のパラメータ（広告のクリック ID など）で注記を出さないよう、v か a があるときだけ扱う */
    if (!params.has(PARAM_VERSION) && !params.has(PARAM_ANSWERS)) return;

    var res = decodeAnswers(cfg.quiz, params);
    if (!res.ok) {
      linkFailed = true;
      clearParams();
      cfg.restart();
      track("shared_link_invalid", { subject: cfg.subject, reason: res.reason });
      return;
    }
    restored = true;
    cfg.state.started = true;
    cfg.state.ans = res.ans;
    cfg.showResult();
    track("shared_link_open", { subject: cfg.subject });
  }

  /**
   * ルートの共有 URL を検証して復元する。
   *
   * 書式（rv・r の形）はここで見て、意味（その志望レベルが実在するか等）は
   * 科目ページの route.apply が見る。どちらかが通らなければ部分的に復元せず、
   * パラメータを落として普通のトップページとして開く。
   */
  function restoreRoute(cfg, params) {
    var bail = function (reason) {
      clearRouteParams();
      track("shared_route_invalid", { subject: cfg.subject, reason: reason });
    };
    if (!cfg.route || typeof cfg.route.apply !== "function") return bail("route-unsupported");
    if (params.get(PARAM_ROUTE_VERSION) !== String(ROUTE_VERSION)) return bail("version");

    var raw = params.get(PARAM_ROUTE) || "";
    if (!ROUTE_TOKENS_RE.test(raw)) return bail("tokens-format");

    var uni = params.get(PARAM_ROUTE_UNI) || "";
    if (uni.length > ROUTE_UNI_MAX) return bail("uni-too-long");

    /* apply の中でルート画面が描き直され、その場で routeBlock() が呼ばれる。
       注記を出すかどうかの判定材料はそれより前に置いておく必要がある。 */
    restoredRouteKey = raw + "|" + uni;
    var ok = false;
    try { ok = cfg.route.apply(raw.split(SEP), uni) === true; } catch (e) { ok = false; }
    if (!ok) { restoredRouteKey = null; return bail("route-rejected"); }

    try { cfg.route.show(); } catch (e) { /* 表示に失敗しても状態は適用済み */ }
    track("shared_route_open", { subject: cfg.subject });
  }

  var RTShare = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORE_LIMIT: STORE_LIMIT,
    encodeTokens: encodeTokens,
    encodeAnswers: encodeAnswers,
    decodeAnswers: decodeAnswers,
    buildShareURL: buildShareURL,
    setup: setup,
    beforeQuiz: beforeQuiz,
    beforeResult: beforeResult,
    afterResult: afterResult,
    routeBlock: routeBlock,
    copyLink: copyLink,
    trackShareX: trackShareX,
    shareNative: shareNative,
    saveRoute: saveRoute,
    openSaved: openSaved,
    removeSaved: removeSaved,
    requestRemove: requestRemove,
    restart: restart,

    /* テスト専用。ブラウザからは使わない（test/share.test.mjs が localStorage 周りを検証するために参照する） */
    __test: {
      intentURL: intentURL,
      loadStore: loadStore,
      saveStore: saveStore,
      validItem: validItem,
      storageOK: storageOK,
      resetStorageProbe: function () { storageChecked = false; storageUsable = false; },
      STORE_KEY: STORE_KEY,
      STORE_VERSION: STORE_VERSION
    }
  };

  global.RTShare = RTShare;
  if (typeof module !== "undefined" && module.exports) module.exports = RTShare;
})(typeof globalThis !== "undefined" ? globalThis : this);
