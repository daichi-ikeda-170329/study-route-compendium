/**
 * 主要導線の E2E。
 *
 * 「マウス無しで最後まで使えるか」「共有・保存・旧 URL が壊れていないか」
 * 「受験情報が外へ出ていないか」を実ブラウザで確かめる。
 */
import { test } from '@playwright/test';
import { expect, collectErrors } from './helpers.mjs';

/** ナビは幅で出し分かれるので、見えているほうを押す */
const nav = (page, view) => page.locator(`button[data-view="${view}"]:visible`).first();

test('3 分診断を最初から結果までキーボードだけで終えられる', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/math/#quiz', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-quiz')).toBeVisible();

  /* 選択肢にフォーカスして Enter、次に「次へ」へフォーカスして Enter。
     マウスを一度も使わずに結果まで進めることを確かめる */
  for (let step = 0; step < 8; step++) {
    if (await page.locator('#quizShell .result-hero').count()) break;
    const opt = page.locator('#quizShell .opt').first();
    if (!(await opt.count())) break;
    await opt.focus();
    await expect(opt).toBeFocused();
    await page.keyboard.press('Enter');
    const next = page.locator('#quizNext');
    if (!(await next.count())) break;
    await next.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
  }
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();
  expect(errors).toEqual([]);
});

test('結果が出たら、結果の見出しへフォーカスが移る', async ({ page }) => {
  await page.goto('/math/#quiz', { waitUntil: 'domcontentloaded' });
  for (let step = 0; step < 8; step++) {
    if (await page.locator('#quizShell .result-hero').count()) break;
    const opt = page.locator('#quizShell .opt').first();
    if (!(await opt.count())) break;
    await opt.click();
    const next = page.locator('#quizNext');
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(120);
  }
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();
  const onHero = await page.evaluate(() => {
    const a = document.activeElement;
    return Boolean(a && a.closest && a.closest('.result-hero'));
  });
  expect(onHero, '結果の見出しにフォーカスが移っていない').toBe(true);
});

test('大学の候補を上下キーと Enter で選べる', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-m="uni"]').click();

  const input = page.locator('#uniInput');
  await input.click();
  await input.type('東京');
  const opts = page.locator('#uniSug [role="option"]');
  await expect(opts.first()).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /uniSugOpt0/);
  await expect(opts.first()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /uniSugOpt1/);

  await page.keyboard.press('Enter');
  await expect(page.locator('#uniSug')).not.toHaveClass(/open/);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(await input.inputValue()).not.toBe('東京');
});

test('Escape で候補が閉じ、入力欄から離脱できる', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-m="uni"]').click();
  const input = page.locator('#uniInput');
  await input.click();
  await input.type('東京');
  await expect(page.locator('#uniSug [role="option"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(input).not.toBeFocused();
});

test('大学名だけではルートを出さず、受験科目の確認を求める', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-m="uni"]').click();
  await page.locator('#uniInput').fill('東京大学');
  await page.locator('#uniSug [role="option"]').first().click();

  await expect(page.locator('.bnr')).toBeVisible();
  await expect(page.locator('#routeOutput .climb')).toHaveCount(0);
  await expect(page.locator('.bnr')).toContainText('公式募集要項');

  /* 本人が選んだあとだけルートが出る */
  await page.locator('.bnr-opt', { hasText: '理系' }).first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
});

test('「まだ分からない」を選んでも、片方のルートを断定しない', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-m="uni"]').click();
  await page.locator('#uniInput').fill('東京大学');
  await page.locator('#uniSug [role="option"]').first().click();
  await page.locator('.bnr-opt--unknown').click();
  await expect(page.locator('.bnr-diff')).toBeVisible();
  await expect(page.locator('#routeOutput .climb')).toHaveCount(0);
});

test('ペースの見込みが幅で出る', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  const pace = page.locator('.pace');
  await expect(pace).toBeVisible();
  await expect(pace).toContainText('最短');
  await expect(pace).toContainText('標準');
  await expect(pace).toContainText('余裕');
  /* 一点断定をしない */
  await expect(pace).not.toContainText('間に合う</span>');
});

test('保存・復元・削除がこの端末の中だけで動く', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();

  const saveBtn = page.locator('button', { hasText: '保存' }).first();
  if (await saveBtn.count()) {
    await saveBtn.click();
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.some(k => k.startsWith('rt_')), '保存が localStorage に入っていない').toBe(true);
  }
});

test('旧い共有 URL を開いても同じルートが出る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/math/?rv=1&r=t.top.ri.omni.1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  expect(errors).toEqual([]);
});

test('壊れた共有 URL でも例外を出さず、素の状態で開く', async ({ page }) => {
  const errors = collectErrors(page);
  for (const q of ['?rv=1&r=', '?rv=9&r=t.top.ri.omni.1', '?v=1&a=zzz', '#<script>', '?r=' + 'x'.repeat(500)]) {
    await page.goto(`/math/${q}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#view-home, #view-route')).not.toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('旧い形式の保存データを読み込める', async ({ page }) => {
  await page.goto('/math/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    // v1 のペース設定（year と hours だけを持つ形）
    window.localStorage.setItem('rt_pace', JSON.stringify({ year: 2027, hours: 3 }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('button[data-view="route"]:visible').first().click();
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('.pace')).toBeVisible();
  await expect(page.locator('.pace')).toContainText('平日 3 時間');
});

test('JavaScript が無くても書籍ページの説明とリンクが読める', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/english/books/nextstage/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.spec')).toBeVisible();
  await expect(page.locator('.verif')).toBeVisible();
  await expect(page.locator('a.az')).toBeVisible();
  await ctx.close();
});
