/**
 * テスト用のヘルパー。
 *
 * share.js はブラウザ向けの素のスクリプトなので、Node からは CommonJS として読み込む。
 * 科目ページの QUIZ は build/lib/extract.mjs と同じ方式（vm 上で <script> を実行）で取り出す。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** localStorage を差し替えたうえで share.js を新しく読み込む */
export function loadShare({ localStorage } = {}) {
  if (localStorage === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true, writable: true });
  delete require.cache[require.resolve(path.join(ROOT, 'assets/js/share.js'))];
  const RTShare = require(path.join(ROOT, 'assets/js/share.js'));
  RTShare.__test.resetStorageProbe();
  return RTShare;
}

/** 最小限の localStorage スタブ。throwOn を指定すると、その操作で例外を投げる */
export function fakeStorage(initial = {}, throwOn = null) {
  const data = { ...initial };
  const guard = (op) => { if (throwOn === op || throwOn === 'all') throw new Error('storage unavailable'); };
  return {
    getItem(k) { guard('getItem'); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { guard('setItem'); data[k] = String(v); },
    removeItem(k) { guard('removeItem'); delete data[k]; },
    _data: data,
  };
}

const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()),
  set: () => true,
  apply: () => stub(),
  construct: () => stub(),
});

export const SUBJECTS = ['english', 'japanese', 'math', 'science', 'social'];

/** 科目ページから QUIZ 配列を取り出す */
export function loadQuiz(dir) {
  const src = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
  const scripts = [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: stub(), window: stub(), localStorage: stub(), navigator: stub(),
    location: stub(), history: stub(),
    setTimeout() {}, setInterval() {}, addEventListener() {}, requestAnimationFrame() {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const code of scripts) {
    try { vm.runInContext(code.replace(/\bconst (QUIZ)\s*=/g, 'globalThis.$1 ='), ctx, { timeout: 30000 }); } catch { /* DOM 依存の初期化が落ちるのは想定内 */ }
  }
  if (!Array.isArray(ctx.QUIZ) || ctx.QUIZ.length === 0) throw new Error(`${dir}: QUIZ を取り出せなかった`);
  return ctx.QUIZ;
}

/**
 * その科目で実際に到達しうる回答の組み合わせをすべて列挙する。
 * cond で表示されない質問は回答を置かない（利用者が到達できる状態と同じにする）。
 */
export function allAnswerCombos(quiz) {
  const out = [];
  (function walk(i, acc) {
    if (i === quiz.length) { out.push({ ...acc }); return; }
    const q = quiz[i];
    if (q.cond && !q.cond(acc)) { walk(i + 1, acc); return; }
    for (const o of q.opts) walk(i + 1, { ...acc, [q.key]: o.v });
  })(0, {});
  return out;
}

/**
 * 科目ページを vm 上で走らせ、RTShare.setup に渡された設定と、ページの
 * トップレベル定数・関数（TIERS / S / selectTier など）を取り出す。
 *
 * loadQuiz と違い RTShare を差し替えて渡すので、ページ末尾の setup 呼び出しまで
 * 到達する。ルート共有の encode / apply を実際に動かして確かめるために使う。
 */
export function loadPage(dir) {
  const src = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
  const scripts = [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

  const captured = {};
  const noop = () => '';
  const fakeShare = {
    setup(cfg) { captured.cfg = cfg; },
    beforeQuiz: noop, beforeResult: noop, afterResult: noop, routeBlock: noop,
    restart() {}, copyLink() {}, shareNative() {}, saveRoute() {},
    openSaved() {}, removeSaved() {}, requestRemove() {}, trackShareX() {},
  };

  /**
   * loadQuiz の stub より少しだけ賢い DOM 代替。
   *  - well-known シンボルには undefined を返す。Proxy が Symbol.match を返すと
   *    String.prototype.includes が「正規表現を渡された」と誤認して落ちる。
   *  - value は空文字にする。検索欄の入力値として読まれるため。
   */
  const domStub = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === Symbol.toPrimitive) return () => '';
      if (typeof k === 'symbol') return undefined;
      if (k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
      return domStub();
    },
    set: () => true,
    apply: () => domStub(),
    construct: () => domStub(),
  });

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: domStub(), window: domStub(), localStorage: domStub(), navigator: domStub(),
    location: domStub(), history: domStub(),
    dataLayer: [],
    URL, URLSearchParams,
    setTimeout() {}, setInterval() {}, addEventListener() {}, requestAnimationFrame() {},
    RTShare: fakeShare,
    /* ペース表示は DOM を読むだけなので、テストでは何もしない差し替えで足りる */
    RTPace: { setup() {}, apply() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  /* トップレベルの const / function は vm の外から見えないので globalThis に移す */
  const wanted = ['BOOKS', 'UNIS', 'TIERS', 'ROUTES', 'STAGES', 'SENSEIS', 'SUBJ', 'SUBJ_KEYS', 'S'];
  const constRe = new RegExp(`\\bconst (${wanted.join('|')})\\s*=`, 'g');
  const fnRe = /^function (selectTier|selectSensei|setSubj|toggleSubj|setCourse|setMode|go)\(/gm;

  for (const code of scripts) {
    const patched = code
      .replace(constRe, 'globalThis.$1 =')
      .replace(fnRe, 'globalThis.$1 = function $1(');
    try { vm.runInContext(patched, ctx, { timeout: 30000 }); } catch (e) { if (process.env.RT_DEBUG) console.error(dir, e); }
  }
  if (!captured.cfg) throw new Error(`${dir}: RTShare.setup に到達しなかった`);
  return { ctx, cfg: captured.cfg };
}
