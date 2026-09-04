/**
 * ルート大全 — 進めるペースの表示
 *
 * ルート画面に出ている並びに対して、「1 日に何時間使えるか」と「いつの入試か」から
 * 各参考書をいつまでに終えていればよいかを出す。5 科目の科目トップから読み込む。
 *
 * 設計の要点
 *  - 画面に出ている DOM を読んで計算する。科目ごとにルートの組み立て方が違うので、
 *    各ページの描画処理には手を入れず、描き終わったあとに 1 回呼ぶだけで済ませる。
 *    必要な情報は .climb-node の data-h / data-hours と .subj-head の区切りだけ。
 *  - 分野が複数ある科目（国語・理科・社会）は、1 日の時間を分野で等分して並行に進める前提で計算する。
 *    直列に積み上げると「化学は 8 か月後から」のような、実際の進め方と合わない表示になる。
 *  - 仕上げ（過去問）は他の分野が終わったあとに置く。並行させる種類の教材ではない。
 *  - **出るのは幅であって一点の予測ではない。** 参考書の想定学習時間はもともと
 *    「60〜100h」のような幅で書かれている。代表値だけを使って 1 つの日付を出すと、
 *    データが持っていない精度を表示することになるので、最短・標準・余裕の 3 本を出す。
 *  - 「間に合う」と断定しない。1 日の時間は自己申告で、進み方も人によって変わる。
 *  - 想定時間が数値で書かれていない教材（継続購読・要確認など）は計算に入れず、
 *    「合計は下限」であることを明示する。
 *  - 平日と休日は別に受け取り、週 1 日の予備日を既定で確保する。
 *    毎日同じ時間を続けられる前提の計算は、外れたときに取り返しがつかない。
 *  - 保存はこの端末の localStorage だけ。旧形式（v1）は読み込み時に移行する。
 */
