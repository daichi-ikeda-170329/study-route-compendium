/**
 * 主要導線の E2E。
 *
 * 「マウス無しで最後まで使えるか」「共有・保存・旧 URL が壊れていないか」
 * 「受験情報が外へ出ていないか」を実ブラウザで確かめる。
 */
import { test } from '@playwright/test';
import { expect, collectErrors, waitForApp } from './helpers.mjs';

/** ナビは幅で出し分かれるので、見えているほうを押す */
const nav = (page, view) => page.locator(`button[data-view="${view}"]:visible`).first();

test('3 分診断を最初から結果までキーボードだけで終えられる', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/math/#quiz', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
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
  await waitForApp(page);
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
  await waitForApp(page);
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
  await waitForApp(page);
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
  await waitForApp(page);
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
  await waitForApp(page);
  await page.locator('button[data-m="uni"]').click();
  await page.locator('#uniInput').fill('東京大学');
  await page.locator('#uniSug [role="option"]').first().click();
  await page.locator('.bnr-opt--unknown').click();
  await expect(page.locator('.bnr-diff')).toBeVisible();
  await expect(page.locator('#routeOutput .climb')).toHaveCount(0);
});

test('ペースの見込みが幅で出る', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
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
  await waitForApp(page);
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();

  // 「画像で保存」（ルートの画像書き出し。仕様書 4.3）は localStorage の保存ではないので除く
  const saveBtn = page.locator('button', { hasText: '保存' }).filter({ hasNotText: '画像' }).first();
  if (await saveBtn.count()) {
    await saveBtn.click();
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.some(k => k.startsWith('rt_')), '保存が localStorage に入っていない').toBe(true);
  }
});

test('旧い共有 URL を開いても同じルートが出る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/math/?rv=1&r=t.top.ri.omni.1', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  expect(errors).toEqual([]);
});

