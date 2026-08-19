import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runCorrection,
  PermissionDeniedError,
  resetCorrector,
} from "./correction-flow";

// Mock chrome API
const sendMessage = vi.fn();
const contains = vi.fn();
const request = vi.fn();
const getURL = vi.fn();

vi.stubGlobal("chrome", {
  runtime: { getURL },
  permissions: { contains, request },
  tabs: { sendMessage },
});

// Mock corrector + dict（不加载真模型）
vi.mock("../engines/macbert", () => ({
  MacBertCorrector: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    correct: vi.fn().mockResolvedValue({
      diffs: [
        { position: 1, original: "新", corrected: "心", confidence: 0.99 },
      ],
    }),
  })),
}));

vi.mock("./custom-dict", () => ({
  loadCustomDict: vi.fn().mockResolvedValue({ version: 1, entries: [] }),
  applyCustomDict: (_text: string, diffs: unknown[]) => diffs,
}));

describe("runCorrection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCorrector();
    contains.mockResolvedValue(true);
    getURL.mockReturnValue("chrome-extension://x/models/model_quantized.onnx");
  });

  it("权限已授权：完整流程返回 diffs + stats", async () => {
    sendMessage.mockResolvedValue({ text: "今天新情很好。" });
    const result = await runCorrection(1);
    expect(result.text).toBe("今天新情很好。");
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].corrected).toBe("心");
    expect(result.stats.chars).toBe(7);
    expect(result.stats.timeMs).toBeGreaterThanOrEqual(0);
    // extract 调用了一次
    expect(sendMessage).toHaveBeenCalledWith(1, { type: "extract" });
  });

  it("权限被拒：抛 PermissionDeniedError", async () => {
    contains.mockResolvedValue(false);
    request.mockResolvedValue(false);
    await expect(runCorrection(1)).rejects.toThrow(PermissionDeniedError);
  });

  it("未提取到正文：抛 Error", async () => {
    sendMessage.mockResolvedValue({ text: "" });
    await expect(runCorrection(1)).rejects.toThrow("未能提取到页面正文");
  });
});
