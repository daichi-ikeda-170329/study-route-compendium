/**
 * E2E 共通のヘルパー。
 *
 * ここに置くのは「どの検査でも同じであってほしいこと」だけ。
 * 個々の画面の手順は各テストに書く。
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';

/** 検査する主要ページ */
export const KEY_PAGES = [
  { url: '/', name: 'ポータル' },
  { url: '/english/', name: '英語トップ' },
  { url: '/math/', name: '数学トップ' },
  { url: '/science/', name: '理科トップ' },
  /* 7 科目すべてのトップを見る。科目データを HTML の外へ出す改修は 1 科目ずつ
     進めるので、対象から漏れている科目があると壊れたまま気づけない */
  { url: '/japanese/', name: '国語トップ' },
  { url: '/social/', name: '社会トップ' },
  { url: '/joho/', name: '情報トップ' },
  { url: '/shoron/', name: '小論文トップ' },
  { url: '/english/books/nextstage/', name: '書籍ページ' },
  { url: '/english/books/', name: '参考書一覧' },
  { url: '/math/routes/top/', name: '志望校別ルート' },
  { url: '/privacy/', name: 'プライバシー' },
  { url: '/methodology/', name: '算出方法' },
];

/**
 * 科目トップの描画が終わるのを待つ。
 *
 * 科目データは HTML の外（assets/generated/subjects/）にあり、
 * assets/js/subject-loader.js が取得してから描画する。取得が終わると
 * `<html>` に `rt-app-ready` が付く。
 *
 * **これを待たずに測ると、描画の途中を見てしまう。**
 * 以前はデータが同期スクリプトだったので `domcontentloaded` の時点で
 * DOM が確定していたが、いまは確定していない（2026-09-05 に axe が
 * 並行実行の負荷で 1 件だけ落ちた）。
 *
 * 科目トップ以外（マニフェストを持たないページ）では待たずに進む。
 */
export async function waitForApp(page) {
  const isSubjectTop = await page.evaluate(() => Boolean(window.RT_SUBJECT_ASSETS)).catch(() => false);
  if (!isSubjectTop) return;
  await page.waitForFunction(
    () => document.documentElement.classList.contains('rt-app-ready'),
    null, { timeout: 15000 },
  );
}

/**
 * axe の重大・深刻な違反だけを見る。
 * moderate / minor まで落とすと、色のコントラストの微差で全体が止まり、
 * 本当に操作できない不具合が埋もれる。
 */
export async function axeCritical(page) {
  /* フェードインの途中で測ると、地色と混ざった中間色をコントラスト不足として拾う
     （.view の fade は 0.3s）。**利用者が実際に見ているのは終わったあとの色**なので、
     そこで測るのが正しい。
     
     待って測る方式では、CI のように 4 つの幅を並行で走らせて負荷が高い環境で
     取りこぼす（2026-09-04 に実際に 1 件落ちた）。待つのではなく、
     アニメーションと遷移を止めてから測る。fade は opacity 0 → 1 で、
     素の状態が 1 なので、止めれば必ず最終状態になる。 */
  await waitForApp(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  }).catch(() => { /* 差し込めない場合は下の待ち time で代替する */ });
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForFunction(
    () => document.getAnimations().every(a => a.playState !== 'running'),
    null, { timeout: 10000 },
  ).catch(() => { /* 取れない環境では時間で待つ */ });
  await page.waitForTimeout(300);
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return res.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

/** 違反を読める形にする */
export function fmtViolations(vs) {
  return vs.map(v => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join('\n    ')}`).join('\n');
}

/**
 * 横方向のオーバーフローを探す。
 * ページ全体が横に動くと、拡大した人が本文を追えなくなる。
 * 自分の枠の中だけで横に流す要素（overflow-x が auto / scroll）は対象外。
 */
export async function horizontalOverflow(page) {
  await waitForApp(page);
  return page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const out = [];
    /** 自分か祖先が「自分の枠の中だけで横に流す」設定なら、ページ全体は動かない */
    const insideScroller = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      if (insideScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > docW + 1 || r.left < -1) {
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''} right=${Math.round(r.right)} (doc=${docW})`);
      }
      if (out.length >= 8) break;
    }
    return { docW, scrollW: document.documentElement.scrollWidth, offenders: out };
  });
}

/**
 * 第三者（広告・解析）の枠が出すノイズ。**自分たちの不具合ではない。**
 *
 * AdSense の iframe は自身の Content-Security-Policy に基づく報告を、
 * 埋め込み元のコンソールへ出す（`[Report Only] Refused to frame …
 * frame-ancestors 'self'`）。ネットワークのある環境（CI）でだけ出るので、
 * 落とすとサイト側の不具合と区別がつかなくなる。
 *
 * **ここを緩めるときは慎重に。** 自分たちのコードのエラーまで隠すと、
 * この検査そのものが意味を失う。パターンは第三者の配信元に限定する。
 */
const THIRD_PARTY_NOISE = [
  /\[Report Only\].*frame-ancestors/i,
  /googlesyndication|doubleclick|googletagmanager|google-analytics|pagead|adsbygoogle/i,
  /Failed to load resource.*(googlesyndication|doubleclick|pagead|google-analytics)/i,
];

/**
 * コンソールのエラーと未処理の Promise 拒否を集める。
 * 第三者の広告・解析が出すノイズは除く（上の理由）。
 */
export function collectErrors(page) {
  const errors = [];
  const keep = (text) => !THIRD_PARTY_NOISE.some(re => re.test(text));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = `console: ${m.text()}`;
    if (keep(t)) errors.push(t);
  });
  page.on('pageerror', e => {
    const t = `pageerror: ${e.message}`;
    if (keep(t)) errors.push(t);
  });
  return errors;
}

/**
 * 広告・解析の読み込みを止める。
 *
 * **中断（abort）ではなく空の応答を返す。** 中断すると
 * `Failed to load resource: net::ERR_FAILED` がコンソールエラーとして出て、
 * 「自分たちのコードのエラーが 0 か」を見る検査と区別できなくなる。
 * 空応答なら、第三者のスクリプトは何もしないまま静かに終わる。
 *
 * 読み込みに失敗する環境そのものを再現したいときは、呼び出し側で
 * abort する（e2e/a11y.spec.mjs の「広告と解析を読み込めなくても…」）。
 */
export async function blockThirdParty(page) {
  await page.route('**/*', route => {
    const u = route.request().url();
    if (/googletagmanager|google-analytics|googlesyndication|doubleclick|adsbygoogle|pagead/.test(u)) {
      return route.fulfill({ status: 204, body: '', headers: { 'content-type': 'text/plain' } });
    }
    return route.continue();
  });
}

/** 現在フォーカスされている要素の説明 */
export async function focused(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    return { tag: a.tagName.toLowerCase(), id: a.id || null, role: a.getAttribute('role'), text: (a.textContent || '').trim().slice(0, 30) };
  });
}

export { expect };
