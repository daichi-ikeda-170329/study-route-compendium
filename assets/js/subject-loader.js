/**
 * 科目トップのデータを取ってきて、描画コード（assets/js/subject-<科目>.js）を起動する。
 *
 * もとは 1 枚の HTML にデータも描画コードも入っていた（理科で 815KB）。
 * HTML の解析がそこで止まるため LCP が 10 秒台になっていた。いまは
 *
 *   1. HTML には markup と、事前描画済みの図鑑カード 18 枚だけが入っている
 *   2. window.RT_SUBJECT_ASSETS（ビルド時に HTML へインラインで埋める）が取得先を持つ
 *   3. このファイルがデータを取り、window.RT_SUBJECT_APP(DATA) を呼ぶ
 *
 * **JS が動かない環境でも、科目概要と代表カード 18 枚は読める。**
 * 全冊の索引は /<科目>/books/ が静的に持っている。
 *
 * ## キャッシュ
 *
 * ファイル名は固定で、`?v=<内容ハッシュ>` だけが変わる。GitHub Pages は
 * ヘッダーを制御できないので、「ハッシュ付きファイル名 + 別 manifest を fetch」
 * にすると manifest だけ古くキャッシュされたときに壊れる。manifest は HTML へ
 * インラインで埋めてあるので、その経路自体が無い。
 *
 * ## 失敗したとき
 *
 * 無限スピナーにしない。再試行ボタンと、JS 無しでも辿れる通常リンクを出し、
 * aria-live で読み上げる。読み込み中の領域は高さを確保して CLS を出さない。
 */
(function () {
  'use strict';

  var M = window.RT_SUBJECT_ASSETS;
  if (!M || !M.files) return;

  var SCHEMA = 1;
  var statusEl = null;
  var controller = null;
  var booted = false;
  /** 同じアセットへの並行要求を 1 本にまとめる */
  var inflight = {};

  function status() {
    if (!statusEl) statusEl = document.getElementById('rtLoadStatus');
    return statusEl;
  }

  /** 読み込み中・失敗を伝える。textContent で入れる（innerHTML を使わない） */
  function say(text, withRetry) {
    var el = status();
    if (!el) return;
    el.textContent = '';
    if (!text) { el.hidden = true; return; }
    el.hidden = false;

    var p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);

    if (withRetry) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rt-load-retry';
      b.textContent = 'もう一度読み込む';
      b.addEventListener('click', function () { start(); });
      el.appendChild(b);

      var a = document.createElement('a');
      a.className = 'rt-load-alt';
      a.href = '/' + M.subject + '/books/';
      a.textContent = '参考書の一覧ページを開く';
      el.appendChild(a);
    }
  }

  function fetchAsset(kind) {
    if (inflight[kind]) return inflight[kind];
    var url = M.files[kind];
    if (!url) return Promise.resolve(null);
    var p = fetch(url, { signal: controller.signal, credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error(kind + ': HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json.schemaVersion !== SCHEMA) {
          // 別の版のデータを混ぜて描かない。古い科目のデータを出すより、読み直しを促す
          throw new Error(kind + ': データの版が違う（' + json.schemaVersion + '）');
        }
        if (json.subject !== M.subject) {
          throw new Error(kind + ': 別の科目のデータが返ってきた（' + json.subject + '）');
        }
        return json;
      });
    inflight[kind] = p;
    return p;
  }

  /** タプル形式の大学データを元へ戻す。build/lib/subject-assets.mjs の unpackUnis と同じ */
  function unpackUnis(packed) {
    var keys = packed.keys || [];
    var rows = packed.rows || [];
    return rows.map(function (r) {
      var o = {};
      for (var i = 0; i < keys.length; i++) o[keys[i]] = r[i];
      return o;
    });
  }

  function start() {
    if (booted) return;
    if (controller) controller.abort();
    controller = new AbortController();
    inflight = {};
    say('参考書のデータを読み込んでいます…', false);

    Promise.all([
      fetchAsset('core'), fetchAsset('books'), fetchAsset('routes'),
      fetchAsset('unis'), fetchAsset('guides'),
    ]).then(function (r) {
      var core = r[0], books = r[1], routes = r[2], unis = r[3], guides = r[4];
      var DATA = {
        config: core.config, stages: core.stages, tiers: core.tiers,
        books: books.books,
        routes: (routes && routes.routes) || {},
        unis: unis ? unpackUnis(unis) : [],
        guides: (guides && guides.guides) || [],
      };
      if (typeof window.RT_SUBJECT_APP !== 'function') {
        throw new Error('描画コードが読み込まれていない');
      }
      booted = true;
      say('', false);
      window.RT_SUBJECT_APP(DATA);
      if (window.RT_SUBJECT_FLUSH) window.RT_SUBJECT_FLUSH();
      document.documentElement.classList.add('rt-app-ready');
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      say('参考書のデータを読み込めませんでした。通信の状態を確かめて、もう一度お試しください。', true);
      if (window.console && console.warn) console.warn('subject-loader:', e && e.message);
    });
  }

  // 描画コードは defer で先に置いてある。DOM がそろってから始める
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
