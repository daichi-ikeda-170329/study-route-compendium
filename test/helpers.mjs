/**
 * テスト用のヘルパー。
 *
 * share.js はブラウザ向けの素のスクリプトなので、Node からは CommonJS として読み込む。
 * 科目ページの描画コードは assets/js/subject-<科目>.js にあり、データは
 * data/subjects/<科目>/ にある。実行時と同じ形（RT_SUBJECT_APP(DATA)）で vm 上に組み立てる。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');

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

/**
 * 科目トップの描画・操作コードの中身を返す。
 *
 * 2026-09-05 に 7 科目すべてを移したので、置き場所は
 * assets/js/subject-<科目>.js だけ。**取得先をここへ 1 本化する。**
 * 各テストが自分でパスを組み立てると、置き場所が変わるたびに
 * 「テストが実装に合わせて緩んだのか」が分からなくなる。
 */
export function subjectAppSource(dir) {
  return fs.readFileSync(path.join(ROOT, 'assets', 'js', `subject-${dir}.js`), 'utf8');
}

/** 科目トップの HTML（markup と <style>）。CSS の検査はこちらを見る */
export function subjectHtml(dir) {
  return fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
}

/** その科目のデータが data/subjects/ にあるか。7 科目すべて true のはず */
export function subjectMigrated(dir) {
  return fs.existsSync(path.join(ROOT, 'data', 'subjects', dir, 'books.json'));
}

/** 科目ページの QUIZ 配列。描画コード（assets/js/subject-<科目>.js）から取る */
export function loadQuiz(dir) {
  const q = loadPage(dir).ctx.QUIZ;
  if (!Array.isArray(q) || q.length === 0) throw new Error(`${dir}: QUIZ を取り出せなかった`);
  return q;
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
  const migrated = subjectMigrated(dir);
  const src = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
  const scripts = migrated
    ? [fs.readFileSync(path.join(ROOT, 'assets', 'js', `subject-${dir}.js`), 'utf8')]
    : [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

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

  /**
   * window だけは「書いた値を覚える」代替にする。
   *
   * 移行済み科目の app は `window.RT_SUBJECT_APP = function (DATA) {…}` を定義し、
   * トップレベルの関数も window へ載せ直す。素の Proxy スタブだと set が
   * 捨てられてしまい、あとから読めない。書いた値は覚え、書いていない名前だけ
   * スタブを返す。
   */
  const windowStub = (seed = {}) => {
    const own = { ...seed };
    return new Proxy(own, {
      get: (t, k) => {
        if (k in t) return t[k];
        if (k === Symbol.toPrimitive) return () => '';
        if (typeof k === 'symbol') return undefined;
        return domStub();
      },
      set: (t, k, v) => { t[k] = v; return true; },
      has: () => true,
    });
  };

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: domStub(), window: windowStub({ RTShare: fakeShare, RTPace: { setup() {}, apply() {} } }),
    localStorage: domStub(), navigator: domStub(),
    location: domStub(), history: domStub(),
    dataLayer: [],
    URL, URLSearchParams,
    setTimeout() {}, setInterval() {}, addEventListener() {}, requestAnimationFrame() {},
    RTShare: fakeShare,
    /* 志望校モードの文理確認（assets/js/bunri.js）。実物を読み込む。
       スタブに差し替えると「推定を出さない学部名」の判定まで嘘になる */
    RTBunri: require(path.join(ROOT, 'assets/js/bunri.js')),
    /* ペース表示は DOM を読むだけなので、テストでは何もしない差し替えで足りる */
    RTPace: { setup() {}, apply() {} },
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);

  if (migrated) {
    /* 移行済み科目では、描画コードは外部ファイルにあり、データは
       data/subjects/<科目>/ にある。実行時と同じ形（RT_SUBJECT_APP(DATA)）で走らせる。 */
    for (const code of scripts) {
      try { vm.runInContext(code, ctx, { timeout: 30000 }); } catch (e) { if (process.env.RT_DEBUG) console.error(dir, e); }
    }
    const d = loadSubjectData(ROOT, dir);
    const DATA = {
      config: d.config, stages: d.stages, tiers: d.tiers,
      routes: d.routes, unis: d.unis, guides: d.guides, books: d.books,
    };
    if (typeof ctx.window.RT_SUBJECT_APP !== 'function') {
      throw new Error(`${dir}: assets/js/subject-${dir}.js が RT_SUBJECT_APP を定義していない`);
    }
    try { ctx.window.RT_SUBJECT_APP(DATA); } catch (e) { if (process.env.RT_DEBUG) console.error(dir, e); }
    if (!captured.cfg) throw new Error(`${dir}: RTShare.setup に到達しなかった`);

    /* 呼び出し側は ctx.TIERS / ctx.S / ctx.selectTier のように読む。
       app は window へ載せ直しているので、window の中身とデータを重ねて返す。
       **同じ参照**を返すので、テストが ctx.S を書き換えれば app 側にも効く。 */
    const merged = Object.assign(Object.create(null), ctx, ctx.window, {
      BOOKS: DATA.books, UNIS: DATA.unis, TIERS: DATA.tiers, ROUTES: DATA.routes,
      GUIDES: DATA.guides, STAGES: DATA.stages, CONFIG: DATA.config,
    });
    return { ctx: merged, cfg: captured.cfg };
  }

  /* 未移行の科目。トップレベルの const / function は vm の外から見えないので globalThis に移す */
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
