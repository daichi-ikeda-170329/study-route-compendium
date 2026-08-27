/**
 * ルート大全 — 進めるペースの表示
 *
 * ルート画面に出ている並びに対して、「1 日に何時間使えるか」と「いつの入試か」から
 * 各参考書をいつまでに終えていればよいかを出す。5 科目の科目トップから読み込む。
 *
 * 設計の要点
 *  - 画面に出ている DOM を読んで計算する。科目ごとにルートの組み立て方が違うので、
 *    各ページの描画処理には手を入れず、描き終わったあとに 1 回呼ぶだけで済ませる。
 *    必要な情報は .climb-node の data-h（その本の想定時間）と .subj-head の区切りだけ。
 *  - 分野が複数ある科目（国語・理科・社会）は、1 日の時間を分野で等分して並行に進める前提で計算する。
 *    直列に積み上げると「化学は 8 か月後から」のような、実際の進め方と合わない表示になる。
 *  - 仕上げ（過去問）は他の分野が終わったあとに置く。並行させる種類の教材ではない。
 *  - 出るのは目安であって締切ではない。1 日の時間は自己申告で、参考書の想定時間にも幅がある。
 */
(function (global) {
  "use strict";

  var doc = global.document;

  /** 1 日にこの科目へ使える時間の選択肢（時間） */
  var HOURS = [0.5, 1, 1.5, 2, 3, 4];
  var DEFAULT_HOURS = 2;
  /** 共通テストは 1 月中旬。日付までは年で動くので、月の中ごろを締切に置く */
  var EXAM_MONTH = 0;
  var EXAM_DAY = 15;
  /** 受験年の選択肢を今年から何年先まで出すか（高 1 の 3 年後まで） */
  var YEARS_AHEAD = 3;
  var STORE_KEY = "rt_pace";

  var CFG = null;
  var state = { year: null, hours: DEFAULT_HOURS };

  /* ============================================================
     計算（DOM に依存しない部分）
     ============================================================ */

  /** その年の入試（共通テスト）の目安日 */
  function examDate(year) {
    return new Date(year, EXAM_MONTH, EXAM_DAY);
  }

  /** 今日から見て次に来る入試の年。1 月中旬を過ぎていれば翌年 */
  function defaultYear(today) {
    var y = today.getFullYear();
    return today > examDate(y) ? y + 1 : y;
  }

  function addDays(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + Math.ceil(days));
    return d;
  }

  /** 「2026年10月中旬」。日付まで出すと目安以上の意味に見えるので旬で丸める */
  function label(date) {
    var d = date.getDate();
    var jun = d <= 10 ? "上旬" : (d <= 20 ? "中旬" : "下旬");
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + jun;
  }

  function fmtHours(h) {
    return h === Math.floor(h) ? String(h) : h.toFixed(1);
  }

  /**
   * 分野ごとに区切られた残り時間から、各段の完了予定日を出す。
   *
   * @param {Array} tracks  [{final:bool, steps:[時間]}]
   * @param {number} hours  1 日に使える時間
   * @param {Date}   today
   * @returns {{done:Date, byTrack:Array<Array<Date>>, totalHours:number}} 完走予定日と各段の予定日
   */
  function schedule(tracks, hours, today) {
    var main = tracks.filter(function (t) { return !t.final; });
    var finals = tracks.filter(function (t) { return t.final; });
    var per = main.length ? hours / main.length : hours;
    var byTrack = [];
    var mainEnd = today;
    var total = 0;

    tracks.forEach(function () { byTrack.push([]); });

    tracks.forEach(function (t, ti) {
      if (t.final) return;
      var acc = 0;
      t.steps.forEach(function (h) {
        acc += h;
        byTrack[ti].push(addDays(today, acc / per));
      });
      total += acc;
      if (acc > 0) {
        var end = addDays(today, acc / per);
        if (end > mainEnd) mainEnd = end;
      }
    });

    /* 仕上げは他が終わってから。1 日の時間はまるごと使える */
    tracks.forEach(function (t, ti) {
      if (!t.final) return;
      var acc = 0;
      t.steps.forEach(function (h) {
        acc += h;
        byTrack[ti].push(addDays(mainEnd, acc / hours));
      });
      total += acc;
    });

    var done = mainEnd;
    finals.forEach(function (t, i) {
      var arr = byTrack[tracks.indexOf(t)];
      if (arr.length && arr[arr.length - 1] > done) done = arr[arr.length - 1];
    });
    return { done: done, byTrack: byTrack, totalHours: total };
  }

  /* ============================================================
     保存（この端末の中だけ）
     ============================================================ */

  function load() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (v && typeof v.year === "number" && v.year >= 2000 && v.year <= 2100) state.year = v.year;
      if (v && HOURS.indexOf(v.hours) >= 0) state.hours = v.hours;
    } catch (e) { /* 使えない環境では既定値のまま */ }
  }

  function save() {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify({ year: state.year, hours: state.hours }));
    } catch (e) { /* 保存できなくても表示は変わらない */ }
  }

  /* ============================================================
     見た目
     ============================================================ */

  var STYLE = [
    ".pace{margin:10px 0 4px;padding:14px 16px;border:1px solid var(--line);border-left:3px solid var(--indigo);border-radius:var(--r-s,6px);background:var(--surface)}",
    ".pace__head{display:flex;flex-wrap:wrap;align-items:center;gap:10px}",
    ".pace__t{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.08em;color:var(--muted)}",
    ".pace__f{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);font-weight:700}",
    ".pace__f select{font-family:inherit;font-size:12.5px;font-weight:700;color:var(--ink);padding:7px 9px;min-height:38px;border:1px solid var(--line-d);border-radius:5px;background:var(--surface)}",
    ".pace__verdict{margin-top:11px;font-size:13px;line-height:1.75;color:var(--ink-2)}",
    ".pace__verdict b{font-weight:800;color:var(--ink)}",
    ".pace__badge{display:inline-block;margin-right:8px;padding:3px 9px;border-radius:3px;font-size:11px;font-weight:800;letter-spacing:.04em;color:#fff}",
    ".pace__badge.ok{background:var(--ok,#2F6E4F)}",
    ".pace__badge.tight{background:var(--gold,#946200)}",
    ".pace__badge.over{background:var(--accent,#B5432A)}",
    ".pace__note{margin-top:8px;font-size:11.5px;line-height:1.7;color:var(--muted-2)}",
    ".cn-due{display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:2px 8px;border-radius:3px;background:var(--surface-3);font-family:var(--mono);font-size:10px;font-weight:600;color:var(--ink-2);letter-spacing:.03em}",
    ".climb-node.start .cn-due{background:var(--accent,#B5432A);color:#fff}"
  ].join("\n");

  function injectStyle() {
    try {
      if (doc.getElementById("rt-pace-style")) return;
      var el = doc.createElement("style");
      el.id = "rt-pace-style";
      el.textContent = STYLE;
      doc.head.appendChild(el);
    } catch (e) { /* head に触れない環境では見た目だけ素になる */ }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ============================================================
     画面から読む
     ============================================================ */

  /**
   * ルートの並びを分野ごとに切り出す。
   * .subj-head が分野の区切り。区切りが 1 つも無い科目（英語・数学）は全体で 1 つの分野。
   * 並行教材（.climb-node.para）と、済み・スキップの段は日程に数えない。
   */
  function readTracks(climb) {
    var tracks = [{ final: false, nodes: [] }];
    var kids = climb.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains("subj-head")) {
        tracks.push({ final: el.hasAttribute("data-final"), nodes: [] });
        continue;
      }
      if (!el.classList.contains("climb-node")) continue;
      if (el.classList.contains("para") || !el.classList.contains("active")) continue;
      var h = parseFloat(el.getAttribute("data-h"));
      if (!(h > 0)) continue;
      tracks[tracks.length - 1].nodes.push({ el: el, h: h });
    }
    return tracks.filter(function (t) { return t.nodes.length; });
  }

  /* ============================================================
     描画
     ============================================================ */

  function controlsHTML() {
    var now = CFG.today();
    var first = defaultYear(now);
    var years = [];
    for (var y = first; y <= first + YEARS_AHEAD; y++) years.push(y);
    if (years.indexOf(state.year) < 0) state.year = first;

    var yearOpts = years.map(function (y) {
      var grade = y === first ? "高3・既卒" : (y === first + 1 ? "高2" : (y === first + 2 ? "高1" : "中3"));
      return '<option value="' + y + '"' + (y === state.year ? " selected" : "") + ">"
        + y + "年入試（" + grade + "）</option>";
    }).join("");

    var hourOpts = HOURS.map(function (h) {
      return '<option value="' + h + '"' + (h === state.hours ? " selected" : "") + ">"
        + fmtHours(h) + " 時間</option>";
    }).join("");

    return '<div class="pace__head">'
      + '<span class="pace__t">PACE — 進めるペース</span>'
      + '<label class="pace__f">受験<select onchange="RTPace.setYear(this.value)">' + yearOpts + "</select></label>"
      + '<label class="pace__f">1日<select onchange="RTPace.setHours(this.value)">' + hourOpts + "</select></label>"
      + "</div>";
  }

  function verdictHTML(plan, now) {
    var exam = examDate(state.year);
    var slack = (exam - plan.done) / 86400000;
    var monthsLeft = (exam - now) / 86400000 / 30.4;
    var badge, line;

    if (slack >= 30) {
      badge = '<span class="pace__badge ok">間に合う</span>';
      line = "このペースなら <b>" + esc(label(plan.done)) + "</b> に完走できます。入試まで <b>約"
        + Math.floor(slack / 30.4) + " か月</b>残るので、過去問と苦手分野の補強に回せます。";
    } else if (slack >= 0) {
      badge = '<span class="pace__badge tight">ぎりぎり</span>';
      line = "完走は <b>" + esc(label(plan.done)) + "</b> の見込みで、入試までの余裕は <b>約"
        + Math.max(1, Math.floor(slack)) + " 日</b>しかありません。"
        + "1 日の時間を増やすか、学習方針を「時短・精選型」に切り替えると余裕が出ます。";
    } else {
      var over = -slack;
      var overLabel = over < 31 ? "約" + Math.ceil(over) + " 日" : "約" + Math.ceil(over / 30.4) + " か月";
      var shortHours = Math.ceil(plan.totalHours - state.hours * Math.max(0, (exam - now) / 86400000));
      badge = '<span class="pace__badge over">足りない</span>';
      line = "このペースだと完走が <b>" + esc(label(plan.done)) + "</b> になり、入試を <b>" + overLabel
        + "</b>過ぎます。"
        + (shortHours > 0 ? "入試までに使える時間に対して <b>約" + shortHours + " 時間</b>足りません。" : "")
        + "学習方針を「時短・精選型」にするか、1 日の時間を見直してください。";
    }

    return '<div class="pace__verdict">' + badge + line + "</div>"
      + '<p class="pace__note">' + esc(state.year) + " 年 1 月中旬の共通テストを締切に置いた目安です（私大・国公立二次はその先）。"
      + "残り <b>" + Math.round(plan.totalHours) + " 時間</b>を 1 日 " + fmtHours(state.hours) + " 時間で割った計算で、"
      + "分野が複数あるときは時間を等分して並行に進める前提にしています。"
      + "単語帳などの並行枠と、すでに終えた段はこの時間に含みません。</p>";
  }

  /* ============================================================
     入口
     ============================================================ */

  /**
   * ルート画面を描き直したあとに呼ぶ。ルートが出ていなければ何もしない。
   */
  function apply() {
    if (!CFG || !doc) return;
    var out = doc.getElementById("routeOutput");
    if (!out) return;
    var old = out.querySelector(".pace");
    if (old) old.remove();
    var climb = out.querySelector(".climb");
    var summary = out.querySelector(".route-summary");
    if (!climb || !summary) return;

    var tracks = readTracks(climb);
    var now = CFG.today();
    var plan = schedule(
      tracks.map(function (t) {
        return { final: t.final, steps: t.nodes.map(function (n) { return n.h; }) };
      }),
      state.hours, now
    );

    /* 各段に「いつまでに」を書き込む。前回の描画で付いたものは消してから */
    var stale = out.querySelectorAll(".cn-due");
    for (var i = 0; i < stale.length; i++) stale[i].remove();

    tracks.forEach(function (t, ti) {
      t.nodes.forEach(function (n, ni) {
        var info = n.el.querySelector(".cn-info");
        if (!info) return;
        var span = doc.createElement("span");
        span.className = "cn-due";
        span.textContent = "〜" + label(plan.byTrack[ti][ni]) + " に完了";
        info.appendChild(span);
      });
    });

    var box = doc.createElement("div");
    box.className = "pace";
    box.innerHTML = controlsHTML()
      + (plan.totalHours > 0
        ? verdictHTML(plan, now)
        : '<div class="pace__verdict">この条件では残っている教材がありません。過去問演習に進んでください。</div>');
    summary.parentNode.insertBefore(box, summary.nextSibling);
  }

  function setYear(v) {
    var y = parseInt(v, 10);
    if (!(y >= 2000 && y <= 2100)) return;
    state.year = y;
    save();
    apply();
  }

  function setHours(v) {
    var h = parseFloat(v);
    if (HOURS.indexOf(h) < 0) return;
    state.hours = h;
    save();
    apply();
  }

  /**
   * 科目ページから 1 度だけ呼ぶ。
   *   today() 今日の日付を返す（テストから差し替えるために関数で受ける）
   */
  function setup(cfg) {
    CFG = cfg || {};
    if (typeof CFG.today !== "function") CFG.today = function () { return new Date(); };
    load();
    if (!state.year) state.year = defaultYear(CFG.today());
    injectStyle();
  }

  var RTPace = {
    setup: setup,
    apply: apply,
    setYear: setYear,
    setHours: setHours,
    /* テスト用。画面側からは使わない */
    __test: {
      schedule: schedule,
      examDate: examDate,
      defaultYear: defaultYear,
      label: label,
      HOURS: HOURS,
      state: state
    }
  };

  global.RTPace = RTPace;
  if (typeof module !== "undefined" && module.exports) module.exports = RTPace;
})(typeof window !== "undefined" ? window : globalThis);
