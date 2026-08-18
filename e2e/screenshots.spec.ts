// 使用手册截图生成脚本 — Playwright 加载真实扩展跑全流程，每个事务截图
// 运行: bun run test:screenshots → 输出 docs/guide/screenshots/*.png
// 与 e2e/extension.spec.ts 共用 launchWithExtension，但截图脚本带屏显尺寸 + 截图

import { test, expect } from '@playwright/test';
import { chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '../.output/chrome-mv3');
const SHOT_DIR = path.resolve(__dirname, '../docs/guide/screenshots');

// 加载扩展（MV3），共用 launchWithExtension
async function launchWithExtension(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  return context;
}

async function shot(page: any, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
  console.log('📸', name);
}

test.setTimeout(300_000);
test('手册截图：校对全流程', async () => {
  const context = await launchWithExtension();
  try {
    // 1. 打开测试页
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto('http://localhost:4173/typo-page.html');
    await page.waitForSelector('[data-ps-injected]', { state: 'attached' });

    // 动态获取扩展 ID
    const workers = context.serviceWorkers();
    const extId = workers[0]?.url()?.split('/')[2];
    if (!extId) throw new Error('扩展 ID 未找到');

    // 1b. 原始测试页（校对前）
    await page.bringToFront();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-typo-page.png') });

    // 打开 popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');
    await page.bringToFront();

    // 01. 空闲态 popup
    await shot(popup, '01-popup-idle.png');

    // 02. 校对过程
      await popup.click('button.action');
      await popup.waitForSelector('.action--busy', { timeout: 30_000 });
      await shot(popup, '02-popup-correcting.png');

      // 注入模拟校对结果（绕过真实模型推理，加速截图）
        const mockDiffs = [
          { position: 2, original: '新', corrected: '心', confidence: 0.99 },
          { position: 8, original: '高', corrected: '兴', confidence: 0.95 },
        ];
        await page.evaluate(async (diffs) => {
          const h = (window as any).__proofHighlighter;
          if (h) h.apply('今天新情很好，我也很高心。', diffs);
        }, mockDiffs);

        // 03. 校对结果（等待真实模型完成 → 状态行 + 清除高亮按钮）
        await popup.waitForSelector('button.action--done', { timeout: 120_000 });
        await shot(popup, '03-popup-result.png');

    // 04. 页面高亮
    await page.bringToFront();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOT_DIR, '04-page-highlight.png') });

    // 05. 清除高亮 → 回到空闲
    await popup.bringToFront();
    await popup.click('button.action--secondary');
    await popup.waitForSelector('button.action:not(.action--done)', { timeout: 5_000 });
    await shot(popup, '05-popup-idle-after-clear.png');

    // 06. 重新校对 → 全部已修正（无错的页面）
    await popup.click('button.action');
    await popup.waitForSelector('.action--busy', { timeout: 30_000 });
    await popup.waitForSelector('button.action--done', { timeout: 180_000 });
    await shot(popup, '06-popup-all-fixed.png');

  } finally {
    await context.close();
  }
});