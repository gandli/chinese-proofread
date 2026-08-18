/** 自定义词典加载器（Node 环境：文件系统读取，仅用于测试/开发） */
/* eslint-disable @typescript-eslint/no-var-requires */
import { readFile } from 'node:fs/promises';
import { CustomDict, CustomDictEntry, Diff } from './custom-dict';

let nodeDictCache: CustomDict | null = null;

/** Node 环境加载词典（基于 import.meta.url 定位 public 目录） */
export async function loadCustomDictNode(): Promise<CustomDict> {
  if (nodeDictCache) return nodeDictCache;
  try {
    const moduleDir = new URL('.', import.meta.url).pathname;
    const projectRoot = moduleDir.replace(/\/src\/utils\/$/, '');
    const dictPath = projectRoot + '/public/custom-dict.json';
    const content = await readFile(dictPath, 'utf-8');
    nodeDictCache = JSON.parse(content);
    console.log('[custom-dict-node] Loaded entries:', nodeDictCache?.entries?.length || 0);
  } catch (e) {
    console.error('[custom-dict-node] Load failed:', e);
    nodeDictCache = { version: 1, entries: [] };
  }
  return nodeDictCache!;
}

/** 应用自定义词典到 diffs (Node 版本，复用 core 逻辑) */
export function applyCustomDictNode(text: string, diffs: Diff[]): Diff[] {
  if (!nodeDictCache) return diffs;
  const matches = findMatchesNode(text, nodeDictCache.entries);
  if (matches.length === 0) return diffs;

  const ignoreRanges: Array<[number, number]> = [];
  const correctMap = new Map<string, string>();

  for (const m of matches) {
    if (m.entry.action === 'ignore') {
      ignoreRanges.push([m.start, m.end]);
    } else if (m.entry.action === 'correct' && m.entry.correctTo) {
      correctMap.set(`${m.start}-${m.end}`, m.entry.correctTo);
    }
  }

  function intersectsIgnore(diff: Diff): boolean {
    const dStart = diff.position;
    const dEnd = dStart + diff.original.length;
    return ignoreRanges.some(([s, e]) => !(dEnd <= s || dStart >= e));
  }

  const filtered = diffs.filter(d => !intersectsIgnore(d));
  const corrected = filtered.map(d => {
    const key = `${d.position}-${d.position + d.original.length}`;
    if (correctMap.has(key)) {
      return { ...d, corrected: correctMap.get(key)! };
    }
    return d;
  });
  return corrected;
}

/** 最长前缀匹配 (Node 版本) */
export function findMatchesNode(text: string, entries: CustomDictEntry[]): Array<{ entry: CustomDictEntry; start: number; end: number }> {
  const matches: Array<{ entry: CustomDictEntry; start: number; end: number }> = [];
  let i = 0;
  while (i < text.length) {
    let best: { entry: CustomDictEntry; len: number } | null = null;
    for (const entry of entries) {
      const term = entry.term;
      if (text.startsWith(term, i)) {
        if (!best || term.length > best.len) {
          best = { entry, len: term.length };
        }
      }
    }
    if (best) {
      matches.push({ entry: best.entry, start: i, end: i + best.len });
      i += best.len;
    } else {
      i++;
    }
  }
  return matches;
}