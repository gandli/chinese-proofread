// 校对流程：提取 → 权限 → 分段 → 推理 → 合并 → 词典过滤
// 纯逻辑层，UI 解耦，可单测（mock corrector + chrome API）
import { MacBertCorrector } from "../engines/macbert";
import { splitLongText, mergeDiffs } from "./splitter";
import { loadCustomDict, applyCustomDict } from "./custom-dict";
import type { Diff } from "../types";

export type ProofStatus =
  "idle" | "extracting" | "loading" | "done" | "error" | "permission-denied";

export interface CorrectionStats {
  chars: number;
  timeMs: number;
}

export interface CorrectionResult {
  text: string;
  diffs: Diff[];
  stats: CorrectionStats;
}

let corrector: MacBertCorrector | null = null;
let correctorInit: Promise<MacBertCorrector> | null = null;

export async function getCorrector(): Promise<MacBertCorrector> {
  if (corrector) return corrector;
  if (!correctorInit) {
    const init = (async () => {
      const c = new MacBertCorrector(
        chrome.runtime.getURL("models/model_quantized.onnx"),
        chrome.runtime.getURL("models/vocab.txt"),
      );
      await c.init();
      return c;
    })();
    correctorInit = init;
    try {
      corrector = await init;
    } catch (err) {
      // 初始化失败：重置 Promise，允许下次调用重试（避免永久拒绝）
      correctorInit = null;
      throw err;
    }
  }
  return corrector!;
}

/** 主校对流程：返回正文文本 + 修正 diff + 统计；权限被拒抛 "permission-denied" */
export async function runCorrection(tabId: number): Promise<CorrectionResult> {
  const t0 = performance.now();

  // 运行时申请 optional host_permissions（用户首次点击时弹窗授权）
  const hasPermission = await chrome.permissions.contains({
    origins: ["<all_urls>"],
  });
  if (!hasPermission) {
    const granted = await chrome.permissions.request({
      origins: ["<all_urls>"],
    });
    if (!granted) throw new PermissionDeniedError();
  }

  const extracted = await chrome.tabs.sendMessage(tabId, { type: "extract" });
  const text: string = extracted?.text ?? "";
  if (!text) throw new Error("未能提取到页面正文");

  const corrector = await getCorrector();
  const chunks = splitLongText(text, 510, 20);
  const chunkDiffs = await Promise.all(
    chunks.map(async (chunk) => (await corrector.correct(chunk.text)).diffs),
  );
  let merged = mergeDiffs(chunks, chunkDiffs);

  // 应用自定义词典（行业专业词库）
  await loadCustomDict();
  merged = applyCustomDict(text, merged);

  return {
    text,
    diffs: merged,
    stats: {
      chars: text.length,
      timeMs: Math.round(performance.now() - t0),
    },
  };
}

export class PermissionDeniedError extends Error {
  constructor() {
    super("permission-denied");
    this.name = "PermissionDeniedError";
  }
}

/** 给测试/热重载用：清空引擎单例 */
export function resetCorrector(): void {
  corrector = null;
  correctorInit = null;
}
