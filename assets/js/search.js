/**
 * ルート大全 — 全ページ共通の参考書検索
 *
 * ヘッダーに常設した検索ボックス（#rtSearch）から、5 科目 1,052 冊を横断して
 * 探し、選ぶとその参考書の詳細ページ（/<科目>/books/<id>/）へ移動する。
 *
 * 設計の要点
 *  - 索引（/assets/js/book-index.js）は最初に検索欄へ触れたときに読み込む。
 *    全ページに置く常設 UI なので、使わない人に 30KB 超を配らないため。
 *  - 見た目の CSS はこのファイルから 1 度だけ差し込む。手書き HTML（ポータル・
 *    科目トップ・404）は site.css を読まないため、共通の置き場がここしかない。
 *  - 画面に出す文字列は索引由来のものだけ。入力値はエスケープしたうえで
 *    「該当なし」の表示にしか使わない。
 */
(function (global) {
  "use strict";

  var INDEX_SRC = "/assets/js/book-index.js";
  var MAX_HITS = 12;

  var doc = global.document;
  var root, input, pop;
  var hits = [];
  var cur = -1;
  var lastQuery = "";
  var timer = null;
  var indexState = "idle"; /* idle | loading | ready | failed */
  var hayCache = null;

  /* ============================================================
     見た目
     ============================================================ */

  var STYLE = [
    /* 検索欄は狭い画面でヘッダーの 2 行目に回る。ヘッダー側の折り返しもここで面倒を見る
       （手書き HTML 9 枚と site.css に同じ 1 行を配ると、片方だけ直し忘れる） */
    ".app-header__in{flex-wrap:wrap}",
    ".rt-search{position:relative;flex:1 1 100%;order:9;min-width:0}",
    /* 1100px 以上ではヘッダーの 1 行目に、ロゴとナビの間へ横並びに置く。
       境目は「ロゴ＋ナビが最も広い科目トップ（英語 778px）＋検索 250px＋余白」が
       収まる幅から決めてある。ここを下げると、その科目のナビが 2 行目へ折り返す。
       縮む余地（flex-shrink）を残してあるので、境目のすぐ上でも折り返さない */
    "@media(min-width:1100px){.rt-search{flex:0 1 250px;order:0;min-width:170px}}",
    ".rt-search__in{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border:1px solid var(--line-d,#D8D4C8);border-radius:6px;background:var(--surface,#fff);transition:.15s}",
    ".rt-search__in:focus-within{border-color:var(--sc,#24427C);box-shadow:0 0 0 3px rgba(36,66,124,.09)}",
    ".rt-search__in>svg{flex:none;color:var(--muted-2,#8B8578)}",
    ".rt-search input{flex:1;min-width:0;border:0;outline:0;background:none;font-family:inherit;font-size:13px;color:var(--ink,#22242B);-webkit-appearance:none;appearance:none}",
    ".rt-search input::-webkit-search-cancel-button{-webkit-appearance:none}",
    ".rt-search input::placeholder{color:var(--muted-2,#8B8578)}",
    ".rt-search__pop{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:90;background:var(--surface,#fff);border:1px solid var(--line-d,#D8D4C8);border-radius:6px;box-shadow:0 18px 40px rgba(30,28,24,.16);max-height:min(64vh,430px);overflow-y:auto;overscroll-behavior:contain}",
    ".rt-search__pop.open{display:block}",
    "@media(min-width:1100px){.rt-search__pop{width:380px}}",
    ".rt-search__hit{display:flex;align-items:flex-start;gap:10px;width:100%;padding:10px 13px;border:0;border-top:1px solid var(--line-2,#EDEAE1);background:none;text-align:left;font-family:inherit;cursor:pointer}",
    ".rt-search__hit:first-child{border-top:0}",
    ".rt-search__hit.cur,.rt-search__hit:hover{background:var(--surface-2,#F6F4EF)}",
    ".rt-search__mark{flex:none;width:22px;height:22px;margin-top:1px;border-radius:3px;color:#fff;background:var(--mc,#22242B);display:grid;place-items:center;font-size:11px;font-weight:700}",
    ".rt-search__txt{min-width:0;flex:1}",
    ".rt-search__txt b{display:block;font-size:13px;font-weight:700;line-height:1.45;color:var(--ink,#22242B)}",
    ".rt-search__txt span{display:block;margin-top:2px;font-size:10.5px;color:var(--muted,#6F6A5E);letter-spacing:.02em}",
    ".rt-search__note{padding:13px;font-size:12px;line-height:1.6;color:var(--muted,#6F6A5E)}",
    ".rt-search__note b{font-weight:700;color:var(--ink-2,#3A3D46)}"
  ].join("\n");

  function injectStyle() {
    try {
      if (doc.getElementById("rt-search-style")) return;
      var el = doc.createElement("style");
      el.id = "rt-search-style";
      el.textContent = STYLE;
      doc.head.appendChild(el);
    } catch (e) { /* head に触れない環境では見た目だけ素になる */ }
  }

  /**
   * 検索の突き合わせに使う正規化。索引を作る側（build/generate-search.mjs）と
   * ここの両方で同じ関数を通すので、書き方の違いで引けなくなることがない。
   *
   *   小文字化 → 全角英数を半角へ → カタカナをひらがなへ → 記号・空白・長音を落とす
   *
   * 「ポレポレ」「ぽれぽれ」「Next Stage」「nextstage」がどれも同じ形になる。
   * 索引には正規化した形だけを持たせる（表記ごとに何通りも持たせるより軽い）。
   */
  function normalize(s) {
    return String(s == null ? "" : s)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0x60);
      })
      .replace(/[\s　!-\/:-@\[-`{-~、。・「」『』（）〈〉【】〜ー―－‐]/g, "");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function track(name, params) {
    try {
      if (typeof global.gtag === "function") global.gtag("event", name, params || {});
    } catch (e) { /* 計測が無い環境では何もしない */ }
  }

  /* ============================================================
     索引
     ============================================================ */

  /** 索引を 1 度だけ読み込む。読み終わったら done() を呼ぶ */
  function loadIndex(done) {
    if (indexState === "ready" || indexState === "failed") { done(); return; }
    if (indexState === "loading") {
      doc.addEventListener("rt-search-index", function once() {
        doc.removeEventListener("rt-search-index", once);
        done();
      });
      return;
    }
    indexState = "loading";
    var s = doc.createElement("script");
    s.src = INDEX_SRC;
    s.onload = function () {
      indexState = global.RT_BOOK_INDEX ? "ready" : "failed";
      finish();
    };
    s.onerror = function () { indexState = "failed"; finish(); };
    function finish() {
      try { doc.dispatchEvent(new Event("rt-search-index")); } catch (e) { /* 旧環境 */ }
      done();
    }
    doc.head.appendChild(s);
  }

  /**
   * 突き合わせ用の文字列を 1 度だけ作る。
   * 索引の 6 番目（追加語）はすでに正規化済みなので、書名と出版社だけここで通す。
   */
  function haystacks() {
    if (hayCache) return hayCache;
    var books = global.RT_BOOK_INDEX.books;
    hayCache = new Array(books.length);
    for (var i = 0; i < books.length; i++) {
      hayCache[i] = normalize(books[i][2]) + " " + normalize(books[i][3]) + " " + books[i][5];
    }
    return hayCache;
  }

  /**
   * 空白区切りの語をすべて含む本を探す。
   * 書名が入力で始まる本を先に出す（「ターゲット」で ターゲット1900 を上に出すため）。
   */
  function search(q) {
    if (indexState !== "ready") return [];
    var terms = String(q).split(/[\s　]+/).map(normalize).filter(Boolean);
    if (!terms.length) return [];
    var books = global.RT_BOOK_INDEX.books;
    var hay = haystacks();
    var head = [], rest = [];
    for (var i = 0; i < books.length; i++) {
      var ok = true;
      for (var j = 0; j < terms.length; j++) {
        if (hay[i].indexOf(terms[j]) < 0) { ok = false; break; }
      }
      if (!ok) continue;
      (normalize(books[i][2]).indexOf(terms[0]) === 0 ? head : rest).push(books[i]);
      if (head.length >= MAX_HITS) break;
    }
    return head.concat(rest).slice(0, MAX_HITS);
  }

  function bookURL(b) {
    return "/" + global.RT_BOOK_INDEX.subjects[b[0]][0] + "/books/" + b[1] + "/";
  }

  /* ============================================================
     描画と操作
     ============================================================ */

  function open() { pop.classList.add("open"); input.setAttribute("aria-expanded", "true"); }
  function close() {
    pop.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    cur = -1;
  }

  function note(html) {
    pop.innerHTML = '<div class="rt-search__note">' + html + "</div>";
    open();
  }

  function render() {
    if (!hits.length) return;
    var subs = global.RT_BOOK_INDEX.subjects;
    pop.innerHTML = hits.map(function (b, i) {
      var s = subs[b[0]];
      var meta = [s[1], b[4], b[3]].filter(Boolean).join(" ・ ");
      return '<button type="button" role="option" aria-selected="' + (i === cur) + '"'
        + ' id="rtSearchHit' + i + '" class="rt-search__hit' + (i === cur ? " cur" : "") + '"'
        + ' data-rt-i="' + i + '">'
        + '<span class="rt-search__mark" style="--mc:' + esc(s[3]) + '">' + esc(s[2]) + "</span>"
        + '<span class="rt-search__txt"><b>' + esc(b[2]) + "</b><span>" + esc(meta) + "</span></span>"
        + "</button>";
    }).join("");
    open();
  }

  function move(step) {
    if (!hits.length) return;
    cur = (cur + step + hits.length) % hits.length;
    var nodes = pop.querySelectorAll(".rt-search__hit");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("cur", i === cur);
      nodes[i].setAttribute("aria-selected", i === cur);
    }
    input.setAttribute("aria-activedescendant", "rtSearchHit" + cur);
    if (nodes[cur]) nodes[cur].scrollIntoView({ block: "nearest" });
  }

  function go(i) {
    var b = hits[i];
    if (!b) return;
    track("book_search_open", { subject: global.RT_BOOK_INDEX.subjects[b[0]][0], book: b[1] });
    global.location.href = bookURL(b);
  }

  function run() {
    var q = input.value.trim();
    lastQuery = q;
    if (!q) { close(); return; }
    loadIndex(function () {
      if (input.value.trim() !== lastQuery) return; /* 読み込み中に入力が変わっていた */
      if (indexState !== "ready") {
        note("検索を読み込めませんでした。<b>参考書図鑑</b>から探してください。");
        return;
      }
      hits = search(q);
      cur = -1;
      if (!hits.length) {
        note("「" + esc(q) + "」に一致する参考書は見つかりませんでした。");
        return;
      }
      render();
    });
  }

  function wire() {
    root = doc.getElementById("rtSearch");
    if (!root) return;
    input = root.querySelector("input");
    pop = doc.getElementById("rtSearchPop");
    if (!input || !pop) return;

    injectStyle();

    /* 索引は「触れた時点」で取りに行く。1 文字目を打ち終える頃には届いている */
    input.addEventListener("focus", function () {
      loadIndex(function () {});
      if (input.value.trim()) run();
    });
    input.addEventListener("input", function () {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(run, 80);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { close(); input.blur(); return; }
      if (!pop.classList.contains("open")) return;
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); go(cur >= 0 ? cur : 0); }
    });
    /* 候補は毎回描き直すので、個々のボタンではなく親で受ける */
    pop.addEventListener("mousedown", function (e) {
      var btn = e.target.closest ? e.target.closest(".rt-search__hit") : null;
      if (!btn) return;
      e.preventDefault(); /* blur で閉じる前に確定させる */
      go(+btn.dataset.rtI);
    });
    doc.addEventListener("click", function (e) {
      if (!root.contains(e.target)) close();
    });
  }

  /* ブラウザ以外（索引を作るビルドや node --test）では DOM を触らない */
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", wire);
    else wire();
  }

  var RTSearch = {
    /** 索引側と検索側を同じ形にそろえる正規化。build/generate-search.mjs もこれを使う */
    normalize: normalize,
    /* テストと手動確認のために内部を出す。画面側からは使わない */
    _search: search,
    _state: function () { return indexState; }
  };
  global.RTSearch = RTSearch;
  if (typeof module !== "undefined" && module.exports) module.exports = RTSearch;
})(typeof window !== "undefined" ? window : globalThis);
