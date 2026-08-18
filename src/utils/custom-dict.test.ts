import { describe, it, expect, beforeAll } from 'vitest';
import { loadCustomDict, applyCustomDict, findMatches, dictCache } from './custom-dict';

describe('custom-dict', () => {
  beforeAll(async () => {
    await loadCustomDict();
  });

  it('findMatches: 找到烟草术语', () => {
    const text = '今天烟丝焦油量很好';
    const entries = dictCache?.entries || [];
    const matches = findMatches(text, entries);
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
    const result = applyCustomDict(text, diffs);
    // 两个都是 ignore 词，应被过滤
    expect(result.length).toBe(0);
  });

  it('applyCustomDict: correct 替换 corrected', () => {
    const text = '烟碱含量';
    const diffs = [
      { position: 0, original: '烟碱', corrected: '尼古丁', confidence: 0.7 },
    ];
    const result = applyCustomDict(text, diffs);
    expect(result.length).toBe(1);
    expect(result[0].corrected).toBe('尼古丁'); // 词典里 correctTo 也是尼古丁
  });

  it('applyCustomDict: 无匹配时保留原 diffs', () => {
    const text = '今天天气很好';
    const diffs = [
      { position: 2, original: '天', corrected: '田', confidence: 0.9 },
    ];
    const result = applyCustomDict(text, diffs);
    expect(result.length).toBe(1);
    expect(result[0].original).toBe('天');
  });
});