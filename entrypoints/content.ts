// Content Script: 正文提取 + CSS Custom Highlights 高亮 + 点击 popover 修正
// 参照 Proofly 模式：高亮不污染 DOM（::highlight()），修正原地替换 + 撤销
import { Readability } from "@mozilla/readability";

import { isFromThisExtension } from "../src/utils/extension-messaging";
import { ProofHighlighter } from "../src/content/proof-highlighter";

// Polyfill: Range.replaceWith (ES2022) - TS lib may not include it yet
declare global {
  interface Range {
    replaceWith(...nodes: (Node | string)[]): void;
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    document.documentElement.dataset.psInjected = "true";
    if (!("highlights" in CSS)) return; // 老浏览器降级：无高亮无修正

    const highlighter = new ProofHighlighter();

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // 验证发送者：仅接受扩展自身消息，防止恶意页面注入
      if (!isFromThisExtension(sender)) return;
      if (msg?.type === "extract") {
        const doc = document.cloneNode(true) as Document;
        const article = new Readability(doc).parse();
        sendResponse({ text: article?.textContent ?? document.body.innerText });
        return;
      }
      if (msg?.type === "highlight") {
        highlighter.apply(msg.fullText ?? "", msg.diffs);
        // 同步到 side panel
        chrome.runtime.sendMessage({
          type: "sync-diffs",
          diffs: msg.diffs,
          fullText: msg.fullText,
          tabId: msg.tabId,
        });
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "remove-highlight") {
        highlighter.removeByDiff(msg.diff);
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "clear-highlights") {
        highlighter.clearAll();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "jump-to") {
        highlighter.jumpTo(msg.diff);
        sendResponse({ ok: true });
        return;
      }
    });
  },
});
