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
    { name: 'desktop-1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tablet-768',   use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-375',   use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'narrow-320',   use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } } },
  ],
  webServer: {
    command: `node build/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