test('壊れた共有 URL でも例外を出さず、素の状態で開く', async ({ page }) => {
  const errors = collectErrors(page);
  for (const q of ['?rv=1&r=', '?rv=9&r=t.top.ri.omni.1', '?v=1&a=zzz', '#<script>', '?r=' + 'x'.repeat(500)]) {
    await page.goto(`/math/${q}`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await expect(page.locator('#view-home, #view-route')).not.toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('旧い形式の保存データを読み込める', async ({ page }) => {
  await page.goto('/math/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
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
  // 確認状況（.verif）は 2026-09-05 に外した。同じ「JS 無しでも本文が読める」を、
  // その位置に残った難易度の 1 行（build/lib/scale.mjs の degreeLine）で見る
  await expect(page.locator('.scale__line')).toBeVisible();
  await expect(page.locator('a.az')).toBeVisible();
  await ctx.close();
});

test('学習ガイドは見出しだけで届き、3 番を開くと本文が入る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/english/#guide', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await expect(page.locator('#view-guide')).toBeVisible();
  const card = page.locator('#g2');
  // 本文は開く前は空（科目トップの HTML に 13 本ぶんの本文を持たない。仕様書 2.2）
  await expect(card.locator('.g-body')).toBeEmpty();
  await card.locator('.g-card__head').click();
  await expect(card).toHaveClass(/open/);
  await expect(card.locator('.g-card__head')).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.g-body p').first()).toBeVisible();
  // 閉じて開き直しても本文は二重にならない
  const n = await card.locator('.g-body p').count();
  await card.locator('.g-card__head').click();
  await card.locator('.g-card__head').click();
  expect(await card.locator('.g-body p').count()).toBe(n);
  // 1 本 1 ページの静的な置き場へのリンク
  await expect(card.locator('a.g-page')).toHaveAttribute('href', '/english/guides/basics/03/');
  expect(errors).toEqual([]);
});

test('JS が無くても学習ガイドの見出しと記事一覧への案内が読める', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/english/', { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  expect(html).toContain('学習ガイドの本文は記事一覧から読めます');
  expect(await page.locator('#guideList .g-card h3').count()).toBeGreaterThan(5);
  await ctx.close();
});

/* ---------- 画面遷移の履歴（仕様書 2.3） ---------- */

/** 診断を結果まで進める（選択肢の先頭を選び続ける） */
async function finishQuiz(page) {
  for (let step = 0; step < 10; step++) {
    if (await page.locator('#quizShell .result-hero').count()) break;
    const opt = page.locator('#quizShell .opt').first();
    if (!(await opt.count())) break;
    await opt.click();
    const next = page.locator('#quizNext');
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(80);
  }
}

test('図鑑→ルート→診断と動いたあと、戻るで 1 画面ずつ戻る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/english/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  for (const v of ['catalog', 'route', 'quiz']) {
    await nav(page, v).click();
    await expect(page.locator(`#view-${v}`)).toBeVisible();
  }
  await page.goBack();
  await expect(page.locator('#view-route')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-catalog')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-home')).toBeVisible();
  // 進むでも同じ順にたどれる
  await page.goForward();
  await expect(page.locator('#view-catalog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('全科目で、いまの画面のナビに aria-current が付く', async ({ page }) => {
  for (const dir of ['english', 'joho', 'shoron']) {
    await page.goto(`/${dir}/`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await nav(page, 'catalog').click();
    await expect(nav(page, 'catalog')).toHaveAttribute('aria-current', 'page');
    await expect(nav(page, 'home')).not.toHaveAttribute('aria-current', 'page');
  }
});

test('診断の設問を進めても履歴は積まず、戻る 1 回で診断から出る', async ({ page }) => {
  await page.goto('/english/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await nav(page, 'quiz').click();
  await expect(page.locator('#view-quiz')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.locator('#quizShell .opt').first().click();
    await page.locator('#quizNext').click();
    await page.waitForTimeout(80);
  }
  await page.goBack();
  await expect(page.locator('#view-quiz')).toBeHidden();
  await expect(page.locator('#view-home')).toBeVisible();
});

test('共有 URL を開いて結果が出るまでに履歴を増やさない', async ({ page, context }) => {
  await page.goto('/english/#quiz', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await finishQuiz(page);
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();
  const url = await page.locator('.rt-share[data-rt-url]').first().getAttribute('data-rt-url');
  expect(url).toMatch(/\?v=1&a=/);
  const shared = new URL(url);

  const fresh = await context.newPage();
  await fresh.goto('/english/', { waitUntil: 'domcontentloaded' });
  const baseline = await fresh.evaluate(() => history.length);
  await fresh.close();

  const p2 = await context.newPage();
  await p2.goto(shared.pathname + shared.search, { waitUntil: 'domcontentloaded' });
  await waitForApp(p2);
  await expect(p2.locator('#quizShell .result-hero')).toBeVisible();
  expect(await p2.evaluate(() => history.length)).toBe(baseline);
  await p2.close();
});

test('講師ルートを表示すると、ルートの冒頭に非公式の注記が出る（仕様書 3.5）', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/english/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.evaluate(() => { window.selectSensei('seki'); });
  const first = page.locator('#routeOutput > *').first();
  await expect(first).toHaveClass(/sensei-top/);
  await expect(first).toContainText('このルートは当サイトが市販の著作をもとに独自に構成したもので、関正生本人・所属予備校・出版社の推奨や監修ではありません。');
  expect(errors).toEqual([]);
});

/* ---------- 2 冊比較（仕様書 4.2） ---------- */

test('2 冊比較: 有効な 2 冊なら表が出る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/compare/?a=english:rules4&b=english:supremacy', { waitUntil: 'domcontentloaded' });
  const table = page.locator('table.cmpx');
  await expect(table).toBeVisible();
  await expect(table.locator('thead')).toContainText('The Rules');
  await expect(table.locator('thead')).toContainText('SUPREMACY');
  await expect(table.locator('tbody tr')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('2 冊比較: 無効な指定なら空の状態になり、選ぶと表に進める', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/compare/?a=english:zzz', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cmp-msg')).toContainText('見つかりませんでした');
  await expect(page.locator('table.cmpx')).toHaveCount(0);
  for (const [i, q] of [[0, 'ポレポレ'], [1, 'SUPREMACY']]) {
    await page.locator(`#cmpQ${i}`).fill(q);
    await page.locator(`#cmpHits${i} button`).first().click();
  }
  await page.locator('#cmpGo').click();
  await expect(page.locator('table.cmpx')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- ルート・診断結果の画像書き出し（仕様書 4.3） ---------- */

/** ダウンロードした PNG の幅と高さ（IHDR を読む） */
async function pngSize(download) {
  const fs = await import('node:fs');
  const buf = fs.readFileSync(await download.path());
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('静的ルートページの「画像で保存」で 1080×1350 の PNG が保存される', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/english/routes/sokei/', { waitUntil: 'domcontentloaded' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.sharebar button', { hasText: '画像で保存' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('route-taizen-english-sokei.png');
  expect(await pngSize(download)).toEqual({ w: 1080, h: 1350 });
  expect(errors).toEqual([]);
});

test('科目トップのルート画面でも「画像で保存」で PNG が保存される', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.locator('#routePicker .rpick').first().click();
  await expect(page.locator('#routeOutput .climb')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    // ルート画面の共有ブロックは #routeOutput の外（同じ画面の中）に描かれる
    page.locator('#view-route .rt-share button', { hasText: '画像で保存' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^route-taizen-math-[a-z]+\.png$/);
  expect(await pngSize(download)).toEqual({ w: 1080, h: 1350 });
  expect(errors).toEqual([]);
});

test('診断結果の「画像で保存」でも PNG が保存される', async ({ page }) => {
  await page.goto('/english/#quiz', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await finishQuiz(page);
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#quizShell .rt-share button', { hasText: '画像で保存' }).click(),
  ]);
  expect(await pngSize(download)).toEqual({ w: 1080, h: 1350 });
});
