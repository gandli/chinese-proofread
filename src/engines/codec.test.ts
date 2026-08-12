import { describe, it, expect } from 'vitest';
import { tokenize, postprocess } from './codec';

// Build a tiny vocab for testing
function makeVocab(words: string[]): Map<string, number> {
  const inv = new Map<string, number>();
  words.forEach((w, i) => inv.set(w, i));
  return inv;
}

describe('tokenize', () => {
  const CLS = 101, SEP = 102, UNK = 100;

  it('wraps with CLS/SEP', () => {
    const inv = makeVocab(['[CLS]', '[SEP]', '今', '天']);
    const ids = tokenize('今天', inv);
    expect(ids).toEqual([CLS, 2, 3, SEP]); // 今=2, 天=3
  });

  it('unknown chars → UNK', () => {
    const inv = makeVocab(['[CLS]', '[SEP]', 'A']);
    const ids = tokenize('B', inv);
    expect(ids).toEqual([CLS, UNK, SEP]);
  });

  it('empty string → CLS + SEP', () => {
    const inv = makeVocab(['[CLS]', '[SEP]']);
    const ids = tokenize('', inv);
    expect(ids).toEqual([CLS, SEP]);
  });

  it('single char', () => {
    const inv = makeVocab(['[CLS]', '[SEP]', '好']);
    const ids = tokenize('好', inv);
    expect(ids).toEqual([CLS, 2, SEP]);
  });

  it('mixed known/unknown', () => {
    const inv = makeVocab(['[CLS]', '[SEP]', '你', '好']);
    const ids = tokenize('你X好', inv);
    expect(ids).toEqual([CLS, 2, UNK, 3, SEP]);
  });
});

describe('postprocess', () => {
  const vocab = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '新', '心', '今', '天', '好', '也', '很', '高', '兴'];
  const V = vocab.length;

  function makeLogits(original: string, corrections: Map<number, number>): Float32Array {
    // Build logits: each position gets base 1.0, corrections override
    const chars = Array.from(original);
    const data = new Float32Array((chars.length + 1) * V); // +1 for CLS
    // CLS position (0): all 1.0
    for (let v = 0; v < V; v++) data[v] = 1.0;
    for (let i = 0; i < chars.length; i++) {
      const offset = (i + 1) * V;
      // Default: high logits for the original char
      for (let v = 0; v < V; v++) data[offset + v] = 1.0;
      // If this position has a correction, boost the target token
      if (corrections.has(i)) {
        data[offset + corrections.get(i)!] = 100.0; // Very high → softmax ≈ 1.0
      }
    }
    return data;
  }

  it('corrects typos with high confidence', () => {
    // 今→新(position 0, vocab[4]='新'), 天→心(position 1, vocab[5]='心')
    const logits = makeLogits('今天', new Map([
      [0, 4], // 今→新
      [1, 5], // 天→心
    ]));
    const result = postprocess('今天', logits, V, vocab, 0.7);
    expect(result.corrected).toBe('新心');
    expect(result.diffs).toHaveLength(2);
    expect(result.diffs[0].original).toBe('今');
    expect(result.diffs[0].corrected).toBe('新');
    expect(result.diffs[0].confidence).toBeGreaterThan(0.99);
  });

  it('preserves correct text when no strong signal', () => {
    // No correction → all logits = 1.0 → softmax ≈ 1/vocabSize → low confidence
    const logits = makeLogits('今天', new Map());
    const result = postprocess('今天', logits, V, vocab, 0.7);
    expect(result.corrected).toBe('今天');
    expect(result.diffs).toHaveLength(0);
  });

  it('respects threshold', () => {
    // Boost correction to moderate confidence (not 100.0)
    const data = new Float32Array(3 * V); // CLS + 2 chars
    for (let v = 0; v < V; v++) data[v] = 1.0; // CLS
    for (let v = 0; v < V; v++) data[V + v] = 1.0; // char 1 default
    data[V + 4] = 100.0; // char 1 → 新 (strong)
    for (let v = 0; v < V; v++) data[2 * V + v] = 1.0; // char 2 default
    data[2 * V + 5] = 2.0; // char 2 → 心 (weak boost)
    const result = postprocess('今天', data, V, vocab, 0.7);
    // char 1: softmax(100) >> softmax(1) → high confidence → correction applied
    // char 2: softmax(2) vs softmax(1) → moderate → might not pass threshold
    expect(result.diffs.length).toBeGreaterThanOrEqual(1);
    expect(result.diffs[0].corrected).toBe('新');
  });

  it('skips special tokens in prediction', () => {
    // vocab[2]='[CLS]' — if model predicts CLS at a char position, don't replace
    const data = new Float32Array(2 * V); // CLS + 1 char
    for (let v = 0; v < V; v++) data[v] = 1.0; // CLS
    for (let v = 0; v < V; v++) data[V + v] = 1.0; // char default
    data[V + 2] = 100.0; // char predicts [CLS] token (index 2)
    const result = postprocess('今', data, V, vocab, 0.01);
    expect(result.corrected).toBe('今'); // 不改
    expect(result.diffs).toHaveLength(0);
  });

  it('position matches original char index', () => {
    const logits = makeLogits('你好', new Map([[0, 5]])); // 你→心
    const result = postprocess('你好', logits, V, vocab, 0.7);
    expect(result.diffs[0].position).toBe(0);
  });

  it('original field matches source char', () => {
    const logits = makeLogits('好', new Map([[0, 5]])); // 好→心
    const result = postprocess('好', logits, V, vocab, 0.7);
    expect(result.diffs[0].original).toBe('好');
  });
});
