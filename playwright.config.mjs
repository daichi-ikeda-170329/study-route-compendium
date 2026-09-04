/**
 * E2E とアクセシビリティ検査の設定。
 *
 * **file:// では確かめない。** 実際の配信と同じ HTTP 経由で見る
 * （絶対パスのリンク・fetch・localStorage の扱いが file:// では変わるため）。
 * サーバーは Node 標準の静的配信スクリプト（build/serve.mjs）を使う。
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.RT_PORT || 4173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    /* Chromium の 4 幅。**ここが本体で、全 spec を回す。**
       cross-browser の spec だけは別 project で回すので、ここでは除く */
    { name: 'desktop-1366', testIgnore: /cross-browser\.spec\.mjs/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tablet-768',   testIgnore: /cross-browser\.spec\.mjs/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-375',   testIgnore: /cross-browser\.spec\.mjs/, use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'narrow-320',   testIgnore: /cross-browser\.spec\.mjs/, use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } } },

    /* Firefox / WebKit。**全 spec を掛け算しない。**
       4 幅 × 3 ブラウザにすると実行時間が跳ね、落ちたときに読む気がなくなる。
       ブラウザごとの差が出るところ（描画・入力・保存・共有）だけを
       e2e/cross-browser.spec.mjs にまとめ、これらの project で回す。

       **WebKit を「Safari 実機」と書かない。** 別物である（docs/qa-report-template.md）。 */
    { name: 'firefox-desktop', testMatch: /cross-browser\.spec\.mjs/, use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 900 } } },
    { name: 'webkit-desktop',  testMatch: /cross-browser\.spec\.mjs/, use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 900 } } },
    { name: 'webkit-mobile',   testMatch: /cross-browser\.spec\.mjs/, use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `node build/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
