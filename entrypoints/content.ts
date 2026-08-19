// Content Script: 正文提取 + CSS Custom Highlights 高亮 + 点击 popover 修正
// 参照 Proofly 模式：高亮不污染 DOM（::highlight()），修正原地替换 + 撤销
import { Readability } from '@mozilla/readability';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    document.documentElement.dataset.psInjected = 'true';
    if (!('highlights' in CSS)) return; // 老浏览器降级：无高亮无修正

    const highlighter = new ProofHighlighter();

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // 验证发送者：仅接受扩展自身消息，防止恶意页面注入
      if (sender.id !== chrome.runtime.id) return;
      if (msg?.type === 'extract') {
        const doc = document.cloneNode(true) as Document;
        const article = new Readability(doc).parse();
        sendResponse({ text: article?.textContent ?? document.body.innerText });
        return;
      }
      if (msg?.type === 'highlight') {
        highlighter.apply(msg.fullText ?? '', msg.diffs);
        // 同步到 side panel
        chrome.runtime.sendMessage({ type: 'sync-diffs', diffs: msg.diffs, fullText: msg.fullText, tabId: msg.tabId });
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === 'remove-highlight') {
        highlighter.removeByDiff(msg.diff);
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === 'clear-highlights') {
        highlighter.clearAll();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === 'jump-to') {
        highlighter.jumpTo(msg.diff);
        sendResponse({ ok: true });
        return;
      }
    });
  },
});

interface Diff {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}

const STYLE_ID = 'ps-proof-style';
const UNDERLINE = 'wavy';
const COLOR = '#ef4444';

/** 页面级校对管理器：高亮 → 点击定位 → popover → 原地修正（含撤销） */
class ProofHighlighter {
  private diffNodes = new Map<HTMLElement, Array<{ node: Text; localPos: number; diff: Diff }>>();
  private popover: ProofPopover | null = null;
  private appliedRanges = new Set<Range>();
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  // 撤销栈：存储位置信息而非 Range（避免 replaceWith 后 Range 失效）
  private undoStack: Array<{ node: Text; startOffset: number; endOffset: number; oldText: string; newText: string; diff: Diff }> = [];
  private redoStack: Array<{ node: Text; startOffset: number; endOffset: number; oldText: string; newText: string; diff: Diff }> = [];

  constructor() {
    this.ensureStyle();
    this.popover = new ProofPopover();
    this.clickHandler = (e: MouseEvent) => this.handleClick(e);
    document.addEventListener('click', this.clickHandler, true);
    // 键盘撤销/重做
    document.addEventListener('keydown', (e) => this.handleKeydown(e), true);
    // 调试用：暴露实例到 window（方便手动测试）
    (window as any).__proofHighlighter = this;
  }

