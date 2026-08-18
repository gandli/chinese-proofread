// 使用手册截图生成脚本 — Playwright 加载真实扩展跑全流程，每个事务截图
// 运行: bun run test:screenshots → 输出 docs/guide/screenshots/*.png
// popup 通过 chrome-extension://<id>/popup.html 打开，ID 从 chrome://extensions 探测

import { test } from '@playwright/test';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3');
const SHOT_DIR = path.resolve(__dirname, '../docs/guide/screenshots');

const PAGE_W = 1280;
const PAGE_H = 800;

async function launchWithExtension(): Promise<{ context: BrowserContext; page: Page; popup: Page; extId: string }> {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: PAGE_W, height: PAGE_H },
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  const page = await context.newPage();

  // 从 chrome://extensions 页面 shadow DOM 探测扩展 ID
  await page.goto('chrome://extensions/');
  await page.waitForTimeout(1200);
  const extId = await page.evaluate(() => {
    const manager = document.querySelector('extensions-manager') as any;
    if (!manager?.shadowRoot) return null;
    const list = manager.shadowRoot.querySelector('extensions-item-list') as any;
    if (!list?.shadowRoot) return null;
    const items = [...list.shadowRoot.querySelectorAll('extensions-item')] as any[];
    for (const item of items) {
      const name = item.shadowRoot?.querySelector('#name')?.textContent ?? '';
      if (name.includes('校对') || name.includes('chinese')) return item.id;
    }
    return null;
  });
  if (!extId) throw new Error('未从 chrome://extensions 探测到扩展 ID');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForLoadState('domcontentloaded');

  // 让页面 tab 成为 active：popup 的 chrome.tabs.query({active:true}) 需要拿到目标页
  // （真实场景：popup 是浮层，活动 tab 始终是页面）
  await page.bringToFront();
  await popup.waitForTimeout(300);
  // popup 保活：后台扩展页可能被 Chrome 冻结？MV3 popup 是普通页，非 SW，不会冻结。
  return { context, page, popup, extId };
}

async function shot(p: Page, name: string) {
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOT_DIR, name) });
}

test.setTimeout(300_000);
test('手册截图：校对全流程', async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const { context, page, popup } = await launchWithExtension();
  try {
    // 1. 空闲态 popup
    await page.goto('http://localhost:4173/typo-page.html');
    await shot(popup, '01-popup-idle.png');

    // 1b. 原始测试页（校对前）
    await page.bringToFront();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-typo-page.png') });
    // 保持 page active：popup 的 tabs.query 需要目标页为活动 tab
    await page.bringToFront();

    // 2. 校对过程
    await popup.click('button.action');
    await popup.waitForSelector('.action--busy', { timeout: 30_000 });
    await shot(popup, '02-popup-correcting.png');

    // 3. 校对结果
    await popup.waitForSelector('.bubble-list', { timeout: 180_000 }).catch(async () => {
      const html = await popup.evaluate(() => document.body.innerText);
      console.error('POPUP STATE:', html.slice(0, 500));
      await popup.screenshot({ path: path.join(SHOT_DIR, 'debug-error-state.png') });
      throw new Error('校对未完成: ' + html.slice(0, 200));
    });
    await shot(popup, '03-popup-result.png');

    // 4. 展开气泡
    await popup.click('.bubble-trigger');
    await popup.waitForSelector('.bubble', { timeout: 5_000 });
    await popup.locator('.bubble').scrollIntoViewIfNeeded();
    await shot(popup, '04-popup-bubble.png');

    // 5. 采用第一条
    await popup.click('.bubble-accept');
    await popup.waitForSelector('.bubble-trigger--done', { timeout: 5_000 });
    await shot(popup, '05-popup-applied.png');

    // 6. 页面高亮
    await page.bringToFront();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOT_DIR, '06-page-highlight.png') });

    // 7. 全部采用 → 全部已修正
    await popup.bringToFront();
    const remaining = await popup.locator('.bubble-trigger:not(.bubble-trigger--done)').count();
    for (let i = 0; i < remaining; i++) {
      await popup.locator('.bubble-trigger:not(.bubble-trigger--done)').first().click();
      await popup.locator('.bubble-accept').click();
      await popup.waitForTimeout(200);
    }
    await popup.waitForSelector('text=全部已修正', { timeout: 5_000 });
    await shot(popup, '07-popup-all-fixed.png');
  } finally {
    await context.close();
  }
});