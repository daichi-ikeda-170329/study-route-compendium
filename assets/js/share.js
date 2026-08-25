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

    var text = "【ルート大全で診断】\n" + label + "のルートが出ました\n#ルート大全 #大学受験";
    var xURL = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url);

    var canNative = false;
    try { canNative = typeof global.navigator.share === "function"; } catch (e) { canNative = false; }

    var btns = '<button type="button" class="btn btn-ghost" onclick="RTShare.copyLink(this)">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 9h10v10H9zM5 15H4V4h11v1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + 'リンクをコピー</button>';
    btns += '<a class="btn btn-ghost" href="' + esc(xURL) + '" target="_blank" rel="noopener noreferrer" onclick="RTShare.trackShareX()">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z"/></svg>'
      + 'Xで共有</a>';
    if (canNative) {
      btns += '<button type="button" class="btn btn-ghost" onclick="RTShare.shareNative()">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v13M8 7l4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '共有</button>';
    }
    if (storageOK()) {
      btns += '<button type="button" class="btn btn-ghost" onclick="RTShare.saveRoute(this)">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 3v6h7M8 20v-6h8v6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + 'この結果を保存</button>';
    }

    return '<div class="rt-share" id="rtShare">'
      + '<div class="rt-share__head">SHARE &amp; SAVE — この結果を共有・保存する</div>'
      + '<div class="rt-share__btns">' + btns + '</div>'
      + '<div id="rtShareMsg"></div>'
      + '<p class="rt-share__note">共有リンクに含まれるのは回答だけです。開いた人には、そのときの最新の診断ロジックで同じルートが表示されます。'
      + (storageOK() ? '保存はこの端末の中だけで行われ、外部には送信されません。' : '')
      + '</p></div>';
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

  function msg(text, tone) {
    try {
      var el = global.document.getElementById("rtShareMsg");
      if (!el) return;
      el.innerHTML = '<p class="rt-share__note" style="color:' + (tone === "warn" ? "var(--gold)" : "var(--ok)") + ';font-weight:700">' + esc(text) + '</p>';
      global.setTimeout(function () {
        var cur = global.document.getElementById("rtShareMsg");
        if (cur) cur.innerHTML = "";
      }, 2000);
    } catch (e) { /* 表示できなくても操作自体は完了している */ }
  }

  /** クリップボードが使えない環境向けに、選択済みのテキストボックスを出す */
  function copyFallback(url) {
    try {
      var host = global.document.getElementById("rtShareMsg");
      if (!host) return;
      host.innerHTML = '<input class="rt-share__box" id="rtShareBox" readonly value="' + esc(url) + '">'
        + '<p class="rt-share__note">お使いの環境では自動コピーができません。上のリンクを選択してコピーしてください。</p>';
      var box = global.document.getElementById("rtShareBox");
      box.focus();
      box.select();
    } catch (e) { /* ここまで来たら打つ手はない */ }
  }

  function copyLink() {
    if (!CURRENT) return;
    var url = CURRENT.url;
    var done = function () { msg("コピーしました"); track("share_copy", { subject: CFG.subject }); };
    try {
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(url).then(done, function () { copyFallback(url); });
        return;
      }
    } catch (e) { /* 下のフォールバックへ */ }
    copyFallback(url);
  }

  function trackShareX() {
    if (!CFG) return;
    track("share_x", { subject: CFG.subject });
  }

  function shareNative() {
    if (!CURRENT) return;
    try {
      global.navigator.share({
        title: "ルート大全 — " + CURRENT.label,
        text: CURRENT.label + "のルートが出ました",
        url: CURRENT.url
      }).then(function () {
        track("share_native", { subject: CFG.subject });
      }, function () { /* 利用者がキャンセルした場合。何もしない */ });
    } catch (e) { /* 共有シートを開けない環境 */ }
  }

  function saveRoute() {
    if (!CFG || !CURRENT || !CURRENT.tokens) return;
    if (!storageOK()) return;
    var store = loadStore();

    /* 同じ回答をすでに保存していれば、増やさずに保存日時だけ更新する */
    var same = -1;
    for (var i = 0; i < store.items.length; i++) {
      if (store.items[i].subjectId === CFG.subject && store.items[i].answers === CURRENT.tokens) { same = i; break; }
    }
    if (same >= 0) {
      store.items[same].savedAt = new Date().toISOString();
      store.items[same].label = CURRENT.label;
      if (!saveStore(store)) { msg("保存できませんでした", "warn"); return; }
      msg("保存しました（既存の項目を更新）");
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
    if (!saveStore(store)) { msg("保存できませんでした", "warn"); return; }
    msg("保存しました");
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

  /**
   * 科目ページから 1 度だけ呼ぶ。
   *   quiz         その科目の QUIZ 配列
   *   subject      科目 ID（SUBJECTS のいずれか）
   *   subjectLabel 科目の表示名
   *   state        quizState
   *   showResult() 結果画面を表示する
   *   renderQuiz() 質問画面を描き直す
   *   restart()    診断を最初からやり直す
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
