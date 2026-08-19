// 长文本分段器 — 支持超过 512 tokens 的超长文章
// 分句 + 滑动窗口 + 重叠上下文

export interface SplitChunk {
  text: string;
  offset: number; // 相对于原始文本的起始偏移
}

/** 校验 offset + length 不越界 */
function assertInBounds(text: string, offset: number, length: number): void {
  if (offset < 0 || offset > text.length) {
    throw new RangeError(`offset ${offset} out of bounds [0, ${text.length}]`);
  }
  if (length < 0 || offset + length > text.length) {
    throw new RangeError(`slice [${offset}, ${offset + length}] exceeds text length ${text.length}`);
  }
}

/** 过滤空片段 */
function filterEmptyChunks(chunks: SplitChunk[]): SplitChunk[] {
  return chunks.filter((c) => c.text.length > 0);
}

// 中文分句：基于标点符号
function chineseSplitSentences(text: string): string[] {
  if (text.length === 0) return [];
  // 按中文句号/感叹号/问号+引号/括号分割
  const sentences = text.split(/([。！？][”’)]?)/);
  const merged: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const s = sentences[i] + (sentences[i + 1] || "");
    if (s.trim()) merged.push(s);
  }
  return merged;
}

// 滑动窗口聚合分句到 chunk，保证 chunk 不超过 maxChars
export function splitLongText(
  text: string,
  maxChars = 510,
  overlap = 20,
): SplitChunk[] {
  if (maxChars <= 0) throw new RangeError('maxChars must be > 0');
  if (overlap < 0) throw new RangeError('overlap must be >= 0');
  if (overlap >= maxChars) throw new RangeError('overlap must be < maxChars');
  if (text.length === 0) return [];

  const sentences = chineseSplitSentences(text);
  const chunks: SplitChunk[] = [];

  let currentChunk = "";
  let currentOffset = 0;
  let currentLen = 0;

  for (const sentence of sentences) {
    const sLen = sentence.length;
    if (currentLen + sLen <= maxChars) {
      currentChunk += sentence;
      currentLen += sLen;
      continue;
    }

    if (currentChunk.length > 0) {
      assertInBounds(text, currentOffset, currentChunk.length);
      chunks.push({ text: currentChunk, offset: currentOffset });
      // overlap: 保留最后 overlap 字符到下一个 chunk
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.slice(overlapStart);
      currentOffset += overlapStart;
      currentLen = currentChunk.length;
    }

    if (sLen > maxChars) {
      // 超长单句强行切分
      let pos = 0;
      while (pos < sLen) {
        const end = Math.min(pos + maxChars, sLen);
        const chunkText = sentence.slice(pos, end);
        if (chunkText.length > 0) {
          assertInBounds(text, currentOffset + pos, chunkText.length);
          chunks.push({
            text: chunkText,
            offset: currentOffset + pos,
          });
        }
        // 末段已到文末 (end === sLen) 时不再叠加 overlap，否则 pos 卡死 → 无限循环 OOM
        pos = end === sLen ? sLen : end - Math.min(overlap, end - pos);
      }
      currentChunk = "";
      currentOffset += sLen;
      currentLen = 0;
    } else {
      currentChunk += sentence;
      currentLen += sLen;
    }
  }

  if (currentChunk.length > 0) {
    assertInBounds(text, currentOffset, currentChunk.length);
    chunks.push({ text: currentChunk, offset: currentOffset });
  }

  return filterEmptyChunks(chunks);
}

// 合并多个 chunk 的 diffs 到全局坐标
export function mergeDiffs(
  chunks: SplitChunk[],
  chunkDiffs: Array<
    Array<{
      original: string;
      corrected: string;
      position: number;
      confidence: number;
    }>
  >,
) {
  if (chunks.length !== chunkDiffs.length) {
    throw new RangeError(`chunks (${chunks.length}) and chunkDiffs (${chunkDiffs.length}) length mismatch`);
  }
  const merged: (typeof chunkDiffs)[number] = [];
  for (let i = 0; i < chunks.length; i++) {
    const offset = chunks[i].offset;
    for (const d of chunkDiffs[i]) {
      if (d.position < 0 || d.position > chunks[i].text.length) {
        // 静默丢弃越界 diff，避免污染全局坐标
        continue;
      }
      merged.push({ ...d, position: d.position + offset });
    }
  }
  // 去重重叠区域，保留置信度更高的
  merged.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<number>();
  const dedup: typeof merged = [];
  for (const d of merged) {
    if (!seen.has(d.position)) {
      seen.add(d.position);
      dedup.push(d);
    }
  }
  dedup.sort((a, b) => a.position - b.position);
  return dedup;
}
