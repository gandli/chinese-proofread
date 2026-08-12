import { test, expect } from '@playwright/test';
import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3');

// 加载已构建的扩展（MV3）
async function launchWithExtension(): Promise<{ context: BrowserContext; sw: Worker }> {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  const sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  return { context, sw };
}

test('扩展 background service worker 加载', async () => {
  const { context, sw } = await launchWithExtension();
  expect(sw.url()).toContain('background.js');
  await context.close();
});

test('content script 注入测试页', async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();
  await page.goto('http://localhost:4173/typo-page.html');
  await page.waitForLoadState('domcontentloaded');

  // content script main() 注入标记，确认其真实运行于页面
  const injected = await page.evaluate(
    () => document.documentElement.dataset.psInjected ?? null,
  );
  expect(injected).toBe('true');
  await context.close();
});
