/**
 * 学習の記録（/progress/ と参考書ごとの状態）を、実際のブラウザで確かめる。
 *
 * 単体の検査（test/progress.test.mjs）は形と規則を見る。ここで見るのは
 * **端末の中で完結していること**と、キーボードと読み上げで操作できることの 2 つ。
 */
import { test } from '@playwright/test';
import { expect, waitForApp, focused } from './helpers.mjs';

/** 進捗に関わる localStorage のキー */
const KEY = 'rt_learning_progress';

/** 記録した内容に出てくる、外へ出てはいけない文字列 */
const SECRETS = ['aoChart', '第3章', 'rt-progress-secret-note'];

function watchRequests(page) {
  const out = [];
  page.on('request', (req) => {
    let body = '';
    try { body = req.postData() || ''; } catch { /* 取れないこともある */ }
    out.push({ url: req.url(), body });
  });
  return out;
}

test('参考書ページで状態を記録し、再読み込みしても残る', async ({ page }) => {
  await page.goto('/math/books/ao/', { waitUntil: 'domcontentloaded' });

  const sel = page.locator('[data-rt-progress] select');
  await expect(sel).toHaveCount(1);
  await sel.selectOption('in_progress');

  const pct = page.locator('[data-rt-progress] input[type="number"]');
  await expect(pct).toBeVisible();
  await pct.fill('40');
  await pct.dispatchEvent('change');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rt-progress] select')).toHaveValue('in_progress');
  await expect(page.locator('[data-rt-progress] input[type="number"]')).toHaveValue('40');
});

test('状態の変化が読み上げに届く', async ({ page }) => {
  await page.goto('/math/books/ao/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-rt-progress] select').selectOption('completed');

  const live = page.locator('#rtProgressLive');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveAttribute('role', 'status');
  await expect(live).toContainText('完了');
});

test('キーボードだけで状態を変えられる', async ({ page }) => {
  await page.goto('/math/books/ao/', { waitUntil: 'domcontentloaded' });
  const sel = page.locator('[data-rt-progress] select');
  await sel.focus();
  const f = await focused(page);
  expect(f.tag, '状態の選択欄へフォーカスできない').toBe('select');
  await sel.selectOption('on_hold');
  await expect(page.locator('#rtProgressLive')).toContainText('保留');
});

