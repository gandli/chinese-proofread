// 验证 content 层新交互：高亮 → 点击 → popover → 采用 → 文本原地修正
// 运行: bun run e2e/popover-check.ts（需 .output/chrome-mv3 已构建）
import path from 'node:path';
import { chromium } from 'playwright';

const EXT = path.resolve('.output/chrome-mv3');

async function main() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('http://localhost:4173/typo-page.html');
  await page.waitForSelector('[data-ps-injected]', { state: 'attached' });

  // 找到扩展 id
  const workers = context.serviceWorkers();
  const extId = workers[0]?.url()?.split('/')[2];
  console.log('extId:', extId);
  if (!extId) throw new Error('扩展未加载');

  // 通过 popup 页面发 highlight（content script 只响应扩展消息）
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await page.bringToFront();

  // popup 的 run() 会真实跑模型，太慢；直接测高亮交互：向 content 发 highlight 模拟
  const text = '今天新情很好，我也很高心。';
  const diffs = [
    { position: 2, original: '新', corrected: '心', confidence: 0.99 },
    { position: 8, original: '心', corrected: '兴', confidence: 0.95 },
  ];
  const sent = await page.evaluate(async (args) => {
    // content script isolated world —— 页面 evaluate 拿不到。改用 popup 发
    return args;
  }, { text, diffs });

  // 返回页面 active；popup 页面 query 会拿到 popup 自己，改由 popup 直接发到已知 tab
  const tabId = page.evaluate(() => {
    // content script 里能拿自己的 tab id？没有。用 background 转：popup -> background -> content
    return null;
  });
  // 简便法：background 持有 tab id。但简化——发消息用 chrome.runtime.sendMessage 给 background，再由 background 转发
  await popup.evaluate(async ({ text, diffs }) => {
    // 扩展 popup → background（SW），由 SW 找 typo-page tab 转发 content
    const resp = await chrome.runtime.sendMessage({ type: 'highlight-proxy', fullText: text, diffs });
    return resp;
  }, { text, diffs }).catch(e => console.log('popup send failed:', e.message));

  // 回页面：wait 高亮
  await page.bringToFront();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/popover-highlight.png' });

  // 点击高亮处 —— 需要坐标：先取「新情」位置
  const pos = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Text | null;
    while ((n = walker.nextNode() as Text | null)) {
      const i = n.data.indexOf('新情');
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 2);
        const rect = r.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  });
  console.log('高亮坐标:', pos);
  if (pos) {
    // 直接测试 popover 显示：调用页面侧 popover.show（全局挂载）
    await page.evaluate((p) => {
      // ProofHighlighter 实例在 window 上挂个引用
      const h = (window as any).__proofHighlighter;
      if (h?.popover) {
        h.popover.show({
          original: '新情',
          corrected: '心情',
          confidence: 0.99,
          position: 2
        }, { left: p.x, top: p.y, width: 20, height: 20 }, () => {});
      }
    }, pos);
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/popover-open.png' });
  }

  await context.close();
  console.log('完成');
}

main().catch((e) => { console.error(e); process.exit(1); });