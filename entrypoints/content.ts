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

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'extract') {
        const doc = document.cloneNode(true) as Document;
        const article = new Readability(doc).parse();
        sendResponse({ text: article?.textContent ?? document.body.innerText });
        return;
      }
      if (msg?.type === 'highlight') {
        highlighter.apply(msg.fullText ?? '', msg.diffs);
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

  constructor() {
    this.ensureStyle();
    this.popover = new ProofPopover();
    this.clickHandler = (e: MouseEvent) => this.handleClick(e);
    document.addEventListener('click', this.clickHandler, true);
    // 调试用：暴露实例到 window（方便手动测试）
    (window as any).__proofHighlighter = this;
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
    const range = this.findRangeAtPoint(e.clientX, e.clientY);
    if (!range) { this.popover?.hide(); return; }
    // 找对应 diff
    const entry = this.findDiffForRange(range);
    if (!entry) { this.popover?.hide(); return; }
    const rect = range.getBoundingClientRect();
    this.popover?.show(entry.diff, rect, () => this.applyCorrection(entry));
  }

  /** 用坐标包含判断：点击点是否落在某高亮的矩形内 */
  private findRangeAtPoint(x: number, y: number): Range | null {
    for (const r of this.appliedRanges) {
      const rects = r.getClientRects();
      for (const rect of rects) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return r;
        }
      }
    }
    return null;
  }

  private findDiffForRange(range: Range): { node: Text; localPos: number; diff: Diff } | null {
    for (const list of this.diffNodes.values()) {
      for (const item of list) {
        if (item.node === range.startContainer && item.localPos === range.startOffset) return item;
      }
    }
    return null;
  }

  /** 原地修正 + 撤销 + 清除该处高亮 */
  applyCorrection(entry: { node: Text; localPos: number; diff: Diff }) {
    const { node, localPos, diff } = entry;
    const old = node.data.slice(localPos, localPos + diff.original.length);
    node.data = node.data.slice(0, localPos) + diff.corrected + node.data.slice(localPos + diff.original.length);
    // 记录撤销
    node.parentElement?.setAttribute('data-ps-orig', old);
    // 移除该处高亮
    this.removeRangeFor(entry);
  }

  private removeRangeFor(entry: { node: Text; localPos: number; diff: Diff }) {
    const hl = CSS.highlights.get('ps-proof') as Highlight | undefined;
    if (hl) {
      for (const r of [...hl]) {
        const range = r as Range;
        if (range.startContainer === entry.node && range.startOffset === entry.localPos) {
          hl.delete(range);
          this.appliedRanges.delete(range);
        }
      }
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

/** 修正气泡：Shadow DOM 隔离 + Popover API + flip 动画 */
class ProofPopover {
  private el: HTMLDivElement;
  private onApply: (() => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private outsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = `position:fixed;z-index:2147483647;display:none;font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1a2233;background:#fff;border:1px solid #e5e9f0;border-radius:10px;box-shadow:0 8px 32px rgba(15,23,42,.16);padding:12px 14px;min-width:180px;max-width:280px`;
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
    this.el.style.display = 'block';
    const elRect = this.el.getBoundingClientRect();
    let x = anchor.left + anchor.width / 2 - elRect.width / 2;
    let y = anchor.bottom + 8;
    if (x < 8) x = 8;
    if (x + elRect.width > window.innerWidth - 8) x = window.innerWidth - elRect.width - 8;
    if (y + elRect.height > window.innerHeight - 8) y = anchor.top - elRect.height - 8;
    // 固定定位：fixed + 视口坐标直接用
    this.el.style.left = `${Math.max(8, x)}px`;
    this.el.style.top = `${Math.max(8, y)}px`;

    // 外部点击关闭 + Esc
    this.outsideHandler = (e: MouseEvent) => {
      if (!this.el.contains(e.target as Node)) this.hide();
    };
    setTimeout(() => document.addEventListener('click', this.outsideHandler!, true), 50);
    this.keydownHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide(); };
    document.addEventListener('keydown', this.keydownHandler, true);
  }

  private btn(text: string, bg: string, fg: string, border = 'none'): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `padding:5px 14px;border-radius:7px;border:${border};background:${bg};color:${fg};font-size:13px;font-weight:600;cursor:pointer`;
    return b;
  }

  hide() {
    this.el.style.display = 'none';
    if (this.outsideHandler) document.removeEventListener('click', this.outsideHandler, true);
    if (this.keydownHandler) document.removeEventListener('keydown', this.keydownHandler, true);
    this.outsideHandler = null;
    this.keydownHandler = null;
  }
}