test('完了にすると、ルートの残り時間が下限も上限も減る', async ({ page }) => {
  await page.goto('/math/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.evaluate(() => { window.selectTier('top'); window.go('route'); });
  await page.waitForSelector('.pace__range');

  const readHours = () => page.evaluate(() => {
    const t = document.querySelector('.pace__range')?.textContent || '';
    return [...t.matchAll(/約\s*(\d+)\s*時間/g)].map(m => Number(m[1]));
  });

  const before = await readHours();
  expect(before.length, '下限・標準・上限の 3 本が出ていない').toBe(3);

  await page.evaluate(() => {
    const node = document.querySelector('#routeOutput .climb-node.active[data-book-id]');
    const sel = node.querySelector('.rt-prog__sel');
    sel.value = 'completed';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const after = await readHours();
  expect(after.length).toBe(3);
  for (let i = 0; i < 3; i++) {
    expect(after[i], `${i} 本目が減っていない（${before[i]} → ${after[i]}）`).toBeLessThan(before[i]);
  }
});

test('/progress/ に記録が並び、消せる', async ({ page }) => {
  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.RTProgress.set('math', 'aoChart', { status: 'in_progress', progressPercent: 40, currentLocation: '第3章' });
    window.RTProgress.set('english', 'nextstage', { status: 'completed' });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#pgList .pg-row')).toHaveCount(2);
  await expect(page.locator('#pgSummary')).toContainText('2');
  await expect(page.locator('#pgList')).toContainText('第3章');

  await page.locator('#pgClear').click();
  await page.locator('#pgClearConfirm button', { hasText: '消す' }).first().click();
  await expect(page.locator('#pgList')).toContainText('まだ記録がありません');
});

test('記録を消しても、保存したルートと学習ペースの設定は残る', async ({ page }) => {
  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('rt_saved_routes', '{"v":1,"keep":true}');
    localStorage.setItem('rt_pace', '{"v":2,"year":2027}');
    window.RTProgress.set('math', 'aoChart', { status: 'completed' });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#pgClear').click();
  await page.locator('#pgClearConfirm button', { hasText: '消す' }).first().click();

  const kept = await page.evaluate(() => ({
    routes: localStorage.getItem('rt_saved_routes'),
    pace: localStorage.getItem('rt_pace'),
    progress: localStorage.getItem('rt_learning_progress'),
  }));
  expect(kept.routes, '保存したルートを壊した').toBe('{"v":1,"keep":true}');
  expect(kept.pace, '学習ペースの設定を壊した').toBe('{"v":2,"year":2027}');
  expect(kept.progress, '進捗が残っている').toBeFalsy();
});

test('取り込みは、確認するまで記録を変えない', async ({ page }) => {
  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.RTProgress.set('math', 'aoChart', { status: 'in_progress' });
  });

  const preview = await page.evaluate(() => {
    const before = localStorage.getItem('rt_learning_progress');
    const text = JSON.stringify({
      version: 1,
      books: { 'math:aoChart': { status: 'completed' }, 'math:another': { status: 'completed' } },
    });
    const pv = window.RTProgress.previewImport(text, () => true);
    return {
      ok: pv.ok,
      counts: pv.counts,
      unchanged: before === localStorage.getItem('rt_learning_progress'),
      statusNow: window.RTProgress.get('math', 'aoChart').status,
    };
  });

  expect(preview.ok).toBe(true);
  expect(preview.unchanged, '下見だけで localStorage を書き換えた').toBe(true);
  expect(preview.statusNow, '下見だけで値が変わった').toBe('in_progress');
  expect(preview.counts.added).toBe(1);
  expect(preview.counts.changed).toBe(1);
});

test('取り込みで置き換えると、前の記録が消える', async ({ page }) => {
  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(() => {
    window.RTProgress.set('math', 'old', { status: 'in_progress' });
    const text = JSON.stringify({ version: 1, books: { 'math:fresh': { status: 'completed' } } });
    const pv = window.RTProgress.previewImport(text, () => true);
    window.RTProgress.commitImport(pv, 'replace');
    return { total: window.RTProgress.summary().total, old: window.RTProgress.get('math', 'old') };
  });
  expect(r.total).toBe(1);
  expect(r.old).toBeNull();
});

test('壊れた記録を黙って上書きしない', async ({ page }) => {
  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => { localStorage.setItem(k, '{壊れている'); }, KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#pgStatus')).toContainText('読めませんでした');
  await expect(page.locator('#pgStatus button', { hasText: '生データを取り出す' })).toHaveCount(1);

  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  expect(raw, '読んだだけで書き換えた').toBe('{壊れている');
});

test('進捗はネットワークへ 1 バイトも出ない', async ({ page }) => {
  const reqs = watchRequests(page);

  await page.goto('/math/books/ao/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-rt-progress] select').selectOption('in_progress');
  const pct = page.locator('[data-rt-progress] input[type="number"]');
  await pct.fill('40');
  await pct.dispatchEvent('change');

  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.RTProgress.set('math', 'aoChart', { status: 'in_progress', progressPercent: 40, currentLocation: '第3章' });
    window.RTProgress.set('math', 'note', { status: 'in_progress', currentLocation: 'rt-progress-secret-note' });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  const leaked = [];
  for (const r of reqs) {
    const hay = decodeURIComponent(r.url) + ' ' + (r.body || '');
    for (const s of SECRETS) if (hay.includes(s)) leaked.push(`${s} → ${r.url.slice(0, 140)}`);
  }
  expect(leaked, '学習の記録が外部へ送られている').toEqual([]);
});

test('取り込んだ文字列が HTML として実行されない', async ({ page }) => {
  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const text = JSON.stringify({
      version: 1,
      books: { 'math:x': { status: 'in_progress', currentLocation: '<img src=x onerror="window.__xss=1">' } },
    });
    const pv = window.RTProgress.previewImport(text, () => true);
    window.RTProgress.commitImport(pv, 'merge');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // 画面には文字として出る。img 要素にはならない
  await expect(page.locator('#pgList')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__xss), 'HTML として実行された').toBeUndefined();
  expect(await page.locator('#pgList img').count(), 'img 要素になっている').toBe(0);
});
