/** 自定义词典加载器（Node 环境：文件系统读取，仅用于测试/开发） */
import { readFile } from "node:fs/promises";
import { setDictCache, type CustomDict } from "./custom-dict";

let nodeDictCache: CustomDict | null = null;

/** Node 环境加载词典（基于 import.meta.url 定位 public 目录），复用 core 的 findMatches/applyCustomDict */
export async function loadCustomDictNode(): Promise<CustomDict> {
  if (nodeDictCache) return nodeDictCache;
  try {
    const moduleDir = new URL(".", import.meta.url).pathname;
    const projectRoot = moduleDir.replace(/\/src\/utils\/$/, "");
    const dictPath = projectRoot + "/public/custom-dict.json";
    const content = await readFile(dictPath, "utf-8");
    const parsed = JSON.parse(content) as CustomDict;
    nodeDictCache = parsed;
    setDictCache(parsed);
    // eslint-disable-next-line no-console -- test/dev logging
    console.log("[custom-dict-node] Loaded entries:", parsed.entries.length);
  } catch (e) {
    // eslint-disable-next-line no-console -- test/dev logging
    console.error("[custom-dict-node] Load failed:", e);
    nodeDictCache = { version: 1, entries: [] };
  }
  return nodeDictCache!;
}
