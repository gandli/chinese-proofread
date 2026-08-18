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
        applyHighlights(msg.fullText ?? '', msg.diffs);
        sendResponse({ ok: true });
        return;
      }
    });
  },
});

// 基于原文定位：diffs 的 position 相对提取全文（Readability 可能规范空白），
// 用「原文片段模糊匹配」把偏移映射回页面文本节点，避免规范化漂移。
// ponytail: 测试页无空白差异；含大段空白的真实页面定位可能偏差，需要时升级为 TreeWalker 全文索引
function applyHighlights(fullText: string, diffs: Array<{ position: number; original: string; corrected: string }>) {
  const norm = (s: string) => s.replace(/\s+/g, '');

  // 页面全部文本 + 节点索引（与 popup 提取用同一 norm 规则对齐）
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let pageText = '';
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    pageText += node.data;
    nodes.push(node);
  }
  const pageNorm = norm(pageText);

  const targets: Array<{ node: Text; localPos: number; diff: (typeof diffs)[0] }> = [];
  for (const d of diffs) {
    const ctxBefore = fullText.slice(Math.max(0, d.position - 8), d.position);
    const ctxAfter = fullText.slice(d.position + d.original.length, d.position + d.original.length + 8);
    const needle = norm(ctxBefore + d.original + ctxAfter);

    let from = 0;
    let found = false;
    while (!found) {
      const idx = pageNorm.indexOf(needle, from);
      if (idx === -1) break;
      // idx 是 norm 后坐标；找对应原文节点：累计 norm 长度逼近 idx
      let acc = 0;
      for (const n of nodes) {
        const nNorm = norm(n.data);
        if (idx >= acc && idx < acc + nNorm.length) {
          // 该节点内 localPos：norm 对齐（无空白时即原始偏移）
          let consumed = 0;
          let local = 0;
          for (const ch of n.data) {
            if (consumed >= idx - acc) break;
            if (!/\s/.test(ch)) consumed++;
            local++;
          }
          targets.push({ node: n, localPos: local, diff: d });
          found = true;
          break;
        }
        acc += nNorm.length;
      }
      from = idx + 1; // 防重复匹配死循环
    }
  }

  // 倒序处理避免偏移失效
  for (const t of targets.reverse()) {
    const range = document.createRange();
    range.setStart(t.node, t.localPos);
    range.setEnd(t.node, t.localPos + t.diff.original.length);
    const mark = document.createElement('mark');
    mark.style.cssText = 'background:transparent;text-decoration:underline wavy #ef4444 2px;cursor:pointer;color:inherit';
    mark.title = `${t.diff.original} → ${t.diff.corrected}`;
    try {
      range.surroundContents(mark);
    } catch {
      // 跨节点边界跳过
    }
  }
}