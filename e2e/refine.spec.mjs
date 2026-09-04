/**
 * 診断のあとの任意の追加質問（assets/js/refine.js）を、実際のブラウザで確かめる。
 *
 * **いちばん大事なのは「答えなければ何も変わらない」こと。**
 * 追加質問は結果の後ろに置いた独立した層で、既存の診断（QUIZ）と
 * 共有 URL の仕組みには触れていない。それを結果の一致で示す。
 */
import { test } from '@playwright/test';
import { expect, waitForApp, collectErrors, focused } from './helpers.mjs';

/** 診断を最後まで進めて結果を出す。選択肢はすべて先頭を選ぶ（決まった経路） */
async function runQuiz(page) {
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
}

/** 結果の中身と共有 URL を、比べられる形で取り出す */
async function snapshot(page) {
  return page.evaluate(() => {
    const shell = document.getElementById('quizShell');
    const clone = shell.cloneNode(true);
    // 追加質問の層そのものは比較から外す（これが「後ろに足したもの」）
    clone.querySelectorAll('.rt-refine').forEach(n => n.remove());
    /* 書影は読み込みの進み具合で属性と class が変わる（covLoad / covErr が
       次の候補へ差し替える）。比べたいのは結果の中身なので、画像は外す。
       外さないと、2 回のスナップショットの間に画像が 1 枚届いただけで落ちる */
    clone.querySelectorAll('img').forEach(n => n.remove());
    clone.querySelectorAll('[data-s]').forEach(n => n.removeAttribute('data-s'));
    // .bcov には読み込みの結果で ok / fb が付く。これも中身ではなく状態
    clone.querySelectorAll('.bcov').forEach(n => { n.className = 'bcov'; });
    // コピーの結果メッセージも操作で変わる
    clone.querySelectorAll('.rt-share__msg').forEach(n => { n.textContent = ''; });
    return {
      html: clone.innerHTML,
      shareUrl: document.querySelector('#quizShell .rt-share')?.getAttribute('data-rt-url') || null,
      shareLabel: document.querySelector('#quizShell .rt-share')?.getAttribute('data-rt-label') || null,
    };
  });
}

test('追加質問を開かなければ、結果も共有 URL も変わらない', async ({ page }) => {
  const errors = collectErrors(page);

  // refine.js を読み込まない状態を作る（改修前と同じ状態）
  await page.route('**/assets/js/refine.js', r => r.fulfill({ status: 204, body: '', headers: { 'content-type': 'text/javascript' } }));
  await runQuiz(page);
  const without = await snapshot(page);
  expect(without.shareUrl, '共有 URL が出ていない').toBeTruthy();

  // 通常どおり refine.js を読み込む
  await page.unroute('**/assets/js/refine.js');
  await runQuiz(page);
  const withRefine = await snapshot(page);

  expect(withRefine.shareUrl, '追加質問を足したら共有 URL が変わった').toBe(without.shareUrl);
  expect(withRefine.shareLabel, '追加質問を足したら共有の表示名が変わった').toBe(without.shareLabel);
  expect(withRefine.html, '追加質問を足したら結果の中身が変わった').toBe(without.html);
  expect(errors).toEqual([]);
});

test('追加質問は結果の後ろにあり、最初は閉じている', async ({ page }) => {
  await runQuiz(page);
  const box = page.locator('#quizShell .rt-refine');
  await expect(box).toHaveCount(1);
  await expect(box.locator('details')).not.toHaveAttribute('open', /.*/);
  await expect(box.locator('summary')).toContainText('任意');
});

test('開いて閉じても、共有 URL は変わらない', async ({ page }) => {
  await runQuiz(page);
  const before = await snapshot(page);
  const details = page.locator('#quizShell .rt-refine details');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', /.*/);
  await details.locator('summary').click();
  const after = await snapshot(page);
  expect(after.shareUrl).toBe(before.shareUrl);
  expect(after.html).toBe(before.html);
});

test('答えると、何を変えたかが出る', async ({ page }) => {
  await runQuiz(page);
  await page.locator('#quizShell .rt-refine summary').click();

  await page.locator('#rtRefineWeekday').selectOption({ index: 3 });
  await expect(page.locator('#quizShell .rt-refine__applied')).toContainText('平日に使える時間');
  await expect(page.locator('#rtRefineLive')).toContainText('計算し直しました');
});

test('答えても共有 URL は変わらない', async ({ page }) => {
  await runQuiz(page);
  const before = await snapshot(page);
  await page.locator('#quizShell .rt-refine summary').click();
  await page.locator('#rtRefineWeekday').selectOption({ index: 3 });
  await page.locator('#rtRefineDeadline').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  const after = await snapshot(page);
  expect(after.shareUrl, '追加質問に答えたら共有 URL が変わった').toBe(before.shareUrl);
});

test('キーボードだけで開いて答えられる', async ({ page }) => {
  await runQuiz(page);
  const summary = page.locator('#quizShell .rt-refine summary');
  await summary.focus();
  const f = await focused(page);
  expect(f.tag).toBe('summary');
  await page.keyboard.press('Enter');
  await expect(page.locator('#quizShell .rt-refine details')).toHaveAttribute('open', /.*/);

  const sel = page.locator('#rtRefineWeekday');
  await sel.focus();
  expect((await focused(page)).tag).toBe('select');
});

test('追加の回答がネットワークへ出ない', async ({ page }) => {
  const reqs = [];
  page.on('request', (req) => {
    let body = '';
    try { body = req.postData() || ''; } catch { /* 取れないこともある */ }
    reqs.push(decodeURIComponent(req.url()) + ' ' + body);
  });

  await runQuiz(page);
  await page.locator('#quizShell .rt-refine summary').click();
  await page.locator('#rtRefineWeekday').selectOption({ index: 4 });
  await page.locator('#rtRefineDeadline').selectOption({ index: 1 });

  const bookSel = page.locator('#rtRefineBook');
  if (await bookSel.count()) {
    const opts = await bookSel.locator('option').count();
    if (opts > 1) {
      await bookSel.selectOption({ index: 1 });
      await page.locator('#rtRefinePct').fill('55');
      await page.locator('#quizShell .rt-refine__btn').click();
    }
  }
  await page.waitForTimeout(600);

  // 進捗率と、選んだ参考書の ID が外へ出ていないこと
  const picked = await page.evaluate(() => {
    const s = document.getElementById('rtRefineBook');
    return s && s.value ? s.value.split(':').slice(1).join(':') : null;
  });
  const needles = ['rtRefinePct', '"progressPercent"'];
  if (picked) needles.push(picked);

  const leaked = [];
  for (const r of reqs) {
    for (const n of needles) if (n && r.includes(n)) leaked.push(`${n} → ${r.slice(0, 140)}`);
  }
  expect(leaked, '追加の回答が外部へ送られている').toEqual([]);
});

test('共有ブロックが、共有されないものを明示している', async ({ page }) => {
  await runQuiz(page);
  const note = page.locator('#quizShell .rt-share__note');
  await expect(note).toContainText('基礎診断の回答だけ');
  await expect(note).toContainText('学習の記録');
  await expect(note).toContainText('含まれません');
});
