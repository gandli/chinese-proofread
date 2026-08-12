import { describe, it, expect } from 'vitest';
import { MacBertCorrector } from './macbert';

describe('MacBertCorrector', () => {
  it('tokenize adds CLS/SEP', () => {
    const c = new MacBertCorrector('', '');
    (c as any).vocab = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '今', '天'];
    (c as any).invVocab = new Map([['[PAD]', 0], ['[UNK]', 1], ['[CLS]', 2], ['[SEP]', 3], ['今', 4], ['天', 5]]);
    (c as any); // CLS/SEP 常量在模块内固定为 101/102 —— 与真实 BERT vocab 一致
    const ids = c.tokenize('今天');
    expect(ids[0]).toBe(101);
    expect(ids[ids.length - 1]).toBe(102);
    expect(ids.length).toBe(4);
  });

  it('rejects over-length text', async () => {
    const c = new MacBertCorrector('', '');
    (c as any).session = {}; // fake init
    await expect(c.correct('一'.repeat(600))).rejects.toThrow('too long');
  });
});