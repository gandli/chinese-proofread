import { test, expect } from '@playwright/test';
import { chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3');

// 加载已构建的扩展（MV3）。
// 注意：不依赖 service worker 事件（CI/xvfb 无头下 MV3 SW 事件不稳定），
// 只验证 content script 注入 —— 这个在无头/有头都稳定。
async function launchWithExtension(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  return context;
}

test('扩展加载后 content script 注入测试页', async () => {
  const context = await launchWithExtension();
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
