// MacBERT4CSC ONNX 推理引擎
// 输入/输出与张量形状已按真实 ONNX 模型验证（Q8 量化版，114MB）
import { tokenize as _tokenize, postprocess as _postprocess, type CorrectionResult } from './codec';

export type { DiffEntry, CorrectionResult } from './codec';

const MAX_LEN = 512;

export class MacBertCorrector {
  private modelUrl: string;
  private vocabUrl: string;
  private threshold: number;
  private vocab: string[] = [];
  private invVocab: Map<string, number> = new Map();
  private session: any = null;

  constructor(modelUrl: string, vocabUrl: string, threshold = 0.7) {
    this.modelUrl = modelUrl;
    this.vocabUrl = vocabUrl;
    this.threshold = threshold;
  }

  async init(): Promise<void> {
    if (this.session) return;
    const [ort] = await Promise.all([import('onnxruntime-web'), this.loadVocab()]);
    this.session = await ort.InferenceSession.create(this.modelUrl, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
    });
  }

  private async loadVocab(): Promise<void> {
    const text = await (await fetch(this.vocabUrl)).text();
    this.vocab = text.trim().split('\n');
    this.vocab.forEach((t, i) => this.invVocab.set(t, i));
  }

  tokenize(text: string): number[] {
    return _tokenize(text, this.invVocab);
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
    return _postprocess(text, logits.data as Float32Array, logits.dims[2] as number, this.vocab, this.threshold);
  }
}
