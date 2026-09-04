/**
 * 主要ページのアクセシビリティ検査。
 *
 * axe の重大・深刻な違反、横方向のオーバーフロー、コンソールエラーを見る。
 * 幅は playwright.config.mjs の project（320 / 375 / 768 / 1366）で回る。
 */
import { test } from '@playwright/test';
import { expect, KEY_PAGES, axeCritical, fmtViolations, horizontalOverflow, collectErrors } from './helpers.mjs';

for (const p of KEY_PAGES) {
  test(`${p.name}: axe の重大・深刻な違反が 0`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    const violations = await axeCritical(page);
    expect(fmtViolations(violations), `${p.url} の違反`).toBe('');
    expect(errors, `${p.url} のコンソールエラー`).toEqual([]);
  });

  test(`${p.name}: 横方向のオーバーフローが無い`, async ({ page }) => {
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
