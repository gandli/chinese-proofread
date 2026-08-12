// Background: 持有模型单例，处理校对请求
import { MacBertCorrector } from '../src/engines/macbert';
import { splitLongText, mergeDiffs } from '../src/utils/splitter';

let corrector: MacBertCorrector | null = null;
let initPromise: Promise<void> | null = null;

async function ensureModel(): Promise<void> {
  if (!corrector) {
    corrector = new MacBertCorrector(
      chrome.runtime.getURL('models/model_quantized.onnx'),
      chrome.runtime.getURL('models/vocab.txt'),
    );
    initPromise = corrector.init();
  }
  await initPromise;
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'proofread') return;
    (async () => {
      try {
        await ensureModel();
        const fullText = msg.text as string;
        const chunks = splitLongText(fullText, 510, 20);
        const chunkDiffs = await Promise.all(chunks.map(async (chunk) => {
          const res = await corrector!.correct(chunk.text);
          return res.diffs;
        }));
        const merged = mergeDiffs(chunks, chunkDiffs);
        // 重新生成完整修正文本
        let corrected = fullText;
        // 倒序替换避免位置偏移
        for (const d of merged.reverse()) {
          corrected = corrected.slice(0, d.position) + d.corrected + corrected.slice(d.position + d.original.length);
        }
        sendResponse({ ok: true, result: { original: fullText, corrected, diffs: merged } });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // async response
  });
});