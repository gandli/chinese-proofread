/** 自定义词典加载器（扩展环境：chrome.runtime.getURL） */
import { log } from "../lib/logger";
import type { DiffEntry as Diff } from "../engines/codec";

export interface CustomDictEntry {
  term: string;
  action: "ignore" | "correct";
  correctTo?: string;
  domains?: string[];
}

export interface CustomDict {
  version: number;
  entries: CustomDictEntry[];
}

let dictCache: CustomDict | null = null;
let dictLoaded = false;

/** 加载词典（扩展环境：chrome.runtime.getURL / fetch） */
export async function loadCustomDict(): Promise<CustomDict> {
  if (dictLoaded && dictCache) return dictCache;
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      const res = await fetch(chrome.runtime.getURL("custom-dict.json"));
      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const validated = validateCustomDict(raw);
        if (validated) {
          dictCache = validated;
          dictLoaded = true;
          return dictCache!;
        }
        log.warn("custom-dict.json 校验失败，已回退空词典", {
          component: "custom-dict",
        });
      }
    }
    // 扩展环境未命中：回退到空词典（Node 环境加载由单独模块处理）
    log.warn("chrome.runtime.getURL unavailable, using empty dict", {
      component: "custom-dict",
    });
    dictCache = { version: 1, entries: [] };
  } catch (e) {
    log.error(
      "Load failed",
      { component: "custom-dict" },
      e instanceof Error ? e : new Error(String(e)),
    );
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

/** 注入词典缓存（Node 测试环境用：真实词典 → 复用同一份 findMatches/applyCustomDict） */
export function setDictCache(dict: CustomDict): void {
  dictCache = dict;
  dictLoaded = true;
}

/** 最长前缀匹配：返回命中的 entry 及其在文本中的位置 */
function findMatches(
  text: string,
  entries: CustomDictEntry[],
): Array<{ entry: CustomDictEntry; start: number; end: number }> {
  const matches: Array<{ entry: CustomDictEntry; start: number; end: number }> =
    [];
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

  const ignoreRanges: Array<[number, number]> = [];
  const correctMap = new Map<string, string>();

  for (const m of matches) {
    if (m.entry.action === "ignore") {
      ignoreRanges.push([m.start, m.end]);
    } else if (m.entry.action === "correct" && m.entry.correctTo) {
      correctMap.set(`${m.start}-${m.end}`, m.entry.correctTo);
    }
  }

  function intersectsIgnore(diff: Diff): boolean {
    const dStart = diff.position;
    const dEnd = dStart + diff.original.length;
    return ignoreRanges.some(([s, e]) => !(dEnd <= s || dStart >= e));
  }

  const filtered = diffs.filter((d) => !intersectsIgnore(d));
  const corrected = filtered.map((d) => {
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

/** 最小校验：非法条目 warn 并跳过，整体结构非法则返回 null */
function validateCustomDict(raw: unknown): CustomDict | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) return null;
  const cleaned: CustomDictEntry[] = [];
  for (const e of obj.entries as unknown[]) {
    if (!e || typeof e !== "object") {
      log.warn("跳过非法词典条目（非对象）", { component: "custom-dict" });
      continue;
    }
    const r = e as Record<string, unknown>;
    if (typeof r.term !== "string" || !r.term) {
      log.warn("跳过非法词典条目（term 非法）", { component: "custom-dict" });
      continue;
    }
    if (r.action !== "ignore" && r.action !== "correct") {
      log.warn("跳过非法词典条目（action 非法）", {
        component: "custom-dict",
      });
      continue;
    }
    if (r.action === "correct" && typeof r.correctTo !== "string") {
      log.warn("跳过非法词典条目（correct 缺 correctTo）", {
        component: "custom-dict",
      });
      continue;
    }
    cleaned.push(e as CustomDictEntry);
  }
  return { version: typeof obj.version === "number" ? obj.version : 1, entries: cleaned };
}
