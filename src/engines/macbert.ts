// MacBERT4CSC ONNX 推理引擎
// 输入/输出与张量形状已按真实 ONNX 模型验证（Q8 量化版，114MB）

const CLS_ID = 101;
const SEP_ID = 102;
const UNK_ID = 100;
const MAX_LEN = 512;

export interface DiffEntry {
  original: string;
  corrected: string;
  position: number;
  confidence: number;
}

export interface CorrectionResult {
  original: string;
  corrected: string;
  diffs: DiffEntry[];
}

export class MacBertCorrector {
  private modelUrl: string;
  private vocabUrl: string;
  private threshold: number;
  private vocab: string[] = [];
  private invVocab: Map<string, number> = new Map();
  private session: any = null;

  /**
   * @param modelUrl model.onnx 的可访问 URL（扩展内用 chrome.runtime.getURL）
   * @param vocabUrl vocab.txt 的可访问 URL
   * @param threshold 置信度阈值（默认 0.7，与 pycorrector 一致）
   */
  constructor(modelUrl: string, vocabUrl: string, threshold = 0.7) {
    this.modelUrl = modelUrl;
    this.vocabUrl = vocabUrl;
    this.threshold = threshold;
  }

  async init(): Promise<void> {
    if (this.session) return;
    const [ort] = await Promise.all([import('onnxruntime-web'), this.loadVocab()]);
    this.session = await ort.InferenceSession.create(this.modelUrl, {
      executionProviders: ['webgpu', 'wasm'], // WebGPU 优先，WASM 保底
      graphOptimizationLevel: 'all',
    });
  }

  private async loadVocab(): Promise<void> {
    const text = await (await fetch(this.vocabUrl)).text();
    this.vocab = text.trim().split('\n');
    this.vocab.forEach((t, i) => this.invVocab.set(t, i));
  }

  tokenize(text: string): number[] {
    const ids = [CLS_ID];
    for (const ch of text) ids.push(this.invVocab.get(ch) ?? UNK_ID);
    ids.push(SEP_ID);
    return ids;
  }

  async correct(text: string): Promise<CorrectionResult> {
    if (!this.session) throw new Error('Call init() first');
    if (text.length > MAX_LEN - 2) throw new Error(`Text too long (>${MAX_LEN - 2} chars), split first`);

    const ids = this.tokenize(text);
    const L = ids.length;
    const pad = (arr: number[]) => {
      const out = new BigInt64Array(MAX_LEN);
      for (let i = 0; i < L; i++) out[i] = BigInt(arr[i]);
      return out;
    };

    const ort = await import('onnxruntime-web');
    const feeds = {
      input_ids: new ort.Tensor('int64', pad(ids), [1, MAX_LEN]),
      attention_mask: new ort.Tensor('int64', pad(ids.map(() => 1)), [1, MAX_LEN]),
      token_type_ids: new ort.Tensor('int64', new BigInt64Array(MAX_LEN), [1, MAX_LEN]),
    };

    const results = await this.session.run(feeds);
    const logits = results.logits ?? results[this.session.outputNames[0]];
    return this.postprocess(text, logits.data as Float32Array, logits.dims[2] as number);
  }

  private postprocess(text: string, data: Float32Array, vocabSize: number): CorrectionResult {
    const chars = Array.from(text);
    const diffs: DiffEntry[] = [];
    let corrected = '';
    const posLogits = new Float32Array(vocabSize);

    for (let i = 0; i < chars.length; i++) {
      const offset = (i + 1) * vocabSize; // +1 跳过 [CLS]
      let max = -Infinity, maxIdx = 0;
      for (let v = 0; v < vocabSize; v++) {
        const val = data[offset + v];
        posLogits[v] = val;
        if (val > max) { max = val; maxIdx = v; }
      }
      // softmax prob of argmax
      let sumExp = 0;
      for (let v = 0; v < vocabSize; v++) sumExp += Math.exp(posLogits[v] - max);
      const prob = 1 / sumExp; // exp(max - max) / sum

      const origChar = chars[i];
      let predChar = (this.vocab[maxIdx] ?? origChar).replace(/^##/, '');
      if (predChar.startsWith('[')) predChar = origChar; // 特殊 token 不改

      if (prob >= this.threshold && predChar !== origChar) {
        corrected += predChar;
        diffs.push({ original: origChar, corrected: predChar, position: i, confidence: prob });
      } else {
        corrected += origChar;
      }
    }
    return { original: text, corrected, diffs };
  }
}