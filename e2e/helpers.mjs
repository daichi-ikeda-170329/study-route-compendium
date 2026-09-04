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
  { url: '/joho/', name: '情報トップ' },
  { url: '/english/books/nextstage/', name: '書籍ページ' },
  { url: '/english/books/', name: '参考書一覧' },
  { url: '/math/routes/top/', name: '志望校別ルート' },
  { url: '/privacy/', name: 'プライバシー' },
  { url: '/methodology/', name: '算出方法' },
];

/**
 * axe の重大・深刻な違反だけを見る。
 * moderate / minor まで落とすと、色のコントラストの微差で全体が止まり、
 * 本当に操作できない不具合が埋もれる。
 */
export async function axeCritical(page) {
  /* フェードインの途中で測ると、地色と混ざった中間色をコントラスト不足として拾う
     （.view の fade は 0.3s）。動きを減らす設定にして最終状態で測る。
     最終状態の色こそが利用者に見えている色なので、これが正しい測り方。
     科目トップは 1 枚が 950KB を超えるものがあり、描き終わるまでに時間がかかる。
     アニメーションが 1 つも走っていないことを確かめてから測る */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForFunction(
    () => document.getAnimations().every(a => a.playState !== 'running'),
    null, { timeout: 5000 },
  ).catch(() => { /* 取れない環境では時間で待つ */ });
  await page.waitForTimeout(400);
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

/** コンソールのエラーと未処理の Promise 拒否を集める */
export function collectErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** 広告・解析など外部スクリプトを落とす（読み込めない環境の再現） */
export async function blockThirdParty(page) {
  await page.route('**/*', route => {
    const u = route.request().url();
    if (/googletagmanager|google-analytics|googlesyndication|doubleclick|adsbygoogle/.test(u)) {
      return route.abort();
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
