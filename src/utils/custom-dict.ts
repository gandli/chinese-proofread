/**
 * 自定义词典：行业专业词库，用于拦截/修正模型输出
 * - ignore: 忽略该词（不标记为错误）
 * - correct: 强制纠正为 correctTo
 */
export interface CustomDictEntry {
  term: string;
  action: 'ignore' | 'correct';
  correctTo?: string;
  domains?: string[]; // 可选域分组，便于 UI 切换
}

export interface CustomDict {
  version: number;
  entries: CustomDictEntry[];
}

export interface Diff {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}

let dictCache: CustomDict | null = null;
let dictLoaded = false;

/** 加载词典（仅首次加载，随后走缓存） */
export async function loadCustomDict(): Promise<CustomDict> {
  if (dictLoaded && dictCache) return dictCache;
  try {
    // 优先尝试 chrome.runtime（扩展环境）
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      const res = await fetch(chrome.runtime.getURL('custom-dict.json'));
      if (res.ok) {
        dictCache = await res.json();
        dictLoaded = true;
        return dictCache!;
      }
    }
    // 回退：直接读取文件（开发/测试环境）
    // 使用 import.meta.url 定位模块文件，再推导 public 目录
    const { readFile } = await import('node:fs/promises');
    const moduleDir = new URL('.', import.meta.url).pathname;
    // moduleDir: .../src/utils/ -> public 在项目根目录
    const projectRoot = moduleDir.replace(/\/src\/utils\/$/, '');
    const dictPath = projectRoot + '/public/custom-dict.json';
    console.log('[custom-dict] Loading:', dictPath);
    const content = await readFile(dictPath, 'utf-8');
    dictCache = JSON.parse(content);
    console.log('[custom-dict] Loaded entries:', dictCache?.entries?.length || 0);
  } catch (e) {
    console.error('[custom-dict] Load failed:', e);
    dictCache = { version: 1, entries: [] };
  }
  dictLoaded = true;
  return dictCache!;
}

/** 清除缓存（热重载用） */
export function reloadCustomDict(): void {
  dictCache = null;
  dictLoaded = false;
}

/** 最长前缀匹配：返回命中的 entry 及其在文本中的位置 */
function findMatches(text: string, entries: CustomDictEntry[]): Array<{ entry: CustomDictEntry; start: number; end: number }> {
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

/** 应用自定义词典到 diffs
 *  - ignore: 删除该 diff
 *  - correct: 替换 diff.corrected 为 correctTo
 *  - 同时过滤掉与自定义词典术语重叠的模型 diffs（避免重复标记）
 */
export function applyCustomDict(text: string, diffs: Diff[]): Diff[] {
  if (!dictCache) return diffs;
  const matches = findMatches(text, dictCache.entries);
  if (matches.length === 0) return diffs;

  // 将 matches 转为区间集合，便于判断 diff 是否落在忽略/纠正区间内
  const ignoreRanges: Array<[number, number]> = [];
  const correctMap = new Map<string, string>(); // key: "start-end" -> correctTo

  for (const m of matches) {
    if (m.entry.action === 'ignore') {
      ignoreRanges.push([m.start, m.end]);
    } else if (m.entry.action === 'correct' && m.entry.correctTo) {
      correctMap.set(`${m.start}-${m.end}`, m.entry.correctTo);
    }
  }

  // 判断 diff 是否与任一 ignore 区间相交
  function intersectsIgnore(diff: Diff): boolean {
    const dStart = diff.position;
    const dEnd = dStart + diff.original.length;
    return ignoreRanges.some(([s, e]) => !(dEnd <= s || dStart >= e));
  }

  // 先过滤 ignore，再处理 correct
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

/** 测试导出 */
export { findMatches, dictCache };