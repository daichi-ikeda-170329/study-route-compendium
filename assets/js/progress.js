/**
 * 学習の進み具合を、この端末の中だけに残す。
 *
 * **ネットワークへは 1 バイトも出さない。** 解析にも URL にも入れない。
 * 共有 URL に載るのは基礎診断の結果だけで、ここで扱う進捗は共有されない。
 *
 * ## 保存の場所
 *
 * `localStorage` の `rt_learning_progress`。既存の `rt_saved_routes`（保存したルート）と
 * `rt_pace`（学習ペースの設定）とは**別のキー**にする。既存データを読み替えたり
 * 上書きしたりしない。
 *
 * ## 形
 *
 *     {
 *       "version": 1,
 *       "updatedAt": "ISO-8601",
 *       "books": {
 *         "math:aoChart": {
 *           "status": "in_progress",     // not_started | in_progress | completed | on_hold
 *           "progressPercent": 40,       // 任意。0〜100 の整数
 *           "currentLocation": "第3章",  // 任意。120 文字以下のプレーンテキスト
 *           "startedAt": "2026-09-01",   // 任意。YYYY-MM-DD
 *           "updatedAt": "ISO-8601"
 *         }
 *       },
 *       "weeklyGoal": { "value": 7, "unit": "hours" },
 *       "plans": []
 *     }
 *
 * ## 目標未達を責めない
 *
 * 週の目標に届かなかったことを合否や失敗として表示しない。
 * 受験勉強は体調にも学校行事にも左右される。**届かなかった事実だけを出す。**
 *
 * ## 壊れたデータを黙って上書きしない
 *
 * 読めない値が入っていたら、いきなり書き換えずに `damaged` として持ち上げる。
 * 画面側は「生データをダウンロード」と「初期化」を選ばせる。
 * 黙って消すと、利用者が積み上げた記録が理由も分からず消える。
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'rt_learning_progress';
  var VERSION = 1;

  /** 状態は 4 つだけ。表示名も 1 か所に置く */
  var STATUS = ['not_started', 'in_progress', 'completed', 'on_hold'];
  var STATUS_LABEL = {
    not_started: '未着手',
    in_progress: '学習中',
    completed: '完了',
    on_hold: '保留',
  };

  /** 週目標の単位。自由入力にしない（表記が揺れると集計できない） */
  var UNITS = ['hours', 'pages', 'questions', 'chapters'];
  var UNIT_LABEL = { hours: '時間', pages: 'ページ', questions: '問', chapters: '章' };

  /** 取り込む JSON の上限。1MiB を超えるものは読まない */
  var IMPORT_MAX_BYTES = 1024 * 1024;

  /** 現在地のメモの長さ。長文を保存する場所ではない */
  var LOCATION_MAX = 120;

  var state = null;      // 読み込んだ内容
  var damaged = null;    // 壊れていたときの生データ
  var storageOK = null;  // localStorage が使えるか（1 度だけ確かめる）

  function emptyStore() {
    return { version: VERSION, updatedAt: null, books: {}, weeklyGoal: null, plans: [] };
  }

  function canStore() {
    if (storageOK !== null) return storageOK;
    try {
      var k = '__rt_probe__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      storageOK = true;
    } catch (e) {
      storageOK = false;
    }
    return storageOK;
  }

  /* ============================================================
     検査

     取り込みと読み込みで**同じ検査**を通す。片方だけ緩いと、
     取り込み経路から壊れた値が入る。
     ============================================================ */

  function isPlainObject(v) {
    return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  }

  /** "科目:書籍ID"。科目も書籍 ID も URL に使える文字だけ */
  function validKey(k) {
    return typeof k === 'string' && /^[a-z0-9]+:[A-Za-z0-9][A-Za-z0-9_-]*$/.test(k);
  }

  function validDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
  }

  function validIso(v) {
    return typeof v === 'string' && !isNaN(Date.parse(v));
  }

  /**
   * 1 冊分を検査する。問題があれば理由を返す（null なら合格）。
   * **不明を 0 や空文字で埋めない。** 分からない項目は持たせない。
   */
  function checkEntry(e) {
    if (!isPlainObject(e)) return 'オブジェクトでない';
    if (STATUS.indexOf(e.status) < 0) return 'status が ' + JSON.stringify(e.status);
    if (e.progressPercent !== undefined && e.progressPercent !== null) {
      if (typeof e.progressPercent !== 'number' || !isFinite(e.progressPercent)
        || Math.floor(e.progressPercent) !== e.progressPercent
        || e.progressPercent < 0 || e.progressPercent > 100) {
        return 'progressPercent が 0〜100 の整数でない';
      }
    }
    if (e.currentLocation !== undefined && e.currentLocation !== null) {
      if (typeof e.currentLocation !== 'string') return 'currentLocation が文字列でない';
      if (e.currentLocation.length > LOCATION_MAX) return 'currentLocation が ' + LOCATION_MAX + ' 文字を超えている';
    }
    if (e.startedAt !== undefined && e.startedAt !== null && !validDate(e.startedAt)) {
      return 'startedAt が YYYY-MM-DD でない';
    }
    if (e.updatedAt !== undefined && e.updatedAt !== null && !validIso(e.updatedAt)) {
      return 'updatedAt が日時として読めない';
    }
    return null;
  }

  function checkWeeklyGoal(g) {
    if (g === null || g === undefined) return null;
    if (!isPlainObject(g)) return 'weeklyGoal がオブジェクトでない';
    if (typeof g.value !== 'number' || !isFinite(g.value) || g.value <= 0 || g.value > 10000) {
      return 'weeklyGoal.value が 0 より大きい数でない';
    }
    if (UNITS.indexOf(g.unit) < 0) return 'weeklyGoal.unit が ' + UNITS.join(' / ') + ' のいずれかでない';
    return null;
  }

  /**
   * 取り込み用の検査。**中身を変えずに、通るものと弾いたものを分けて返す。**
   * @returns {{ok:boolean, reason?:string, store?:object, skipped:string[]}}
   */
  function validateStore(raw) {
    var skipped = [];
    if (!isPlainObject(raw)) return { ok: false, reason: 'JSON のトップレベルがオブジェクトでない', skipped: skipped };
    if (raw.version !== VERSION) {
      return { ok: false, reason: 'version が ' + JSON.stringify(raw.version) + '。この画面が読めるのは ' + VERSION, skipped: skipped };
    }
    if (!isPlainObject(raw.books)) return { ok: false, reason: 'books がオブジェクトでない', skipped: skipped };

    var goalReason = checkWeeklyGoal(raw.weeklyGoal);
    if (goalReason) return { ok: false, reason: goalReason, skipped: skipped };

    var books = {};
    var keys = Object.keys(raw.books);
    if (keys.length > 5000) return { ok: false, reason: '書籍の件数が多すぎる（' + keys.length + '）', skipped: skipped };

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!validKey(k)) { skipped.push(k); continue; }
      var reason = checkEntry(raw.books[k]);
      if (reason) { skipped.push(k); continue; }
      var e = raw.books[k];
      var out = { status: e.status };
      if (typeof e.progressPercent === 'number') out.progressPercent = e.progressPercent;
      if (typeof e.currentLocation === 'string' && e.currentLocation) out.currentLocation = e.currentLocation;
      if (validDate(e.startedAt)) out.startedAt = e.startedAt;
      if (validIso(e.updatedAt)) out.updatedAt = e.updatedAt;
      books[k] = out;
    }

    return {
      ok: true,
      skipped: skipped,
      store: {
        version: VERSION,
        updatedAt: validIso(raw.updatedAt) ? raw.updatedAt : null,
        books: books,
        weeklyGoal: raw.weeklyGoal || null,
        plans: [],
      },
    };
  }

  /* ============================================================
     読み書き
     ============================================================ */

  function load() {
    if (state) return state;
    damaged = null;
    if (!canStore()) { state = emptyStore(); return state; }

    var raw;
    try { raw = global.localStorage.getItem(STORE_KEY); } catch (e) { state = emptyStore(); return state; }
    if (!raw) { state = emptyStore(); return state; }

    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      // **黙って上書きしない。** 画面側が「取り出す / 初期化する」を選ばせる
      damaged = { raw: raw, reason: 'JSON として読めない' };
      state = emptyStore();
      return state;
    }
    var res = validateStore(parsed);
    if (!res.ok) {
      damaged = { raw: raw, reason: res.reason };
      state = emptyStore();
      return state;
    }
    state = res.store;
    if (res.skipped.length) {
      // 読めた分だけ使い、落とした件数は画面へ出す（黙って捨てない）
      damaged = { raw: raw, reason: '一部の項目を読めなかった', skipped: res.skipped };
    }
    return state;
  }

  function persist() {
    if (!canStore()) return false;
    state.updatedAt = new Date().toISOString();
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;   // 容量超過など。画面側が「保存できなかった」と出す
    }
  }

  /* ============================================================
     画面から使う入口
     ============================================================ */

  function key(subjectId, bookId) { return String(subjectId) + ':' + String(bookId); }

  /** 1 冊の状態。登録が無ければ null（「未着手」と決めつけない） */
  function get(subjectId, bookId) {
    var s = load();
    var e = s.books[key(subjectId, bookId)];
    return e ? JSON.parse(JSON.stringify(e)) : null;
  }

  /**
   * 1 冊の状態を書く。`status` を null にすると登録そのものを消す。
   * @returns {{ok:boolean, reason?:string}}
   */
  function set(subjectId, bookId, patch) {
    var s = load();
    var k = key(subjectId, bookId);
    if (!validKey(k)) return { ok: false, reason: '科目または書籍 ID に使えない文字がある' };

    if (!patch || patch.status === null) {
      delete s.books[k];
      return { ok: persist(), reason: undefined };
    }

    var cur = s.books[k] || {};
    var next = { status: patch.status !== undefined ? patch.status : (cur.status || 'not_started') };

    var pct = patch.progressPercent !== undefined ? patch.progressPercent : cur.progressPercent;
    if (pct !== undefined && pct !== null) next.progressPercent = pct;

    var loc = patch.currentLocation !== undefined ? patch.currentLocation : cur.currentLocation;
    if (loc) next.currentLocation = String(loc).slice(0, LOCATION_MAX);

    var started = patch.startedAt !== undefined ? patch.startedAt : cur.startedAt;
    if (started) next.startedAt = started;
    // 「学習中」へ移った日を、まだ持っていなければ入れる
    if (!next.startedAt && next.status === 'in_progress') {
      next.startedAt = new Date().toISOString().slice(0, 10);
    }
    next.updatedAt = new Date().toISOString();

    var reason = checkEntry(next);
    if (reason) return { ok: false, reason: reason };

    s.books[k] = next;
    return { ok: persist() };
  }

  /** 週の目標。null で解除 */
  function setWeeklyGoal(goal) {
    var s = load();
    var reason = checkWeeklyGoal(goal);
    if (reason) return { ok: false, reason: reason };
    s.weeklyGoal = goal || null;
    return { ok: persist() };
  }

  /** 登録されているものをすべて返す（複製） */
  function all() {
    return JSON.parse(JSON.stringify(load()));
  }

  /** 壊れていたときの情報。無ければ null */
  function damagedInfo() {
    load();
    return damaged ? JSON.parse(JSON.stringify(damaged)) : null;
  }

  /** 進捗だけを消す。ほかのキー（rt_saved_routes / rt_pace）には触らない */
  function clear() {
    state = emptyStore();
    damaged = null;
    if (!canStore()) return false;
    try { global.localStorage.removeItem(STORE_KEY); return true; } catch (e) { return false; }
  }

  /* ============================================================
     取り出しと取り込み
     ============================================================ */

  /** 書き出す中身。**診断の履歴・検索語・解析 ID を混ぜない。** */
  function exportData() {
    var s = load();
    return {
      version: VERSION,
      updatedAt: s.updatedAt,
      books: JSON.parse(JSON.stringify(s.books)),
      weeklyGoal: s.weeklyGoal ? JSON.parse(JSON.stringify(s.weeklyGoal)) : null,
      plans: [],
    };
  }

  /**
   * 取り込む前の下見。**この時点では localStorage を一切変えない。**
   * @param {string} text 読み込んだ JSON 文字列
   * @param {function} [known] (subjectId, bookId) => boolean。現行データに在るか
   */
  function previewImport(text, known) {
    if (typeof text !== 'string') return { ok: false, reason: '文字列でない' };
    // バイト数で見る（文字数では日本語を含むファイルを取りこぼす）
    var size = global.TextEncoder ? new global.TextEncoder().encode(text).length : text.length;
    if (size > IMPORT_MAX_BYTES) {
      return { ok: false, reason: 'ファイルが大きすぎる（' + size + ' バイト / 上限 ' + IMPORT_MAX_BYTES + '）' };
    }

    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, reason: 'JSON として読めない' }; }

    var res = validateStore(parsed);
    if (!res.ok) return { ok: false, reason: res.reason };

    var cur = load();
    var unknownIds = [];
    var books = {};
    Object.keys(res.store.books).forEach(function (k) {
      var parts = k.split(':');
      if (typeof known === 'function' && !known(parts[0], parts.slice(1).join(':'))) {
        unknownIds.push(k);   // 掲載していない ID。件数だけ出して取り込まない
        return;
      }
      books[k] = res.store.books[k];
    });

    var added = 0, changed = 0, same = 0;
    Object.keys(books).forEach(function (k) {
      var before = cur.books[k];
      if (!before) { added++; return; }
      if (JSON.stringify(before) === JSON.stringify(books[k])) same++; else changed++;
    });

    return {
      ok: true,
      store: { version: VERSION, updatedAt: res.store.updatedAt, books: books, weeklyGoal: res.store.weeklyGoal, plans: [] },
      counts: {
        incoming: Object.keys(books).length,
        added: added, changed: changed, same: same,
        unknown: unknownIds.length,
        malformed: res.skipped.length,
        currentTotal: Object.keys(cur.books).length,
      },
      unknownIds: unknownIds.slice(0, 20),
    };
  }

  /**
   * 下見の結果を実際に反映する。
   * @param {object} preview previewImport() の戻り値
   * @param {'merge'|'replace'} mode 統合するか、置き換えるか
   *
   * **検査に落ちた取り込みは localStorage を一切変えない。**
   */
  function commitImport(preview, mode) {
    if (!preview || !preview.ok) return { ok: false, reason: '取り込める内容ではない' };
    if (mode !== 'merge' && mode !== 'replace') return { ok: false, reason: 'mode が merge / replace でない' };

    var s = load();
    if (mode === 'replace') {
      s.books = JSON.parse(JSON.stringify(preview.store.books));
      s.weeklyGoal = preview.store.weeklyGoal || null;
    } else {
      Object.keys(preview.store.books).forEach(function (k) {
        s.books[k] = preview.store.books[k];
      });
      if (preview.store.weeklyGoal && !s.weeklyGoal) s.weeklyGoal = preview.store.weeklyGoal;
    }
    damaged = null;
    return { ok: persist(), counts: preview.counts };
  }

  /* ============================================================
     残り時間

     **幅を壊さない。** assets/js/pace.js は下限・上限の 2 本を持ち、
     想定時間が未確認の教材は合計から外して「合計は下限」と出している。
     進捗を掛けるときも下限・上限の**両方**に同じ係数を掛ける。
     ============================================================ */

  /**
   * その 1 冊に残っている割合（0〜1）。
   *
   *   completed                  … 0（下限・上限とも）
   *   in_progress かつ percent   … 1 - p/100
   *   in_progress で percent 不明 … 1（保守的に全部残す）
   *   on_hold                    … 1（再開まで完了日を断定しない）
   *   not_started / 登録なし      … 1
   */
  function remainingFactor(entry) {
    if (!entry || STATUS.indexOf(entry.status) < 0) return 1;
    if (entry.status === 'completed') return 0;
    if (entry.status === 'in_progress' && typeof entry.progressPercent === 'number') {
      return Math.max(0, Math.min(1, 1 - entry.progressPercent / 100));
    }
    return 1;
  }

  /** 科目 + 書籍 ID から係数を引く。pace.js から呼ぶ */
  function factorFor(subjectId, bookId) {
    return remainingFactor(get(subjectId, bookId));
  }

  /* ============================================================
     週次の見直し

     **決定的な規則で選ぶ。** 実行するたびに違うものが出ると、
     「先週なんて言われたか」を確かめられない。
     ============================================================ */

  /**
   * 次に手を付けるとよい 1〜3 件。
   * 学習中を先、次に未着手。同じ状態の中では更新の新しい順、それも同じなら ID 順。
   * @param {Array} candidates [{subjectId, bookId, name}]
   */
  function weeklyPicks(candidates, limit) {
    var max = limit || 3;
    var s = load();
    var rank = { in_progress: 0, not_started: 1, on_hold: 2, completed: 3 };
    var rows = (candidates || []).map(function (c) {
      var e = s.books[key(c.subjectId, c.bookId)];
      return {
        subjectId: c.subjectId, bookId: c.bookId, name: c.name,
        status: e ? e.status : 'not_started',
        updatedAt: e && e.updatedAt ? e.updatedAt : '',
      };
    }).filter(function (r) { return r.status !== 'completed'; });

    rows.sort(function (a, b) {
      var d = (rank[a.status] === undefined ? 9 : rank[a.status]) - (rank[b.status] === undefined ? 9 : rank[b.status]);
      if (d) return d;
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return a.bookId < b.bookId ? -1 : (a.bookId > b.bookId ? 1 : 0);
    });
    return rows.slice(0, max);
  }

  /** 集計。画面の見出しに出す */
  function summary() {
    var s = load();
    var out = { not_started: 0, in_progress: 0, completed: 0, on_hold: 0, total: 0 };
    Object.keys(s.books).forEach(function (k) {
      var st = s.books[k].status;
      if (out[st] !== undefined) out[st]++;
      out.total++;
    });
    return out;
  }

  var RTProgress = {
    STORE_KEY: STORE_KEY,
    VERSION: VERSION,
    STATUS: STATUS,
    STATUS_LABEL: STATUS_LABEL,
    UNITS: UNITS,
    UNIT_LABEL: UNIT_LABEL,
    LOCATION_MAX: LOCATION_MAX,
    IMPORT_MAX_BYTES: IMPORT_MAX_BYTES,

    get: get,
    set: set,
    all: all,
    clear: clear,
    damagedInfo: damagedInfo,
    setWeeklyGoal: setWeeklyGoal,
    summary: summary,

    exportData: exportData,
    previewImport: previewImport,
    commitImport: commitImport,

    remainingFactor: remainingFactor,
    factorFor: factorFor,
    weeklyPicks: weeklyPicks,

    /* テスト用。画面側からは使わない */
    __test: {
      validateStore: validateStore,
      checkEntry: checkEntry,
      checkWeeklyGoal: checkWeeklyGoal,
      validKey: validKey,
      reset: function () { state = null; damaged = null; storageOK = null; },
    },
  };

  global.RTProgress = RTProgress;
  if (typeof module !== 'undefined' && module.exports) module.exports = RTProgress;
})(typeof window !== 'undefined' ? window : globalThis);