  private handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y') && e.shiftKey) {
      e.preventDefault();
      this.redo();
    }
  }

  /** 撤销最后一次修正 */
  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    // 重建 Range 并恢复原文
    const range = document.createRange();
    range.setStart(op.node, op.startOffset);
    range.setEnd(op.node, op.endOffset);
    (range as any).replaceWith(op.oldText);
    // 恢复高亮
    const hl = CSS.highlights.get('ps-proof') as Highlight | undefined;
    if (hl) {
      hl.add(range);
      this.appliedRanges.add(range);
    }
    // 记录到 redo 栈（更新位置为当前位置）
    this.redoStack.push({ ...op, startOffset: op.startOffset, endOffset: op.startOffset + op.oldText.length });
  }

  /** 重做 */
  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    // 重建 Range 并重新应用修正
    const range = document.createRange();
    range.setStart(op.node, op.startOffset);
    range.setEnd(op.node, op.endOffset);
    (range as any).replaceWith(op.newText);
    // 移除高亮
    const hl = CSS.highlights.get('ps-proof') as Highlight | undefined;
    if (hl) {
      hl.delete(range);
      this.appliedRanges.delete(range);
    }
    // 记录到 undo 栈
    this.undoStack.push({ ...op, startOffset: op.startOffset, endOffset: op.startOffset + op.newText.length });
  }

  /** 根据 popup 传来的全文+diffs，模糊匹配映射到页面文本节点并高亮 */
  apply(fullText: string, diffs: Diff[]) {
    this.clearAll();
    if (!diffs.length) return;

    const norm = (s: string) => s.replace(/\s+/g, '');
    // ctxBefore 内非空白字符数（diff 相对 needle 的偏移）
    const wrapLen = (s: string) => norm(s).length;
    // ponytail: 单节点假设（diff 与 ctxBefore 同节点才精确）；跨节点时 range.setStart 抛错跳过该 diff
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let pageText = '';
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      pageText += node.data;
      nodes.push(node);
    }
    const pageNorm = norm(pageText);

    const byNode = new Map<Text, Array<{ localPos: number; diff: Diff }>>();
    const ranges: Range[] = [];

    for (const d of diffs) {
      const ctxBefore = fullText.slice(Math.max(0, d.position - 8), d.position);
      const ctxAfter = fullText.slice(d.position + d.original.length, d.position + d.original.length + 8);
      const needle = norm(ctxBefore + d.original + ctxAfter);
      let from = 0;
      while (true) {
        const idx = pageNorm.indexOf(needle, from);
        if (idx === -1) break;
        // 映射 norm 坐标 → 文本节点局部偏移
        let acc = 0;
        for (const n of nodes) {
          const nNorm = norm(n.data);
          if (idx >= acc && idx < acc + nNorm.length) {
            // local = 该节点内第 (idx-acc) 个非空白字符的原始偏移
            let local = 0, remaining = idx - acc;
            for (const ch of n.data) {
              if (remaining <= 0) break;
              if (!/\s/.test(ch)) remaining--;
              local++;
            }
            // diff 起点 = needle 起点 + ctxBefore 的非空白长度
            const diffLocal = local + wrapLen(ctxBefore);
            const range = new Range();
            try {
              range.setStart(n, diffLocal);
              range.setEnd(n, diffLocal + d.original.replace(/\s/g, '').length);
              ranges.push(range);
              byNode.set(n, [...(byNode.get(n) ?? []), { localPos: diffLocal, diff: d }]);
            } catch { /* 跨节点边界跳过 */ }
            break;
          }
          acc += nNorm.length;
        }
        from = idx + 1;
      }
    }

    // 注册高亮
    const hl = new Highlight(...ranges);
    CSS.highlights.set('ps-proof', hl);
    for (const r of ranges) this.appliedRanges.add(r);

    // 记录节点关联（用于点击命中 + 修正后清理）
    this.diffNodes.clear();
    for (const [n, list] of byNode) {
      const holder = n.parentElement;
      if (holder) this.diffNodes.set(holder, list.map(({ localPos, diff }) => ({ node: n, localPos, diff })));
    }
  }

  private handleClick(e: MouseEvent) {
    if (!this.appliedRanges.size) return;
    // 使用 caretRangeFromPoint 获取点击位置的精确 Range（原生 API，支持跨节点、transform、滚动容器）
    const caretRange = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!caretRange) { this.popover?.hide(); return; }
    // 在已应用的高亮中查找包含该 caretRange 的 range
    const range = this.findRangeContainingCaret(caretRange);
    if (!range) { this.popover?.hide(); return; }
    const entry = this.findDiffForRange(range);
    if (!entry) { this.popover?.hide(); return; }
    
    // 检查是否在可编辑元素内
    const editableEl = this.isInEditable(range.startContainer);
    if (editableEl) {
      // 可编辑元素：使用原生 execCommand 或直接操作 value
      this.applyCorrectionInEditable(entry, editableEl);
    } else {
      const rect = range.getBoundingClientRect();
      this.popover?.show(entry.diff, rect, () => this.applyCorrection(entry));
    }
  }

  /** 判断节点是否在可编辑元素内（contenteditable/textarea/input） */
  private isInEditable(node: Node): HTMLElement | null {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
    while (el) {
      if ((el as HTMLElement).isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        return el as HTMLElement;
      }
      el = el.parentElement;
    }
    return null;
  }

  /** 查找包含 caretRange 的高亮 range */
  private findRangeContainingCaret(caretRange: Range): Range | null {
    for (const r of this.appliedRanges) {
      // 如果 caretRange 与高亮 range 相交，或 caretRange 的起点在高亮 range 内
      if (this.rangesIntersect(caretRange, r) || this.isPointInRange(caretRange.startContainer, caretRange.startOffset, r)) {
        return r;
      }
    }
    return null;
  }

  private rangesIntersect(a: Range, b: Range): boolean {
    // 简单判断：两个 range 的边界是否重叠
    const aBeforeB = a.compareBoundaryPoints(Range.END_TO_START, b) < 0;
    const bBeforeA = b.compareBoundaryPoints(Range.END_TO_START, a) < 0;
    return !aBeforeB && !bBeforeA;
  }

  private isPointInRange(node: Node, offset: number, range: Range): boolean {
    if (range.startContainer === node && range.endContainer === node) {
      return offset >= range.startOffset && offset <= range.endOffset;
    }
    // 跨节点情况简化处理：比较 boundary points
    try {
      const pointRange = document.createRange();
      pointRange.setStart(node, offset);
      pointRange.collapse(true);
      return range.compareBoundaryPoints(Range.START_TO_START, pointRange) <= 0 &&
             range.compareBoundaryPoints(Range.END_TO_END, pointRange) >= 0;
    } catch {
      return false;
    }
  }

  private findDiffForRange(range: Range): { node: Text; localPos: number; diff: Diff; range: Range } | null {
    for (const list of this.diffNodes.values()) {
      for (const item of list) {
        if (item.node === range.startContainer && item.localPos === range.startOffset) return { ...item, range };
      }
    }
    return null;
  }

  /** 原地修正 + 撤销 + 清除该处高亮（使用 Range.replaceWith 支持跨节点） */
  applyCorrection(entry: { node: Text; localPos: number; diff: Diff; range: Range }) {
    const { range, diff } = entry;
    const old = range.toString();
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;
    const node = range.startContainer as Text;
    // Range.replaceWith 自动处理跨节点、合并相邻文本节点 (ES2022)
    (range as any).replaceWith(diff.corrected);
    // 记录撤销栈（存位置而非 Range）
    this.undoStack.push({ node, startOffset, endOffset, oldText: old, newText: diff.corrected, diff });
    this.redoStack.length = 0; // 新操作清空 redo 栈
    // 移除该处高亮
    this.removeRangeFor(entry);
  }

  /** 可编辑元素内的修正（contenteditable/textarea/input） */
  applyCorrectionInEditable(entry: { node: Text; localPos: number; diff: Diff; range: Range }, editableEl: HTMLElement) {
    const { range, diff } = entry;
    const old = range.toString();
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;
    const node = range.startContainer as Text;
    
    if (editableEl.tagName === 'TEXTAREA' || editableEl.tagName === 'INPUT') {
      // textarea/input: 直接操作 value
      const textarea = editableEl as HTMLTextAreaElement | HTMLInputElement;
      const start = range.startOffset;
      const end = range.endOffset;
      textarea.value = textarea.value.slice(0, start) + diff.corrected + textarea.value.slice(end);
      // 触发 input 事件
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else if ((editableEl as HTMLElement).isContentEditable) {
      // contenteditable: 使用现代 Selection API 替代废弃的 execCommand
      this.applyCorrectionInContentEditable(entry, editableEl);
    }
    
    // 记录撤销栈（存位置而非 Range）
    this.undoStack.push({ node, startOffset, endOffset, oldText: old, newText: diff.corrected, diff });
    this.redoStack.length = 0;
    // 移除该处高亮
    this.removeRangeFor(entry);
  }
  
  /** contenteditable 现代修正：删除选区内容并插入纠正文本 */
  private applyCorrectionInContentEditable(entry: { node: Text; localPos: number; diff: Diff; range: Range }, editableEl: HTMLElement) {
    const { range, diff } = entry;
    
    // 保存当前选择
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // 删除选区内容
    range.deleteContents();
    
    // 创建文本节点并插入
    const textNode = document.createTextNode(diff.corrected);
    range.insertNode(textNode);
    
    // 将光标移到插入文本之后
    range.setStartAfter(textNode);
    range.collapse(true);
    
    // 恢复选择
    selection.removeAllRanges();
    selection.addRange(range);
    
    // 触发 input 事件通知框架（React/Vue 等）
    editableEl.dispatchEvent(new InputEvent('input', { 
      bubbles: true, 
      cancelable: true,
      inputType: 'insertText',
      data: diff.corrected
    }));
  }

  private removeRangeFor(entry: { node: Text; localPos: number; diff: Diff; range: Range }) {
    const hl = CSS.highlights.get('ps-proof') as Highlight | undefined;
    if (hl) {
      hl.delete(entry.range);
      this.appliedRanges.delete(entry.range);
    }
    // 从 diffNodes 移除
    for (const [el, list] of this.diffNodes) {
      const next = list.filter((i) => !(i.node === entry.node && i.localPos === entry.localPos));
      if (next.length) this.diffNodes.set(el, next);
      else this.diffNodes.delete(el);
    }
    this.popover?.hide();
  }

  /** popup 采用后移除对应高亮（不修文本，popup 只是镜像状态） */
  removeByDiff(diff: Diff) {
    const hl = CSS.highlights.get('ps-proof') as Highlight | undefined;
    if (hl) {
      for (const r of [...hl]) {
        const range = r as Range;
        if (range.startContainer.nodeValue?.slice(range.startOffset, range.startOffset + diff.original.length) === diff.original) {
          hl.delete(range);
          this.appliedRanges.delete(range);
        }
      }
    }
  }

  /** Side Panel 跳转：滚动到对应高亮并短暂闪烁 */
  jumpTo(diff: Diff) {
    const hl = CSS.highlights.get('ps-proof') as Highlight | undefined;
    if (!hl) return;
    for (const r of [...hl]) {
      const range = r as Range;
      if (range.startContainer.nodeValue?.slice(range.startOffset, range.startOffset + diff.original.length) === diff.original) {
        const rects = range.getClientRects();
        if (rects.length) {
          const rect = rects[0];
          // 滚动到视口中心
          window.scrollTo({
            left: rect.left + window.scrollX - window.innerWidth / 2 + rect.width / 2,
            top: rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2,
            behavior: 'smooth',
          });
          // 闪烁高亮（临时改色）
          const style = document.getElementById(STYLE_ID);
          if (style) {
            const orig = style.textContent;
            style.textContent = orig?.replace('#ef4444', '#f59e0b') || '';
            setTimeout(() => { style.textContent = orig || ''; }, 1500);
          }
        }
        break;
      }
    }
  }

  clearAll() {
    CSS.highlights.delete('ps-proof');
    this.appliedRanges.clear();
    this.diffNodes.clear();
    this.popover?.hide();
  }

  destroy() {
    this.clearAll();
    if (this.clickHandler) document.removeEventListener('click', this.clickHandler, true);
    document.getElementById(STYLE_ID)?.remove();
  }

  private ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `::highlight(ps-proof) {
      background-color: transparent;
      color: inherit;
      text-decoration: underline ${UNDERLINE} ${COLOR} 2px;
      text-decoration-skip-ink: none;
      text-underline-offset: 2px;
      cursor: pointer;
    }`;
    document.head.appendChild(style);
  }
}

