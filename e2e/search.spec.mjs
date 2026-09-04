/**
 * 詳細検索（/search/）を実際のブラウザで確かめる。
 *
 * 規則そのものは test/search-facets.test.mjs が固定している。
 * ここで見るのは、画面から操作できること・欠損を隠さないこと・
 * 検索語が外へ出ないことの 3 つ。
 */
import { test } from '@playwright/test';
import { expect, collectErrors, horizontalOverflow } from './helpers.mjs';

async function open(page) {
  await page.goto('/search/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#sfResultsHead')).toContainText('冊', { timeout: 15000 });
  await expect(page.locator('.sf-card').first()).toBeVisible();
}

test('最初は全冊が出る（絞り込んでいないので欠損も含む）', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('#sfResultsHead')).toHaveText(/^1390 冊$/);
  expect(errors).toEqual([]);
});

test('欠損している件数を隠さずに出す', async ({ page }) => {
  await open(page);
  await expect(page.locator('#sfMore')).toContainText('著者が分かっていないもの');
  await expect(page.locator('.sf-card').first()).toContainText('著者');
});

test('科目・難易度帯・確認状態を組み合わせて絞り込める', async ({ page }) => {
  await open(page);
  const head = page.locator('#sfResultsHead');

  await page.locator('#sf-subjects-math').check();
  await expect(head).toHaveText(/162 冊/);

  await page.locator('#sf-diffBands-adv').check();
  const after = await head.textContent();
  expect(Number(after.match(/(\d+) 冊/)[1]), '難易度で絞っても件数が減っていない').toBeLessThan(162);

  await page.locator('#sf-statuses-verified').check();
  const last = await head.textContent();
  expect(Number(last.match(/(\d+) 冊/)[1])).toBeLessThanOrEqual(Number(after.match(/(\d+) 冊/)[1]));
});

test('「著者が分かっていない」だけを選べる', async ({ page }) => {
  await open(page);
  await page.locator('#sf-authors-__unknown__').check();
  const n = Number((await page.locator('#sfResultsHead').textContent()).match(/(\d+) 冊/)[1]);
  expect(n, '著者不明の本が 1 件も出ない').toBeGreaterThan(0);
  await expect(page.locator('.sf-card').first()).toContainText('分かっていない');
});

test('出版社で絞っても、著者が分かっていない本が消えない', async ({ page }) => {
  await open(page);

  /* **「著者が分かっていない本を持つ出版社」を選ぶ。**
     適当に先頭を選ぶと、たまたま全員の著者が判明している出版社に当たって
     何も確かめていないことになる。索引から決める */
  const pick = await page.evaluate(() => {
    const idx = window.__rtSearchIndex;
    const count = {};
    idx.books.forEach((b) => {
      if (!b.pub || (b.au && b.au.length)) return;
      count[b.pub] = (count[b.pub] || 0) + 1;
    });
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    return { pub: best, unknown: count[best] };
  });
  expect(pick.pub, '著者不明の本を持つ出版社が 1 つも無い').toBeTruthy();

  await page.locator(`#sfFacets input[type=checkbox][value="${pick.pub}"]`).check();
  await expect(page.locator('#sfMore')).toContainText('著者が分かっていないもの');
  const txt = await page.locator('#sfMore').textContent();
  const n = Number(txt.match(/著者が分かっていないもの (\d+) 冊/)[1]);
  expect(n, '出版社で絞っただけで著者不明の本が消えた').toBe(pick.unknown);
});

test('絞り込みを解除すると全冊に戻る', async ({ page }) => {
  await open(page);
  await page.locator('#sf-subjects-math').check();
  await expect(page.locator('#sfResultsHead')).toHaveText(/162 冊/);
  await page.locator('#sfReset').click();
  await expect(page.locator('#sfResultsHead')).toHaveText(/^1390 冊$/);
  await expect(page.locator('#sf-subjects-math')).not.toBeChecked();
});

test('書名で探せる', async ({ page }) => {
  await open(page);
  await page.locator('#sfQuery').fill('ポラリス');
  await expect(page.locator('#sfResultsHead')).not.toHaveText(/^1390 冊$/);
  await expect(page.locator('.sf-card').first()).toContainText('ポラリス');
});

test('結果から書籍ページへ行ける', async ({ page }) => {
  await open(page);
  const link = page.locator('.sf-card__name a').first();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/[a-z]+\/books\/[A-Za-z0-9_-]+\/$/);
  await link.click();
  await expect(page.locator('h1')).toBeVisible();
});

test('キーボードだけで絞り込める', async ({ page }) => {
  await open(page);
  const cb = page.locator('#sf-subjects-math');
  await cb.focus();
  await page.keyboard.press('Space');
  await expect(cb).toBeChecked();
  await expect(page.locator('#sfResultsHead')).toHaveText(/162 冊/);
});

test('件数の変化が読み上げに届く', async ({ page }) => {
  await open(page);
  const live = page.locator('#sfStatus');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await page.locator('#sf-subjects-math').check();
  await expect(live).toContainText('162 冊が該当しました');
});

test('320px でも横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page);
  await page.locator('#sf-subjects-math').check();
  const r = await horizontalOverflow(page);
  expect(r.offenders, 'はみ出している要素').toEqual([]);
  expect(r.scrollW).toBeLessThanOrEqual(r.docW + 1);
});

test('検索語がネットワークへ出ない', async ({ page }) => {
  const reqs = [];
  page.on('request', (req) => {
    let body = '';
    try { body = req.postData() || ''; } catch { /* 取れないこともある */ }
    reqs.push(decodeURIComponent(req.url()) + ' ' + body);
  });

  await open(page);
  const secret = 'rtsearchsecretterm';
  await page.locator('#sfQuery').fill(secret);
  await page.locator('#sf-subjects-math').check();
  await page.waitForTimeout(700);

  const leaked = reqs.filter(r => r.includes(secret));
  expect(leaked, '検索語が外部へ送られている').toEqual([]);
});

test('ヘッダー検索から詳細検索へ行ける', async ({ page }) => {
  await page.goto('/math/books/', { waitUntil: 'domcontentloaded' });
  const input = page.locator('#rtSearchInput, input[type="search"]').first();
  await input.click();
  await input.fill('チャート');
  const more = page.locator('.rt-search__more');
  await expect(more).toBeVisible({ timeout: 10000 });
  await expect(more).toHaveAttribute('href', '/search/');
});
