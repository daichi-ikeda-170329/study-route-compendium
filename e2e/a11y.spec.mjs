/**
 * 主要ページのアクセシビリティ検査。
 *
 * axe の重大・深刻な違反、横方向のオーバーフロー、コンソールエラーを見る。
 * 幅は playwright.config.mjs の project（320 / 375 / 768 / 1366）で回る。
 */
import { test } from '@playwright/test';
import { expect, KEY_PAGES, axeCritical, fmtViolations, horizontalOverflow, collectErrors, blockThirdParty } from './helpers.mjs';

for (const p of KEY_PAGES) {
  test(`${p.name}: axe の重大・深刻な違反が 0`, async ({ page }) => {
    /* **自動広告を止めてから測る。**
       AdSense の自動広告は、いつどこに何を差し込むかがこちらの制御外で、
       読み込む時刻も毎回違う。差し込まれた要素を巻き込んで測ると、
       同じコードでも結果が変わる（並行実行で負荷が高いと 6 回に 1 回ほど落ちた）。
       ここで確かめたいのは**自分たちのマークアップ**なので、第三者の枠は外す。
       広告が入った状態で機能が壊れないことは、下の「広告と解析を読み込めなくても
       主要機能が動く」と e2e/privacy.spec.mjs が別に見ている。 */
    await blockThirdParty(page);
    const errors = collectErrors(page);
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    const violations = await axeCritical(page);
    expect(fmtViolations(violations), `${p.url} の違反`).toBe('');
    expect(errors, `${p.url} のコンソールエラー`).toEqual([]);
  });

  test(`${p.name}: 横方向のオーバーフローが無い`, async ({ page }) => {
    /* **こちらは広告を止めない。** 広告がページ幅を超えて全体を横に動かすのは
       利用者に起きる実害なので、検出できるようにしておく（指示書 11.3） */
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    const r = await horizontalOverflow(page);
    expect(r.offenders, `${p.url} ではみ出している要素`).toEqual([]);
    expect(r.scrollW, `${p.url} のページ幅`).toBeLessThanOrEqual(r.docW + 1);
  });
}

test('lang と h1 とランドマークがそろっている', async ({ page }) => {
  for (const p of KEY_PAGES) {
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    const h1 = await page.locator('h1').count();
    expect(h1, `${p.url} の h1 の数`).toBeGreaterThanOrEqual(1);
    expect(await page.locator('main, [role="main"]').count(), `${p.url} の main`).toBeGreaterThanOrEqual(1);
    expect(await page.title(), `${p.url} の title`).not.toBe('');
  }
});

test('広告と解析を読み込めなくても主要機能が動く', async ({ page }) => {
  const errors = collectErrors(page);
  await page.route('**/*', route => {
    const u = route.request().url();
    if (/googletagmanager|google-analytics|googlesyndication|doubleclick|pagead/.test(u)) return route.abort();
    return route.continue();
  });
  /* ナビは幅で出し分かれる（狭いとタブバー、広いとヘッダー）。
     見えているほうを押す */
  await page.goto('/math/', { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-view="route"]:visible').first().click();
  await expect(page.locator('#view-route')).toBeVisible();
  /* 志望校を入力するモードへ切り替える（既定は志望レベルから選ぶモード） */
  await page.locator('button[data-m="uni"]').click();
  await page.locator('#uniInput').fill('東京大学');
  await expect(page.locator('#uniSug [role="option"]').first()).toBeVisible();
  expect(errors.filter(e => !/ERR_FAILED|net::/.test(e))).toEqual([]);
});
