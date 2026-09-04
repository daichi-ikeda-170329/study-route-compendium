/**
 * Firefox と WebKit でも主要な流れが動くことを確かめる。
 *
 * **全部の spec を 3 ブラウザへ掛け算しない。** 4 幅 × 3 ブラウザにすると実行時間が
 * 跳ね、落ちたときに読む気がなくなる。ブラウザごとに差が出るところ
 * （描画・キーボード操作・localStorage・共有・fetch）だけをここへ集める。
 *
 * **WebKit は Safari 実機ではない。** Playwright の WebKit は同じエンジン系統だが
 * 別物で、実機の Safari で起きる問題を必ず再現するわけではない。
 * 実機確認は運営者の作業として `docs/qa-report-template.md` に分けてある。
 *
 * 回すのは playwright.config.mjs の firefox-desktop / webkit-desktop / webkit-mobile。
 */
import { test } from '@playwright/test';
import { expect, waitForApp, collectErrors, horizontalOverflow, focused } from './helpers.mjs';

/* ============================================================
   1. トップ → 科目 → 書籍詳細 → 外部ストアリンク
   ============================================================ */

test('トップから科目・書籍詳細まで辿れ、外部ストアの href が正しい', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toBeVisible();

  await page.locator('a[href="/math/"]').first().click();
  await waitForApp(page);
  await expect(page).toHaveURL(/\/math\/$/);

  await page.goto('/math/books/ao/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('青チャート');

  /* **実際に遷移しない。** 外部サイトへ出ると相手に負荷をかけるうえ、
     結果が相手の調子に左右される。href の形だけを確かめる */
  const az = page.locator('a.az').first();
  if (await az.count()) {
    const href = await az.getAttribute('href');
    expect(href, 'Amazon リンクが amazon.co.jp を指していない').toMatch(/^https:\/\/www\.amazon\.co\.jp\//);
    expect(await az.getAttribute('rel'), 'rel に noopener が無い').toContain('noopener');
    expect(await az.getAttribute('target')).toBe('_blank');
  }
  expect(errors).toEqual([]);
});

/* ============================================================
   2. 診断をキーボードだけで終え、共有 URL を復元する
   ============================================================ */

test('診断をキーボードだけで終えられ、共有 URL が復元できる', async ({ page }) => {
  await page.goto('/math/#quiz', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);

  for (let step = 0; step < 8; step++) {
    if (await page.locator('#quizShell .result-hero').count()) break;
    const opt = page.locator('#quizShell .opt').first();
    if (!(await opt.count())) break;
    await opt.focus();
    await page.keyboard.press('Enter');
    const next = page.locator('#quizNext');
    if (!(await next.count())) break;
    await next.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();

  const url = await page.locator('#quizShell .rt-share').getAttribute('data-rt-url');
  expect(url, '共有 URL が作られていない').toBeTruthy();

  // 復元
  const target = new URL(url).search;
  await page.goto(`/math/${target}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await expect(page.locator('#quizShell .result-hero, #routeOutput .climb').first()).toBeVisible();
  // 復元後はアドレスバーから共有パラメータが消える
  await expect.poll(() => page.evaluate(() => location.search)).toBe('');
});

/* ============================================================
   3. 大学の候補をキーボードで操作する
   ============================================================ */

test('大学の候補をキーボードで選べる', async ({ page }) => {
  await page.goto('/math/#route', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);

  await page.locator('button[data-m="uni"]').click();
  const input = page.locator('#uniInput');
  await input.fill('東京大学');
  await expect(page.locator('#uniSug [role="option"]').first()).toBeVisible();

  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue(/東京大学/);

  /* Escape で候補が閉じ、入力欄から離脱できる。
     **DOM から消えるのではなく、閉じた状態になる**（中身は残したまま
     `.open` を外して隠す）ので、件数ではなく aria-expanded と見え方で確かめる。
     e2e/flows.spec.mjs の同名の検査と同じ見方にそろえてある */
  await input.fill('東京');
  await expect(page.locator('#uniSug [role="option"]').first()).toBeVisible();
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#uniSug [role="option"]').first()).toBeHidden();
});

/* ============================================================
   4. 学習ペースの変更と残り時間の再計算
   ============================================================ */

test('学習ペースを変えると残り時間が変わる', async ({ page }) => {
  await page.goto('/math/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.evaluate(() => { window.selectTier('top'); window.go('route'); });
  await page.waitForSelector('.pace__range');

  const hours = () => page.evaluate(() => {
    const t = document.querySelector('.pace__range')?.textContent || '';
    return [...t.matchAll(/約\s*(\d+)\s*時間/g)].map(m => Number(m[1]));
  });
  const before = await hours();
  expect(before.length, '下限・標準・上限の 3 本が出ていない').toBe(3);

  // 1 日に使える時間を増やすと、完了の見込みが早くなる（残り時間そのものは変わらない）
  const dates = () => page.evaluate(() =>
    [...document.querySelectorAll('.pace__range dd')].map(n => n.textContent.trim()));
  const beforeDates = await dates();
  await page.evaluate(() => window.RTPace.setWeekday('6'));
  await page.waitForTimeout(300);
  const afterDates = await dates();
  expect(afterDates, '時間を増やしても見込みが変わらない').not.toEqual(beforeDates);
});

/* ============================================================
   5. 進捗の保存・再読み込み・取り出し
   ============================================================ */

test('進捗を保存でき、再読み込みしても残る', async ({ page }) => {
  await page.goto('/math/books/ao/', { waitUntil: 'domcontentloaded' });
  const sel = page.locator('[data-rt-progress] select');
  await sel.selectOption('in_progress');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rt-progress] select')).toHaveValue('in_progress');

  await page.goto('/progress/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#pgList .pg-row')).toHaveCount(1);

  // 取り出しの中身が作れる（ダウンロードそのものはブラウザ差が大きいので中身だけ見る）
  const out = await page.evaluate(() => window.RTProgress.exportData());
  expect(out.version).toBe(1);
  expect(Object.keys(out.books)).toContain('math:ao');
});

/* ============================================================
   6. 任意の追加質問を飛ばせる
   ============================================================ */

test('追加質問を開かなくても結果が読める', async ({ page }) => {
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
    await page.waitForTimeout(150);
  }
  await expect(page.locator('#quizShell .result-hero')).toBeVisible();
  const refine = page.locator('#quizShell .rt-refine details');
  await expect(refine).toHaveCount(1);
  await expect(refine, '最初から開いている').not.toHaveAttribute('open', /.*/);
});

/* ============================================================
   7. 詳細検索の複合 filter
   ============================================================ */

test('詳細検索で複合の絞り込みができる', async ({ page }) => {
  await page.goto('/search/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#sfResultsHead')).toContainText('冊', { timeout: 20000 });

  await page.locator('#sf-subjects-math').check();
  await expect(page.locator('#sfResultsHead')).toHaveText(/162 冊/);
  await page.locator('#sf-diffBands-adv').check();
  const n = Number((await page.locator('#sfResultsHead').textContent()).match(/(\d+) 冊/)[1]);
  expect(n).toBeLessThan(162);
  expect(n).toBeGreaterThan(0);
});

/* ============================================================
   8. 狭い画面で横にはみ出さない
   ============================================================ */

test('狭い画面でも自サイト由来の横はみ出しが無い', async ({ page }, testInfo) => {
  // webkit-mobile は iPhone 14 の幅で回る。desktop の project では 320px に絞る
  if (!testInfo.project.name.includes('mobile')) {
    await page.setViewportSize({ width: 320, height: 640 });
  }
  for (const url of ['/', '/math/', '/search/', '/progress/', '/math/books/ao/']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    const r = await horizontalOverflow(page);
    expect(r.offenders, `${url} ではみ出している要素`).toEqual([]);
  }
});

/* ============================================================
   9. 自サイト由来のエラーと 404 が無い
   ============================================================ */

test('自サイト由来のエラーと 404 が無い', async ({ page }) => {
  const errors = collectErrors(page);
  const notFound = [];
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() !== 404) return;
    // 自サイトのものだけを見る。第三者の 404 はこちらで直せない
    if (u.includes('127.0.0.1') || u.includes('localhost')) notFound.push(`${res.status()} ${u}`);
  });

  for (const url of ['/', '/math/', '/search/', '/progress/', '/math/books/ao/', '/math/routes/top/']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await page.waitForTimeout(400);
  }
  expect(errors, '自サイト由来のエラー').toEqual([]);
  expect(notFound, '自サイトの 404').toEqual([]);
});

/* ============================================================
   キーボードの入口（フォーカスが見える）
   ============================================================ */

test('主要ページで最初の Tab がフォーカスできる要素へ入る', async ({ page }) => {
  for (const url of ['/', '/search/', '/progress/']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('Tab');
    const f = await focused(page);
    expect(f, `${url}: Tab でどこにもフォーカスが入らない`).not.toBeNull();
    expect(['a', 'button', 'input', 'select', 'summary', 'textarea'], `${url}: ${f.tag}`).toContain(f.tag);
  }
});
