// Content Script: 提取正文 + 应用高亮
import { Readability } from '@mozilla/readability';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    document.documentElement.dataset.psInjected = 'true';
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'extract') {
        const doc = document.cloneNode(true) as Document;
        const article = new Readability(doc).parse();
        sendResponse({ text: article?.textContent ?? document.body.innerText });
        return;
      }
      if (msg?.type === 'highlight') {
        applyHighlights(msg.diffs);
        sendResponse({ ok: true });
        return;
      }
    });
  },
});

// ponytail: 简单实现对可见文本节点做字符偏移定位，复杂 DOM 边界情况后续再处理
function applyHighlights(diffs: Array<{ position: number; original: string; corrected: string }>) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let offset = 0;
  const targets: Array<{ node: Text; localPos: number; diff: (typeof diffs)[0] }> = [];

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.data.length;
    for (const d of diffs) {
      if (d.position >= offset && d.position < offset + len) {
        targets.push({ node, localPos: d.position - offset, diff: d });
      }
    }
    offset += len;
  }

  // 倒序处理避免偏移失效
  for (const t of targets.reverse()) {
    const range = document.createRange();
    range.setStart(t.node, t.localPos);
    range.setEnd(t.node, t.localPos + t.diff.original.length);
    const mark = document.createElement('mark');
    mark.style.cssText = 'background:#fef9c3;border-bottom:2px solid #f59e0b;cursor:pointer';
    mark.title = `${t.diff.original} → ${t.diff.corrected}`;
    try {
      range.surroundContents(mark);
    } catch {
      // 跨节点边界跳过
    }
  }
}