/** 修正气泡：原生 Popover API（自动 Esc 关闭、焦点管理） */
class ProofPopover {
  private el: HTMLDivElement;
  private onApply: (() => void) | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.popover = 'manual';
    this.el.style.cssText = `font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1a2233;background:#fff;border:1px solid #e5e9f0;border-radius:10px;box-shadow:0 8px 32px rgba(15,23,42,.16);padding:12px 14px;min-width:180px;max-width:280px`;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-live', 'assertive');
    document.documentElement.appendChild(this.el);
  }

  show(diff: Diff, anchor: DOMRect, onApply: () => void) {
    this.onApply = onApply;
    this.el.innerHTML = '';
    // 修正建议
    const change = document.createElement('div');
    change.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:16px;margin-bottom:6px';
    const orig = document.createElement('del');
    orig.textContent = diff.original;
    orig.style.cssText = 'color:#ef4444;text-decoration:line-through';
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    arrow.style.color = '#94a3b8';
    const corr = document.createElement('strong');
    corr.textContent = diff.corrected;
    corr.style.cssText = 'color:#047857;font-size:17px';
    change.append(orig, arrow, corr);
    // 元信息
    const meta = document.createElement('div');
    meta.style.cssText = 'color:#64748b;font-size:12px;margin-bottom:10px';
    meta.textContent = `置信度 ${(diff.confidence * 100).toFixed(0)}%`;
    // 操作
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px';
    const accept = this.btn('采用', '#047857', '#fff');
    const ignore = this.btn('忽略', 'transparent', '#475569', '1px solid #cbd5e1');
    accept.addEventListener('click', () => { this.hide(); this.onApply?.(); });
    ignore.addEventListener('click', () => this.hide());
    actions.append(accept, ignore);
    this.el.append(change, meta, actions);

    // 定位：锚点下方，viewport 边缘翻转
    const elRect = this.el.getBoundingClientRect();
    let x = anchor.left + anchor.width / 2 - elRect.width / 2;
    let y = anchor.bottom + 8;
    if (x < 8) x = 8;
    if (x + elRect.width > window.innerWidth - 8) x = window.innerWidth - elRect.width - 8;
    if (y + elRect.height > window.innerHeight - 8) y = anchor.top - elRect.height - 8;
    this.el.style.position = 'fixed';
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.showPopover();
  }

  private btn(text: string, bg: string, fg: string, border = 'none'): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `padding:5px 14px;border-radius:7px;border:${border};background:${bg};color:${fg};font-size:13px;font-weight:600;cursor:pointer`;
    return b;
  }

  hide() {
    this.el.hidePopover();
    this.onApply = null;
  }
}