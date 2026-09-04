/**
 * 受験情報が外へ出ていないことを、実際のネットワーク通信で確かめる。
 *
 * 静的な検査（test/analytics.test.mjs）は「送る道」を見張るが、
 * 実際に走らせるとどうなるかは別なので、ここで通信そのものを見る。
 */
import { test } from '@playwright/test';
import { expect, waitForApp } from './helpers.mjs';

/** 外へ出てはいけない値。診断・志望校入力で実際に使う */
const SECRETS = ['東京大学', '医学部医学科', '62.5', 'nextstage'];

/** 通信を記録する。URL・POST の本文の両方を見る */
function watchRequests(page) {
  const out = [];
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith('http://127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:')) return;
    let body = '';
    try { body = r.postData() || ''; } catch { /* 取れないこともある */ }
    out.push({ url: u, body });
  });
  return out;
}

test('志望校・学部・偏差値・既習教材がネットワークへ出ない', async ({ page }) => {
  const reqs = watchRequests(page);
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);

  await page.locator('button[data-m="uni"]').click();
  await page.locator('#uniInput').fill('東京大学');
  await page.locator('#uniSug [role="option"]').first().click();
  await page.locator('#facInput').fill('医学部医学科');
  await page.waitForTimeout(300);

  const hen = page.locator('#henInput');
  if (await hen.count()) { await hen.fill('62.5'); await page.waitForTimeout(200); }

  const done = page.locator('#doneInput');
  if (await done.count()) {
    await done.fill('ネクステ');
    await page.waitForTimeout(300);
    const first = page.locator('#doneSug [role="option"]').first();
    if (await first.count()) await first.click();
  }
  await page.waitForTimeout(500);

  const leaked = [];
  for (const r of reqs) {
    const hay = decodeURIComponent(r.url) + ' ' + (r.body || '');
    for (const s of SECRETS) if (hay.includes(s)) leaked.push(`${s} → ${r.url.slice(0, 120)}`);
  }
  expect(leaked, '受験情報が外部へ送られている').toEqual([]);
});

test('GA4 へ送るページ URL に共有パラメータが入らない', async ({ page }) => {
  /* GA4 は既定でページ URL をそのまま送る。共有リンクは診断の回答と、
     場合によっては志望校名を query に持つので、gtag('config') で
     origin + pathname に差し替えてある。ここではその設定が生きているかを見る */
  await page.goto('/math/?rv=1&r=t.top.ri.omni.1&ru=%E6%9D%B1%E4%BA%AC%E5%A4%A7%E5%AD%A6#route',
    { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  const loc = await page.evaluate(() => {
    const conf = (window.dataLayer || []).find(a => a[0] === 'config');
    return conf && conf[2] && conf[2].page_location;
  });
  expect(loc, 'page_location を差し替えていない').toBeTruthy();
  expect(loc).not.toContain('?');
  expect(loc).not.toContain('#');
  expect(loc).not.toContain('t.top.ri.omni.1');
});

test('共有リンクを復元したらアドレスバーから共有パラメータが消える', async ({ page }) => {
  /* 広告や解析はページ URL をそのまま受け取る。復元し終えたら落としておく */
  await page.goto('/math/?rv=1&r=t.top.ri.omni.1&ru=%E6%9D%B1%E4%BA%AC%E5%A4%A7%E5%AD%A6#route',
    { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  const url = page.url();
  expect(url, '共有パラメータが残っている').not.toContain('r=t.top');
  expect(decodeURIComponent(url), '志望校名が残っている').not.toContain('東京大学');
});

test('診断の回答列も復元後にアドレスバーから消える', async ({ page }) => {
  await page.goto('/math/?v=1&a=2.5.4.2.2', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();
  expect(page.url(), '回答列が残っている').not.toContain('a=2.5.4.2.2');
});

test('保存したルートは localStorage の中だけに残る', async ({ page }) => {
  const reqs = watchRequests(page);
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  const save = page.locator('button', { hasText: '保存' }).first();
  if (await save.count()) await save.click();
  await page.waitForTimeout(400);

  const stored = await page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
  });
  const values = Object.values(stored).join(' ');
  const leaked = reqs.filter(r => values && values.length > 8 && r.url.includes(encodeURIComponent(values.slice(0, 20))));
  expect(leaked, '保存内容が外部へ送られている').toEqual([]);
});

test('解析イベントは allowlist を通ったものだけになる', async ({ page }) => {
  await page.goto('/math/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  const r = await page.evaluate(() => window.RTAnalytics.sanitize('affiliate_click', {
    subject_id: 'math', book_id: 'ao', store: 'amazon',
    university: '東京大学', hensachi: 62,
  }));
  expect(Object.keys(r.params).sort()).toEqual(['book_id', 'store', 'subject_id']);
  expect(r.dropped).toContain('param:university');
  expect(r.dropped).toContain('param:hensachi');
});

test('広告を読み込めなくても、ルートの作成と保存が最後まで動く', async ({ page }) => {
  await page.route('**/*', route => {
    const u = route.request().url();
    if (/googlesyndication|doubleclick|pagead|adsbygoogle/.test(u)) return route.abort();
    return route.continue();
  });
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  await expect(page.locator('.pace')).toBeVisible();
});