(function (global) {
  "use strict";

  var doc = global.document;

  /** 1 日にこの科目へ使える時間の選択肢（時間）。0 も選べる（その日は進めない） */
  var HOURS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6];
  var DEFAULT_WEEKDAY = 2;
  var DEFAULT_WEEKEND = 3;
  /** 共通テストは 1 月中旬。日付までは年で動くので、月の中ごろを締切に置く */
  var EXAM_MONTH = 0;
  var EXAM_DAY = 15;
  /** 受験年の選択肢を今年から何年先まで出すか（高 1 の 3 年後まで） */
  var YEARS_AHEAD = 3;
  var STORE_KEY = "rt_pace";
  var STORE_VERSION = 2;

  /**
   * 締切の種類。**日付は例年の目安であって、その年の確定日ではない。**
   * 出願年度の日程は必ず公式発表で確認してもらう（画面にもそう書く）。
   */
  var DEADLINES = {
    kyotsu:    { label: "共通テスト",   month: 0, day: 15 },
    shidai:    { label: "私大一般入試", month: 1, day: 5  },
    kokkoritsu:{ label: "国公立二次",   month: 1, day: 25 },
    custom:    { label: "任意の日",     month: 0, day: 15 }
  };

  var CFG = null;
  var state = {
    year: null,
    weekday: DEFAULT_WEEKDAY,
    weekend: DEFAULT_WEEKEND,
    rest: true,          /* 週 1 日の予備日を空ける */
    deadline: "kyotsu",
    customDate: null     /* "YYYY-MM-DD" */
  };

  /* ============================================================
     計算（DOM に依存しない部分）
     ============================================================ */

  /** その年の入試（共通テスト）の目安日 */
  function examDate(year) {
    return new Date(year, EXAM_MONTH, EXAM_DAY);
  }

  /** 選んだ締切の日。任意の日を選んでいればその日 */
  function deadlineDate(year, kind, custom) {
    if (kind === "custom" && custom) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(custom);
      if (m) {
        var d = new Date(+m[1], +m[2] - 1, +m[3]);
        if (!isNaN(d.getTime())) return d;
      }
    }
    var def = DEADLINES[kind] || DEADLINES.kyotsu;
    return new Date(year, def.month, def.day);
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
   * 想定学習時間の文字列から、下限・標準・上限を取り出す。
   *
   * データ側は「60〜100h」「各巻30〜45h」「継続購読」のように書かれている。
   * 代表値 h は分冊なども織り込んだ合計なので、**文字列から読んだ比率で h を割り振る**。
   * こうすると代表値と食い違わないまま、データが持っている幅をそのまま出せる。
   *
   * 数値の幅が読めない教材（「継続購読」「要確認」など）は unverified とし、
   * 合計から外す。推測で埋めない。
   *
   * @param {string} text BOOKS[].hours
   * @param {number} h    BOOKS[].h（代表値・合計）
   * @returns {{min:number, mid:number, max:number, unverified:boolean}}
   */
  function parseBand(text, h) {
    var mid = (typeof h === "number" && h > 0) ? h : 0;
    var t = String(text == null ? "" : text);
    var m = /(\d+(?:\.\d+)?)\s*[〜~ー–-]\s*(\d+(?:\.\d+)?)\s*h/.exec(t);
    if (m) {
      var lo = parseFloat(m[1]), hi = parseFloat(m[2]);
      var center = (lo + hi) / 2;
      if (center > 0 && mid > 0) {
        return { min: mid * (lo / center), mid: mid, max: mid * (hi / center), unverified: false };
      }
    }
    var one = /(\d+(?:\.\d+)?)\s*h/.exec(t);
    if (one && mid > 0) return { min: mid, mid: mid, max: mid, unverified: false };
    /* 数値で書かれていない。合計に入れず、下限であることを画面に出す */
    return { min: 0, mid: 0, max: 0, unverified: true };
  }

  /**
   * その日に使える時間。平日・休日を分け、予備日は 0 にする。
   * 予備日は日曜に置く（週 1 日、曜日を選ばせるほどの効果は無い）。
   */
  function capacityOn(date, cap) {
    var day = date.getDay();
    if (cap.rest && day === 0) return 0;
    return (day === 0 || day === 6) ? cap.weekend : cap.weekday;
  }

  /** 数値で渡されたら「毎日その時間・予備日なし」として扱う（旧 API の互換） */
  function normalizeCap(cap) {
    if (typeof cap === "number") return { weekday: cap, weekend: cap, rest: false };
    return { weekday: cap.weekday, weekend: cap.weekend, rest: !!cap.rest };
  }

  /** 1 週間ぶんの合計時間。0 なら日程が出せない */
  function weeklyHours(cap) {
    var t = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(2026, 0, 4 + i);   /* 2026-01-04 は日曜 */
      t += capacityOn(d, cap);
    }
    return t;
  }

  /** 上限。1 週間ぶんの時間が 0 のときに無限ループへ入らないための歯止め */
  var MAX_DAYS = 366 * 8;

  /**
   * start から hours 時間を消化し終える日を返す。
   * share 倍率（分野を並行するときの配分）を掛けて капacity を按分する。
   */
  function dateAfterHours(start, hours, cap, share) {
    if (!(hours > 0)) return new Date(start.getTime());
    var per = weeklyHours(cap) * (share || 1);
    if (!(per > 0)) return null;      /* 1 日の時間が 0。日付を出せない */
    var acc = 0, d = new Date(start.getTime());
    for (var i = 0; i < MAX_DAYS; i++) {
      d.setDate(d.getDate() + 1);
      acc += capacityOn(d, cap) * (share || 1);
      if (acc >= hours) return d;
    }
    return null;
  }

  /**
   * 分野ごとに区切られた残り時間から、各段の完了予定日を出す。
   *
   * @param {Array} tracks  [{final:bool, steps:[時間]}]
   * @param {number|object} cap  1 日に使える時間。数値なら毎日その時間
   * @param {Date}   today
   * @returns {{done:Date|null, byTrack:Array<Array<Date|null>>, totalHours:number}}
   */
  function schedule(tracks, cap, today) {
    var c = normalizeCap(cap);
    var main = tracks.filter(function (t) { return !t.final; });
    var share = main.length ? 1 / main.length : 1;
    var byTrack = [];
    var mainEnd = today;
    var total = 0;
    var unknown = false;

    tracks.forEach(function () { byTrack.push([]); });

    tracks.forEach(function (t, ti) {
      if (t.final) return;
      var acc = 0;
      t.steps.forEach(function (h) {
        acc += h;
        var d = dateAfterHours(today, acc, c, share);
        if (d === null) unknown = true;
        byTrack[ti].push(d);
      });
      total += acc;
      if (acc > 0) {
        var end = dateAfterHours(today, acc, c, share);
        if (end && end > mainEnd) mainEnd = end;
      }
    });

    /* 仕上げは他が終わってから。1 日の時間はまるごと使える */
    tracks.forEach(function (t, ti) {
      if (!t.final) return;
      var acc = 0;
      t.steps.forEach(function (h) {
        acc += h;
        var d = dateAfterHours(mainEnd, acc, c, 1);
        if (d === null) unknown = true;
        byTrack[ti].push(d);
      });
      total += acc;
    });

    var done = mainEnd;
    tracks.forEach(function (t, ti) {
      if (!t.final) return;
      var arr = byTrack[ti];
      var last = arr.length ? arr[arr.length - 1] : null;
      if (last && last > done) done = last;
    });
    return { done: unknown ? null : done, byTrack: byTrack, totalHours: total };
  }

  /**
   * 下限・標準・上限の 3 本を出す。
   * @param {Array} tracks [{final, bands:[{min,mid,max,unverified}]}]
   */
  function plan3(tracks, cap, today) {
    var pick = function (key) {
      return tracks.map(function (t) {
        return { final: t.final, steps: t.bands.map(function (b) { return b[key]; }) };
      });
    };
    var unverified = 0;
    tracks.forEach(function (t) {
      t.bands.forEach(function (b) { if (b.unverified) unverified++; });
    });
    return {
      min: schedule(pick("min"), cap, today),
      mid: schedule(pick("mid"), cap, today),
      max: schedule(pick("max"), cap, today),
      unverified: unverified
    };
  }

  /* ============================================================
     保存（この端末の中だけ）
     ============================================================ */

  /** 旧形式 {year, hours} を現行へ移す。読めない値は既定のままにする */
  function migrate(v) {
    if (!v || typeof v !== "object") return null;
    if (v.v === STORE_VERSION) return v;
    if (typeof v.hours === "number") {
      /* v1: 平日・休日を分けていなかった。同じ時間を両方に入れ、予備日は付けない
         （既存の利用者の見え方を勝手に変えないため） */
      return { v: STORE_VERSION, year: v.year, weekday: v.hours, weekend: v.hours,
               rest: false, deadline: "kyotsu", customDate: null };
    }
    return null;
  }

  function load() {
    var raw;
    try { raw = global.localStorage.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return; }   /* 壊れていたら既定値で始める */
    v = migrate(v);
    if (!v) return;
    if (typeof v.year === "number" && v.year >= 2000 && v.year <= 2100) state.year = v.year;
    if (HOURS.indexOf(v.weekday) >= 0) state.weekday = v.weekday;
    if (HOURS.indexOf(v.weekend) >= 0) state.weekend = v.weekend;
    if (typeof v.rest === "boolean") state.rest = v.rest;
    if (Object.prototype.hasOwnProperty.call(DEADLINES, v.deadline)) state.deadline = v.deadline;
    if (typeof v.customDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.customDate)) state.customDate = v.customDate;
  }

  function save() {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify({
        v: STORE_VERSION, year: state.year, weekday: state.weekday, weekend: state.weekend,
        rest: state.rest, deadline: state.deadline, customDate: state.customDate
      }));
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
    ".pace__f select,.pace__f input[type=date]{font-family:inherit;font-size:12.5px;font-weight:700;color:var(--ink);padding:7px 9px;min-height:44px;border:1px solid var(--line-d);border-radius:5px;background:var(--surface)}",
    ".pace__f input[type=checkbox]{width:20px;height:20px;accent-color:var(--indigo,#24427C)}",
    ".pace__verdict{margin-top:11px;font-size:13px;line-height:1.75;color:var(--ink-2)}",
    ".pace__verdict b{font-weight:800;color:var(--ink)}",
    ".pace__badge{display:inline-block;margin-right:8px;padding:3px 9px;border-radius:3px;font-size:11px;font-weight:800;letter-spacing:.04em;color:#fff}",
    ".pace__badge.ok{background:var(--ok,#2F6E4F)}",
    ".pace__badge.tight{background:var(--gold,#946200)}",
    ".pace__badge.over{background:var(--accent,#B5432A)}",
    ".pace__range{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px}",
    ".pace__range div{flex:1 1 150px;padding:8px 10px;border:1px solid var(--line);border-radius:4px;background:var(--bg)}",
    ".pace__range dt{font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em}",
    ".pace__range dd{margin:2px 0 0;font-size:13px;font-weight:800;color:var(--ink)}",
    ".pace__note{margin-top:8px;font-size:11.5px;line-height:1.7;color:var(--muted-2)}",
    ".pace__warn{margin-top:8px;font-size:11.5px;line-height:1.7;color:var(--ink-2);border-left:3px solid var(--line-2);padding-left:9px}",
    ".cn-due{display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:2px 8px;border-radius:3px;background:var(--surface-3);font-family:var(--mono);font-size:10px;font-weight:600;color:var(--ink-2);letter-spacing:.03em}",
    ".climb-node.start .cn-due{background:var(--accent,#B5432A);color:#fff}",
    "@media(prefers-reduced-motion:reduce){.pace *{transition:none!important;animation:none!important}}"
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
  /**
   * この端末に残っている進捗を、その段の想定時間へ反映する。
   *
   * **幅を壊さない。** 下限・標準・上限の 3 本すべてに**同じ係数**を掛ける。
   * 片方だけに掛けると、幅そのものが嘘になる。
   *
   * 係数は assets/js/progress.js が決める（完了 0 / 学習中は 1−p/100 /
   * 進捗率が不明・保留・未着手は 1）。progress.js を読み込んでいない画面では
   * 何もしない（係数 1 と同じ）。
   */
  function applyProgress(el, band) {
    var P = global.RTProgress;
    if (!P || typeof P.factorFor !== "function") return band;
    var bookId = el.getAttribute("data-book-id");
    var subjectId = el.getAttribute("data-subject-id");
    if (!bookId || !subjectId) return band;
    var f = P.factorFor(subjectId, bookId);
    if (f === 1) return band;
    return {
      min: band.min * f, mid: band.mid * f, max: band.max * f,
      unverified: band.unverified, done: f === 0
    };
  }

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
      var band = parseBand(el.getAttribute("data-hours"), h);
      if (band.unverified) {
        /* 想定時間が数値で書かれていない。日程には入れないが、件数は数える。
           **進捗を付けてもここの扱いは変えない。**「合計は下限」の断りが要る点は同じ */
        tracks[tracks.length - 1].nodes.push({ el: el, band: band, skip: true });
        continue;
      }
      if (!(h > 0)) continue;
      band = applyProgress(el, band);
      if (band.done) {
        /* この端末で「完了」にした本。残り時間は 0 なので日程から外す。
           画面上は .active のままなので、二重に控除することはない
           （pace が数えるのは .active だけで、S.done の本は最初から入らない） */
        tracks[tracks.length - 1].nodes.push({ el: el, band: band, skip: false, finished: true });
        continue;
      }
      tracks[tracks.length - 1].nodes.push({ el: el, band: band, skip: false });
    }
    return tracks.filter(function (t) { return t.nodes.length; });
  }

  /* ============================================================
     描画
     ============================================================ */

  function hourOpts(sel) {
    return HOURS.map(function (h) {
      return '<option value="' + h + '"' + (h === sel ? " selected" : "") + ">"
        + fmtHours(h) + " 時間</option>";
    }).join("");
  }

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

    var dlOpts = Object.keys(DEADLINES).map(function (k) {
      return '<option value="' + k + '"' + (k === state.deadline ? " selected" : "") + ">"
        + esc(DEADLINES[k].label) + "</option>";
    }).join("");

    return '<div class="pace__head">'
      + '<span class="pace__t">PACE — 進めるペース</span>'
      + '<label class="pace__f">受験<select onchange="RTPace.setYear(this.value)">' + yearOpts + "</select></label>"
      + '<label class="pace__f">締切<select onchange="RTPace.setDeadline(this.value)">' + dlOpts + "</select></label>"
      + (state.deadline === "custom"
        ? '<label class="pace__f">日付<input type="date" value="' + esc(state.customDate || "")
          + '" onchange="RTPace.setCustomDate(this.value)"></label>'
        : "")
      + '<label class="pace__f">平日<select onchange="RTPace.setWeekday(this.value)">' + hourOpts(state.weekday) + "</select></label>"
      + '<label class="pace__f">休日<select onchange="RTPace.setWeekend(this.value)">' + hourOpts(state.weekend) + "</select></label>"
      + '<label class="pace__f"><input type="checkbox"' + (state.rest ? " checked" : "")
      + ' onchange="RTPace.setRest(this.checked)">週1日は予備日</label>'
      + "</div>";
  }

  /** 「2027年5月上旬 〜 2027年8月中旬」。片方でも出せなければ null */
  function rangeLabel(a, b) {
    if (!a || !b) return null;
    var la = label(a), lb = label(b);
    return la === lb ? la : la + " 〜 " + lb;
  }

  function verdictHTML(p, now) {
    var due = deadlineDate(state.year, state.deadline, state.customDate);
    var dlLabel = (DEADLINES[state.deadline] || DEADLINES.kyotsu).label;

    if (!p.mid.done) {
      return '<div class="pace__verdict">1 日に使える時間が 0 のままなので、完了の見込みを出せません。'
        + "平日または休日の時間を設定してください。</div>";
    }

    var slack = (due - p.mid.done) / 86400000;
    var badge, line;
    if (slack >= 30) {
      badge = '<span class="pace__badge ok">標準見積もりでは余裕あり</span>';
      line = "標準の見積もりでは <b>" + esc(label(p.mid.done)) + "</b> に完走し、"
        + dlLabel + "まで <b>約" + Math.floor(slack / 30.4) + " か月</b>残ります。";
    } else if (slack >= 0) {
      badge = '<span class="pace__badge tight">標準見積もりでは余裕が少ない</span>';
      line = "標準の見積もりでは <b>" + esc(label(p.mid.done)) + "</b> の完走で、"
        + dlLabel + "までの余裕は <b>約" + Math.max(1, Math.floor(slack)) + " 日</b>です。"
        + "時間を増やすか、学習方針を「時短・精選型」に切り替えると幅が広がります。";
    } else {
      var over = -slack;
      var overLabel = over < 31 ? "約" + Math.ceil(over) + " 日" : "約" + Math.ceil(over / 30.4) + " か月";
      badge = '<span class="pace__badge over">標準見積もりでは締切を過ぎる</span>';
      line = "標準の見積もりでは完走が <b>" + esc(label(p.mid.done)) + "</b> になり、"
        + dlLabel + "を <b>" + overLabel + "</b>過ぎます。"
        + "学習方針を「時短・精選型」にするか、1 日の時間を見直してください。";
    }

    var cells = [
      ["最短（想定時間の下限）", p.min.done ? label(p.min.done) : "—", p.min.totalHours],
      ["標準", p.mid.done ? label(p.mid.done) : "—", p.mid.totalHours],
      ["余裕（想定時間の上限）", p.max.done ? label(p.max.done) : "—", p.max.totalHours]
    ].map(function (c) {
      return "<div><dt>" + esc(c[0]) + "</dt><dd>" + esc(c[1]) + "</dd>"
        + '<dt style="margin-top:4px">残り時間</dt><dd style="font-size:12px">約 '
        + Math.round(c[2]) + " 時間</dd></div>";
    }).join("");

    var warn = p.unverified > 0
      ? '<p class="pace__warn"><b>' + p.unverified + " 冊</b>は想定学習時間が数値で登録されていないため、"
        + "この計算に含めていません。<b>表示している合計は下限</b>で、実際にはこれより時間がかかります。</p>"
      : "";

    return '<div class="pace__verdict">' + badge + line + "</div>"
      + '<div class="pace__range">' + cells + "</div>"
      + warn
      + '<p class="pace__note">' + esc(String(state.year)) + " 年の" + esc(dlLabel)
      + "（" + esc(label(due)) + "ごろ）を締切に置いた<b>目安</b>です。試験日は年度・大学で変わるので、"
      + "実際の日程は必ず公式発表で確認してください。"
      + "平日 " + fmtHours(state.weekday) + " 時間・休日 " + fmtHours(state.weekend) + " 時間"
      + (state.rest ? "・週 1 日は予備日" : "（予備日なし）")
      + "で計算し、分野が複数あるときは時間を等分して並行に進める前提にしています。"
      + "単語帳などの並行枠と、すでに終えた段はこの時間に含みません。"
      + "参考書の想定学習時間はもともと幅のある推定値なので、上の 3 本も幅として読んでください。</p>";
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
    var cap = { weekday: state.weekday, weekend: state.weekend, rest: state.rest };

    /* 日程に入れる段だけを取り出す。想定時間が数値で無い段は件数だけ数える */
    var planTracks = tracks.map(function (t) {
      return { final: t.final, bands: t.nodes.filter(function (n) { return !n.skip; }).map(function (n) { return n.band; }) };
    }).filter(function (t) { return t.bands.length; });
    var unverified = 0;
    tracks.forEach(function (t) { t.nodes.forEach(function (n) { if (n.skip) unverified++; }); });

    var p = plan3(planTracks, cap, now);
    p.unverified = unverified;

    /* 各段に「いつまでに」を書き込む。前回の描画で付いたものは消してから */
    var stale = out.querySelectorAll(".cn-due");
    for (var i = 0; i < stale.length; i++) stale[i].remove();

    var ti = 0;
    tracks.forEach(function (t) {
      var counted = t.nodes.filter(function (n) { return !n.skip; });
      if (!counted.length) return;
      counted.forEach(function (n, ni) {
        var info = n.el.querySelector(".cn-info");
        if (!info) return;
        if (n.finished) {
          var doneSpan = doc.createElement("span");
          doneSpan.className = "cn-due";
          doneSpan.textContent = "この端末で完了にしています";
          info.appendChild(doneSpan);
          return;
        }
        var lo = p.min.byTrack[ti] && p.min.byTrack[ti][ni];
        var hi = p.max.byTrack[ti] && p.max.byTrack[ti][ni];
        var txt = rangeLabel(lo, hi);
        if (!txt) return;
        var span = doc.createElement("span");
        span.className = "cn-due";
        /* 一点断定を避けるため「目安」と幅の両方を出す */
        span.textContent = "完了の目安 " + txt;
        info.appendChild(span);
      });
      t.nodes.forEach(function (n) {
        if (!n.skip) return;
        var info = n.el.querySelector(".cn-info");
        if (!info) return;
        var span = doc.createElement("span");
        span.className = "cn-due";
        span.textContent = "想定時間 未登録";
        info.appendChild(span);
      });
      ti++;
    });

    var box = doc.createElement("div");
    box.className = "pace";
    box.innerHTML = controlsHTML()
      + (p.mid.totalHours > 0 || unverified > 0
        ? verdictHTML(p, now)
        : '<div class="pace__verdict">この条件では残っている教材がありません。過去問演習に進んでください。</div>');
    summary.parentNode.insertBefore(box, summary.nextSibling);
  }

  function setYear(v) {
    var y = parseInt(v, 10);
    if (!(y >= 2000 && y <= 2100)) return;
    state.year = y; save(); apply();
  }

  function setWeekday(v) {
    var h = parseFloat(v);
    if (HOURS.indexOf(h) < 0) return;
    state.weekday = h; save(); apply();
  }

  function setWeekend(v) {
    var h = parseFloat(v);
    if (HOURS.indexOf(h) < 0) return;
    state.weekend = h; save(); apply();
  }

  function setRest(v) { state.rest = !!v; save(); apply(); }

  function setDeadline(v) {
    if (!Object.prototype.hasOwnProperty.call(DEADLINES, v)) return;
    state.deadline = v; save(); apply();
  }

  function setCustomDate(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return;
    state.customDate = String(v); save(); apply();
  }

  /** 旧 API。平日・休日をまとめて設定する（旧ページから呼ばれても壊れないように残す） */
  function setHours(v) {
    var h = parseFloat(v);
    if (HOURS.indexOf(h) < 0) return;
    state.weekday = h; state.weekend = h; save(); apply();
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
    setWeekday: setWeekday,
    setWeekend: setWeekend,
    setRest: setRest,
    setDeadline: setDeadline,
    setCustomDate: setCustomDate,
    /* テスト用。画面側からは使わない */
    __test: {
      schedule: schedule,
      plan3: plan3,
      parseBand: parseBand,
      capacityOn: capacityOn,
      weeklyHours: weeklyHours,
      deadlineDate: deadlineDate,
      migrate: migrate,
      examDate: examDate,
      defaultYear: defaultYear,
      label: label,
      HOURS: HOURS,
      DEADLINES: DEADLINES,
      state: state
    }
  };

  global.RTPace = RTPace;
  if (typeof module !== "undefined" && module.exports) module.exports = RTPace;
})(typeof window !== "undefined" ? window : globalThis);
