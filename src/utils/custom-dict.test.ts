import { describe, it, expect, beforeAll } from 'vitest';
import { loadCustomDictNode, applyCustomDictNode, findMatchesNode } from './custom-dict.node';

describe('custom-dict', () => {
  let entries: Array<{ term: string; action: 'ignore' | 'correct'; correctTo?: string; domains?: string[] }> = [];

  beforeAll(async () => {
    const dict = await loadCustomDictNode();
    entries = dict.entries;
  });

  it('findMatches: 找到烟草术语', () => {
    const text = '今天烟丝焦油量很好';
    const matches = findMatchesNode(text, entries);
    expect(matches.length).toBeGreaterThan(0);
    const terms = matches.map(m => m.entry.term);
    expect(terms).toContain('烟丝');
    expect(terms).toContain('焦油量');
  });

  it('applyCustomDict: ignore 过滤掉模型 diffs', () => {
    const text = '今天烟丝焦油量很好';
    const diffs = [
      { position: 2, original: '烟丝', corrected: '言丝', confidence: 0.9 },
      { position: 4, original: '焦油量', corrected: '胶油量', confidence: 0.8 },
    ];
    const result = applyCustomDictNode(text, diffs);
    // 两个都是 ignore 词，应被过滤
    expect(result.length).toBe(0);
  });

  it('applyCustomDict: correct 替换 corrected', () => {
    const text = '香菸售卖';
    const diffs = [
      { position: 0, original: '香菸', corrected: '香烟', confidence: 0.7 },
    ];
    const result = applyCustomDictNode(text, diffs);
    expect(result.length).toBe(1);
    expect(result[0].corrected).toBe('香烟'); // 词典里 香菸 correctTo 香烟
  });

  it('applyCustomDict: 无匹配时保留原 diffs', () => {
    const text = '今天天气很好';
    const diffs = [
      { position: 2, original: '天', corrected: '田', confidence: 0.9 },
    ];
    const result = applyCustomDictNode(text, diffs);
    expect(result.length).toBe(1);
    expect(result[0].original).toBe('天');
  });
});