# API 参考

> 入口：`entrypoints/{content,popup,sidepanel,background}.ts` — 中心导出在 `src/{engines,utils,content}/`

## Types

`src/types.ts` 集中导出；实定义在 `src/engines/codec.ts`。

```ts
type Diff = import("./engines/codec").DiffEntry; // alias
interface DiffEntry {
  position: number;
  original: string;
  corrected: string;
  confidence: number;
}
```

## Engines

### `src/engines/macbert.ts`

- `class MacBertCorrector` — `constructor(modelUrl, vocabUrl)` · `init(): Promise<void>` · `correct(text: string): Promise<{diffs: DiffEntry[]}>`
- 单例由 `src/utils/correction-flow.ts:getCorrector()` 持有；并发调用共享同一 `correctorInit` promise，失败自动重置以便重试（见 `p2-sourcery-concurrency`）。
- 模型：`public/models/model_quantized.onnx` (114MB) + `vocab.txt`，wxt CSP `wasm-unsafe-eval`。

### `src/engines/codec.ts`

- `TOKENIZER` / `encode` / `decode` / `buildTensors` — 已验证真实 ONNX 形状（见 `codec.test.ts`）。

## Utils

### `src/utils/correction-flow.ts` (Phase 2 产出)

- `type ProofStatus = "idle" | "extracting" | "loading" | "done" | "error" | "permission-denied"`
- `getCorrector(): Promise<MacBertCorrector>` — 单例 + 并发竞态修复。
- `runCorrection(tabId: number): Promise<{text, diffs, stats}>` — 提取→权限(optional `<all_urls>`)→分段→推理→合并→词典过滤；权限被拒抛 `PermissionDeniedError`。
- `class PermissionDeniedError` · `resetCorrector()` (test/hot-reload)。

### `src/utils/custom-dict.ts`

- `loadCustomDict(): Promise<CustomDict>` — `chrome.storage.local` 为主，`custom-dict.json` 回退；`dictCache` 缓存。
- `findMatches(text): CustomDictEntry[]` · `applyCustomDict(text, diffs): Diff[]` (ignore/correct) · `reloadCustomDict()` · `setDictCache(d)` (Node 测试钩子)。
- Node 侧：`src/utils/custom-dict.node.ts` 仅做 `fs.readFile` + `setDictCache`，不再重复逻辑。

### `src/utils/splitter.ts`

- `splitLongText(text, maxChars=510, overlap=20)` · `mergeDiffs(chunks, chunkDiffs)` — 含边界/空片段/参数校验（P2-1）。

### `src/utils/extension-messaging.ts`

- `isFromThisExtension(sender): boolean` — 统一消息校验，3 入口复用。

### `src/utils/logger.ts`

- `log.info/warn/error` 带 `traceId/component/level`；`background.ts` 为兼容 SW 直写 `console`（wxt 隔离）。

## Content

### `src/content/proof-highlighter.ts` (Phase 3)

- `export class ProofHighlighter` — 载体：`CSS.highlights("ps-proof")` + `::highlight(ps-proof)` 波浪线；状态 `diffNodes/appliedRanges/undoStack/redoStack/popover/clickHandler`。
- 方法：`apply(fullText, diffs)` · `applyCorrection(entry)` · `applyCorrectionInEditable` · `findRangeContainingCaret` / `isPointInRange` · `removeByDiff/removeRangeFor` · `jumpTo` · `clearAll`/`destroy`；`ensureStyle` 注入 `::highlight`，`COMMAND==="serve"` 守卫 `window.__proofHighlighter` 调试导出。
- 约束：单节点假设（跨节点 `setStart` 抛错跳过）；模糊匹配 `norm(white-space)`。

### `src/content/proof-popover.ts`

- `class ProofPopover` — `popover="manual"`，`show(diff, anchorRect, onApply)` 定位 + 采用/忽略，`hide()`。

## Entrypoints

- `entrypoints/content.ts` (62 行，Phase 3 瘦身)：仅 `Readability` 正文提取 + `chrome.runtime.onMessage` 路由到 `ProofHighlighter`。
- `entrypoints/popup/App.tsx` — 编排 `runCorrection` + `MacBertCorrector` 单例，状态面板。
- `entrypoints/sidepanel/main.tsx` / `entrypoints/background.ts` / `entrypoints/options/main.tsx` — 侧边/后台/配置。

## 测试约定

- `vitest.config.ts` (node) + `vitest.content.config.ts` (jsdom) 分层；`bun run test` 39/39。
- `e2e/extension.spec.ts` 真扩展真模型 5 场景；`bun run test:e2e:light`。
- CI: `bun run lint` (no-explicit-any = error) · `format:check` · `coverage` 本地可选（CI 去 --coverage 避 Bun 不兼容）。

## 依赖盘点

| 依赖                        | 作用        | 备注                                                       |
| --------------------------- | ----------- | ---------------------------------------------------------- |
| `onnxruntime-web@1.20.0`    | WASM 推理   | 模型 114MB，`ort-wasm-simd-threaded.jsep` 27MB             |
| `@mozilla/readability`      | 正文提取    |                                                            |
| `wxt` + `@tailwindcss/vite` | 构建 + 样式 | 硬约束：入口禁用路径别名，CSS token 走 `global.css @theme` |
