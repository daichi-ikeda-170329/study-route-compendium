import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.mjs';

// 実店舗へアクセスせず、通常のクリックで出る開発用イベントを確かめる。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.purchaseEvents = [];
    const info = console.info;
    console.info = (...args) => {
      if (args[0] === '[analytics]' && args[2] === 'affiliate_click') window.purchaseEvents.push(args[3]);
      info.apply(console, args);
    };
    document.addEventListener('click', (event) => {
      if (event.target.closest('a[data-rt-buy]')) event.preventDefault();
    }, true);
  });
});

function destination(href) {
  const affiliate = new URL(href);
  const dest = new URL(affiliate.searchParams.get('pc'));
  expect(dest.hostname).toBe('books.rakuten.co.jp');
  expect(dest.searchParams.get('g')).toBe('001');
  return dest.searchParams.get('sitem');
}

test('書籍の購入先が最初の画面にあり、上下の購入クリックを重複なく区別する', async ({ page }) => {
  await page.goto('/science/books/jokyu-seiko/');
  const hero = page.locator('.buy--hero');
  await expect(hero.locator('a').first()).toBeInViewport();
  expect(destination(await hero.locator('.rk').getAttribute('href'))).toBe('9784010355343');
  await hero.locator('.az').click();
  await page.locator('[data-rt-placement="book_footer"] .rk').click();
  expect(await page.evaluate(() => window.purchaseEvents)).toEqual([
    { subject_id: 'science', book_id: 'jokyu-seiko', store: 'amazon', placement: 'book_hero' },
    { subject_id: 'science', book_id: 'jokyu-seiko', store: 'rakuten', placement: 'book_footer' },
  ]);
});

test('2 冊比較で選んだ本の店舗と購入クリックを計測する', async ({ page }) => {
  await page.goto('/compare/?a=science:jokyu-seiko&b=science:kosei-jokyu');
  const buy = page.locator('.cmpx__buy [data-rt-buy="rakuten"]').first();
  await expect(buy).toBeVisible();
  expect(destination(await buy.getAttribute('href'))).toBe('9784010355343');
  await buy.click();
  expect(await page.evaluate(() => window.purchaseEvents)).toEqual([
    { subject_id: 'science', book_id: 'jokyu-seiko', store: 'rakuten', placement: 'compare' },
  ]);
});

test('全 7 科目の図鑑で、開いた本の購入クリックを 1 回だけ計測する', async ({ page }) => {
  for (const subject of ['english', 'japanese', 'math', 'science', 'social', 'joho', 'shoron']) {
    await page.goto(`/${subject}/#catalog`);
    await waitForApp(page);
    await page.locator('#view-catalog [role="button"][onclick^="openModal"]').first().click();
    const link = page.locator('#bookModal a[data-rt-buy="rakuten"]');
    await expect(link).toBeVisible();
    const id = await link.getAttribute('data-rt-bid');
    expect(destination(await link.getAttribute('href'))).toBeTruthy();
    await link.click();
    expect(await page.evaluate(() => window.purchaseEvents)).toEqual([
      { subject_id: subject, book_id: id, store: 'rakuten', placement: 'catalog_modal' },
    ]);
  }
});
