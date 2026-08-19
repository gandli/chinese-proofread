// Background: 消息路由（引擎已迁至 popup —— SW 无法初始化 onnxruntime wasm）
export default defineBackground(() => {
  // popup 转发：popup -> background -> content（popup 无法可靠 query 目标 tab）
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 验证发送者：仅接受扩展自身消息
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === 'highlight-proxy') {
      void (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, err: 'no tab' }); return; }
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'highlight', fullText: msg.fullText, diffs: msg.diffs });
        sendResponse(resp ?? { ok: false, err: 'no resp' });
      })();
      return true; // 异步响应
    }
  });
  console.log('[chinese-proofread] background ready (engine runs in popup)');
});