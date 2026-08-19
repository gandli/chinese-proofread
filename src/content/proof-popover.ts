import type { Diff } from "../types";

/** 修正气泡：原生 Popover API（自动 Esc 关闭、焦点管理） */
export class ProofPopover {
  private el: HTMLDivElement;
  private onApply: (() => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.popover = "manual";
    this.el.style.cssText = `font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1a2233;background:#fff;border:1px solid #e5e9f0;border-radius:10px;box-shadow:0 8px 32px rgba(15,23,42,.16);padding:12px 14px;min-width:180px;max-width:280px`;
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-live", "assertive");
    document.documentElement.appendChild(this.el);
  }

  show(diff: Diff, anchor: DOMRect, onApply: () => void) {
    this.onApply = onApply;
    this.el.innerHTML = "";
    // 修正建议
    const change = document.createElement("div");
    change.style.cssText =
      "display:flex;align-items:center;gap:8px;font-size:16px;margin-bottom:6px";
    const orig = document.createElement("del");
    orig.textContent = diff.original;
    orig.style.cssText = "color:#ef4444;text-decoration:line-through";
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    arrow.style.color = "#94a3b8";
    const corr = document.createElement("strong");
    corr.textContent = diff.corrected;
    corr.style.cssText = "color:#047857;font-size:17px";
    change.append(orig, arrow, corr);
    // 元信息
    const meta = document.createElement("div");
    meta.style.cssText = "color:#64748b;font-size:12px;margin-bottom:10px";
    meta.textContent = `置信度 ${(diff.confidence * 100).toFixed(0)}%`;
    // 操作
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px";
    const accept = this.btn("采用", "#047857", "#fff");
    const ignore = this.btn(
      "忽略",
      "transparent",
      "#475569",
      "1px solid #cbd5e1",
    );
    accept.addEventListener("click", () => {
      this.hide();
      this.onApply?.();
    });
    ignore.addEventListener("click", () => this.hide());
    actions.append(accept, ignore);
    this.el.append(change, meta, actions);

    // 定位：锚点下方，viewport 边缘翻转
    const elRect = this.el.getBoundingClientRect();
    let x = anchor.left + anchor.width / 2 - elRect.width / 2;
    let y = anchor.bottom + 8;
    if (x < 8) x = 8;
    if (x + elRect.width > window.innerWidth - 8)
      x = window.innerWidth - elRect.width - 8;
    if (y + elRect.height > window.innerHeight - 8)
      y = anchor.top - elRect.height - 8;
    this.el.style.position = "fixed";
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.showPopover();
  }

  private btn(
    text: string,
    bg: string,
    fg: string,
    border = "none",
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `padding:5px 14px;border-radius:7px;border:${border};background:${bg};color:${fg};font-size:13px;font-weight:600;cursor:pointer`;
    return b;
  }

  hide() {
    this.el.hidePopover();
    this.onApply = null;
  }
}
