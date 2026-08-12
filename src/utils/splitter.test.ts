import { describe, it, expect } from 'vitest';
import { splitLongText, mergeDiffs } from './splitter';

describe('splitLongText', () => {
  it('短文本不分段', () => {
    const text = '今天心情很好。';
    const chunks = splitLongText(text, 510);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].offset).toBe(0);
  });

  it('空字符串返回空数组', () => {
    expect(splitLongText('', 510)).toHaveLength(0);
  });

  it('超长文本按句分段', () => {
    const text = '今天心情很好。明天也要加油。后天继续努力。'.repeat(20);
    const chunks = splitLongText(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // 全文覆盖
    const total = chunks.map(c => c.text).join('');
    expect(total.length).toBeGreaterThanOrEqual(text.length - 20 * chunks.length);
  });

  it('offset 正确递增', () => {
    const text = '今天心情很好。明天也要加油。后天继续努力。'.repeat(10);
    const chunks = splitLongText(text, 100, 10);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].offset).toBeGreaterThan(chunks[i - 1].offset);
    }
  });

  it('所有 chunk 的 offset + text 不超出原文长度', () => {
    const text = '今天心情很好。明天也要加油。后天继续努力。'.repeat(15);
    const chunks = splitLongText(text, 150, 15);
    for (const c of chunks) {
      expect(c.offset + c.text.length).toBeLessThanOrEqual(text.length + 1);
    }
  });

  it('单个超长句被强行切分', () => {
    const text = '啊'.repeat(600); // 无标点，不能分句
    const chunks = splitLongText(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('mergeDiffs', () => {
  it('合并单 chunk', () => {
    const chunks = [{ text: '今天新情很好。', offset: 0 }];
    const chunkDiffs = [[{ original: '新', corrected: '心', position: 1, confidence: 0.99 }]];
    const merged = mergeDiffs(chunks, chunkDiffs);
    expect(merged).toHaveLength(1);
    expect(merged[0].position).toBe(1);
    expect(merged[0].corrected).toBe('心');
  });

  it('合并多 chunk 并按置信度去重', () => {
    const chunks = [
      { text: '今天新情很好。', offset: 0 },
      { text: '我也很高心。', offset: 7 },
    ];
    const chunkDiffs = [
      [{ original: '新', corrected: '心', position: 1, confidence: 0.99 }],
      [{ original: '心', corrected: '兴', position: 6, confidence: 1.0 }],
    ];
    const merged = mergeDiffs(chunks, chunkDiffs);
    expect(merged).toHaveLength(2);
    expect(merged[0].position).toBe(1);
    expect(merged[1].position).toBe(13);
  });

  it('重叠区域只保留置信度更高的', () => {
    const chunks = [
      { text: 'AB', offset: 0 },
      { text: 'BC', offset: 1 },
    ];
    const chunkDiffs = [
      [{ original: 'A', corrected: 'X', position: 0, confidence: 0.8 }],
      [{ original: 'A', corrected: 'Y', position: 0, confidence: 0.95 }],
    ];
    const merged = mergeDiffs(chunks, chunkDiffs);
    expect(merged).toHaveLength(1);
    expect(merged[0].corrected).toBe('Y');
  });

  it('空结果', () => {
    const merged = mergeDiffs([], []);
    expect(merged).toHaveLength(0);
  });

  it('diffs 按 position 正序排列', () => {
    const chunks = [{ text: '测试', offset: 10 }];
    const chunkDiffs = [[
      { original: '测', corrected: 'A', position: 1, confidence: 0.9 },
      { original: '试', corrected: 'B', position: 0, confidence: 0.9 },
    ]];
    const merged = mergeDiffs(chunks, chunkDiffs);
    expect(merged[0].position).toBeLessThan(merged[1].position);
  });
});
