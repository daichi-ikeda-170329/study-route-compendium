/**
 * 解析イベントの送信口。**ここを通らない送信を作らない。**
 *
 * 受験生の志望校・学部・偏差値・回答・既習教材は、本人がこの端末で入力した
 * 情報であって、広告や解析のために外へ出してよいものではない。ところが
 * gtag() をその場で呼ぶ書き方だと、「この 1 か所だけ」と足された値が
 * いつのまにか外へ出る。防ぐのは注意ではなく仕組みなので、
 *
 *   1. 送ってよいイベント名を allowlist で持つ
 *   2. イベントごとに送ってよいパラメータ名を持つ
 *   3. 値の形も検査する（未知の値は落とす）
 *
 * の 3 つで閉じる。allowlist に無いものは黙って落とし、開発環境では理由を出す。
 *
 * **送ってはいけないもの**（契約は docs/analytics-events.md）
 *   - 大学名・学部名・偏差値・得点・模試名
 *   - 完了済み教材の id の配列・回答内容・自由入力
 *   - 共有 URL の query / hash 全体
 *   - localStorage の値
 *   - 検索語をそのまま（許可済みの固定 id へ変換していないもの）
 */
(function (global) {
  "use strict";

  /** 収録している科目。subject_id はこの 7 つだけ */
  var SUBJECTS = ['english', 'japanese', 'math', 'science', 'social', 'joho', 'shoron'];

  /** id として通す形。書籍 id・フィルタ id に使う */
  var ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

  /** 値の検査。通らなければそのパラメータを落とす */
  var CHECK = {
    subject_id: function (v) { return SUBJECTS.indexOf(v) >= 0; },
    book_id: function (v) { return typeof v === 'string' && ID_RE.test(v); },
    filter_id: function (v) { return typeof v === 'string' && ID_RE.test(v); },
    store: function (v) { return v === 'amazon' || v === 'rakuten'; },
    /* 診断・ルートの入口。自由入力ではなく画面の種類だけ */
    mode: function (v) { return ['tier', 'uni', 'quiz', 'sensei'].indexOf(v) >= 0; },
    /* 共有の経路 */
    channel: function (v) { return ['copy', 'native', 'x'].indexOf(v) >= 0; },
    kind: function (v) { return ['quiz', 'route'].indexOf(v) >= 0; },
    /* 保存先。この端末の中だけであることを記録する */
    storage: function (v) { return v === 'local'; },
    /* 復元に失敗した理由。share.js が返す固定の識別子だけを通す */
    reason: function (v) { return typeof v === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(v); }
  };

  /**
   * 送ってよいイベントと、そのイベントで送ってよいパラメータ。
   *
   * 既に配信済みの名前（book_buy_click / share_copy など）は、GA4 に貯まった
   * 集計を切らさないために残してある。**名前を足すときは
   * docs/analytics-events.md も同時に直す**（テストが両方を突き合わせる）。
   */
  var EVENTS = {
    /* 画面 */
    subject_open:   ['subject_id'],
    catalog_filter: ['subject_id', 'filter_id'],
    book_open:      ['subject_id', 'book_id'],
    /* ルート・診断 */
    route_start:    ['subject_id', 'mode'],
    route_complete: ['subject_id', 'mode'],
    route_save:     ['subject_id', 'storage'],
    /* ペース */
    pace_start:     ['subject_id'],
    pace_complete:  ['subject_id'],
    /* 共有 */
    share_copy:     ['subject_id'],
    share_native:   ['subject_id'],
    share_x:        ['subject_id'],
    route_share:    ['subject_id', 'channel'],
    shared_link_open:     ['subject_id'],
    shared_route_open:    ['subject_id'],
    shared_link_invalid:  ['subject_id', 'reason'],
    shared_route_invalid: ['subject_id', 'reason'],
    /* 収益導線 */
    affiliate_click: ['subject_id', 'book_id', 'store'],
    book_buy_click:  ['subject_id', 'book_id', 'store'],
    /* 全体検索から書籍ページへ抜けた回数。検索語そのものは送らない */
    book_search_open: ['subject_id', 'book_id']
  };

  /** 開発環境か。localhost と 127.0.0.1 では送らず、コンソールに出すだけ */
  function isDev() {
    try {
      var h = global.location && global.location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '' || /^192\.168\./.test(h || '');
    } catch (e) { return false; }
  }

  /**
   * 許可された形だけを残す。落としたものは理由とともに返す。
   * @returns {{ok:boolean, name:string, params:object, dropped:string[]}}
   */
  function sanitize(name, params) {
    var dropped = [];
    if (!Object.prototype.hasOwnProperty.call(EVENTS, name)) {
      return { ok: false, name: name, params: {}, dropped: ['event:' + name] };
    }
    var allowed = EVENTS[name];
    var out = {};
    var src = (params && typeof params === 'object') ? params : {};
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (allowed.indexOf(k) < 0) { dropped.push('param:' + k); continue; }
      var check = CHECK[k];
      if (check && !check(src[k])) { dropped.push('value:' + k); continue; }
      out[k] = src[k];
    }
    return { ok: true, name: name, params: out, dropped: dropped };
  }

  /**
   * 送る。allowlist を通らないものは送らない。
   * 計測の失敗で画面の機能を止めない（すべて try で囲う）。
   */
  function track(name, params) {
    var r = sanitize(name, params);
    if (isDev()) {
      try { (global.console || {}).info && global.console.info('[analytics]', r.ok ? 'send' : 'drop', r.name, r.params, r.dropped); } catch (e) { /* noop */ }
      return r;   /* 開発環境では送らない */
    }
    if (!r.ok) return r;
    try {
      if (typeof global.gtag === 'function') global.gtag('event', r.name, r.params);
    } catch (e) { /* 計測の失敗で機能を止めない */ }
    return r;
  }

  global.RTAnalytics = {
    track: track,
    sanitize: sanitize,
    EVENTS: EVENTS,
    SUBJECTS: SUBJECTS,
    isDev: isDev
  };
  if (typeof module === 'object' && module.exports) module.exports = global.RTAnalytics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
