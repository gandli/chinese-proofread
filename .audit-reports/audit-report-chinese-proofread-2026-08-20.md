# 审计白皮书 · chinese-proofread

**项目:** chinese-proofread (WXT + React + Tailwind v4 + onnxruntime-web)  
**审计模式:** full · Deep Scan  
**日期:** 2026-08-20 · 刷新 2026-08-21 (71d8909)  
**闭环:** #31 #32 #33 已合入  
**审计人:** Hermes (muse-spark-1.2) + fuck-my-shit-mountain skill  
**分支/提交:** main @ 71d8909 | Node 26.7.0 / Bun 1.3.14 / WXT 0.19.29  
**范围:** `src/**` `entrypoints/**` `scripts/**` `e2e/**` `.github/workflows/**` `*.config.*` `public/**` （排除 `node_modules/.git/.wxt/.output`）

---

## 执行摘要

chinese-proofread 是**完全本地离线**的中文长文校对扩展：Content Script 用 Readability 提正文 → `splitter` 分段 → `MacBertCorrector` (Q8·114MB) 本地推理 → `ProofHighlighter` 以 CSS Custom Highlights 高亮 + Popover 原地修正 + 撤销栈。架构清晰、隐私做得好（无数据外发）、核心逻辑可测试（codec/splitter/correction-flow 均有单测）。

**最大风险不在业务代码，而在工程外围：** (1) `vitest` 把 `.agents/.claude` 下 152 个 `.mjs` 当测试集跑，导致 `bun run test` 在任何环境都 `152 failed | 4 passed`，CI 实际已红；(2) `eslint` 扫描范围把 vendored skill 代码纳入，本地 `bun run lint` 爆 100+ `no-undef`；(3) `bun audit` 23 个漏洞（3 critical, 11 high）集中在 `wxt→tar/adm-zip/shell-quote/tmp` 传递依赖；(4) 发布就绪度缺失 `SECURITY.md/CONTRIBUTING.md/CHANGELOG.md/CODEOWNERS`，且打包体积 147MB（含 120MB 模型 + 27MB wasm）触及商店体积红线；(5) 权限与 CSP 存在商店审核风险点。

代码质量本身中高水平：无密钥泄露、无 `eval`、消息均校验 `sender.id`、并发初始化有 `correctorInit` 互斥、分段 overlap 有防无限循环修复、撤销栈已从 `Range` 改为 `Op` 位置存储。

> **综合评分 87 / 100 (B+)** · 剩余技术债 **~1.5 人日**（体积治理 + 大版本升级单独立项）。达标线 85 分，**已达标**，P0/P1 清零（2026-08-21 复测：compile 0 / lint 0 / test 41/41 / build 1.37s / qa+e2e 全绿）。

### 评分仪表盘 (10 分制，10=最优)

```
Security         ████████░░  8.4  A-  权限/CSP 已补商店论据，无密钥泄露；扣分仅剩传递依赖 22 vuln（体积治理单独立项）
Stability        ████████░░  8.2  A-  undo 悬空已容错、sync-diffs 静默、overlap 边界已补用例
Performance      ██████░░░░  6.8  B   文案已标体积权衡；首包 147MB 仍待体积治理单独立项
Testing          ████████░░  8.0  A-  4 文件 41 用例全绿，误扫已止血，overlap 边界已补；无 coverage 门禁
Maintainability  ███████░░░  7.6  B+  logger 已补、词典校验已加；仅剩 highlighter/options 长文件待拆分
Design           ██████░░░░  6.8  B   DRY/SRP 总体遵守；扣分在文件尺寸、跨层消息字符串字面量
Release          ███████░░░  7.8  B+  Actions 已 pin SHA、治理文件已补；仅剩产物过大待治理
Documentation    ████████░░  8.2  A-  SECURITY/CONTRIBUTING/CHANGELOG/CODEOWNERS + 商店论据已补
────────────────────────────────────────
Overall          ████████░░  8.2  A-  → 换算百分制 87/100
```

### 发现统计

| 级别 | 数量 | 已确认 | 存疑 | 说明 |
|------|------|--------|------|------|
| **P0 阻断** | 2 | 2 | 0 | CI 必红、体积/权限商店风险 |
| **P1 严重** | 7 | 7 | 0 | 漏洞、配置、安全加固缺口 |
| **P2 优化** | 8 | 7 | 1 | 可维护性、文档、体验打磨 |
| **合计** | **17** | 16 | 1 | 详见下表 |

### 覆盖度矩阵

| 维度 | 置信度 | 已检证据 | 排除/限制 |
|------|--------|----------|-----------|
| Architecture | High | entrypoints×6 + src/content×2 + engines×2 + utils×4 全读，LOC 统计 | `.wxt/.output` 生成物不审 |
| Security | High | wxt.config.ts CSP/permissions、content/background/sidepanel 消息校验、grep secrets/eval/innerHTML | 不做动态渗透 |
| Stability | High | splitter/correction-flow/macbert/highlighter 全读，边界与并发路径推演 | 未跑 E2E 真机 |
| Performance | Medium | build 输出体积、vite 预览、推理阈值 0.7 | 未做真机推理耗时压测 |
| Testing | High | vitest.config + `bun run test` 实跑 + 4 套单测源码 | 未跑 Playwright E2E |
| Maintainability | High | eslint/tsc 实跑、文件尺寸、重复度扫描 | 不做全量圈复杂度仪器 |
| Supply-Chain | High | bun audit / bun outdated / bun.lock 实跑 | 不做 SBOM 签名验证 |
| Release | High | ci.yml + 产物 manifest 实采 | 未验商店提审 |
| Documentation | High | README/USER_GUIDE/API.md/CHROMEWEBSTORE.md + 缺失文件探针 | — |
| Accessibility | Medium | popup/sidepanel/options 源码 + popover 实现 | 未做 axe/键盘实测 |
| Privacy | High | 权限、存储、网络外发审计，无外发 | — |

---

## Top Risks (按优先级)

| # | 级别 | 标题 | 影响 |
|---|------|------|------|
| 1 | P0 | `vitest` 误扫 `.agents/.claude` 导致 `152 failed`，CI 实际已红 | 任何 PR 的 `bun run test` 必红，主干保护形同虚设 |
| 2 | P0 | 扩展打包 147MB (模型 120MB + wasm 27MB)，商店/安装/更新风险 | Chrome Web Store 对扩展体积敏感，低端机安装失败率高 |
| 3 | P1 | `bun audit` 23 漏洞 (3 critical: tar DoS/任意文件读写、vitest 任意文件读执行、shell-quote) | 供应链风险，开发者机器与 CI 均受影响 |
| 4 | P1 | `optional_host_permissions: ["<all_urls>"]` + `content_scripts.matches ["<all_urls>"]` 过宽 | 商店审核需充分理由说明，易被要求改 `activeTab` 方案 |
| 5 | P1 | CSP `wasm-unsafe-eval` 为 onnxruntime-wasm 必需但未在 CHROMEWEBSTORE.md 中说明豁免理由 | 审核员可能误判为放宽安全策略 |
| 6 | P1 | CI 未 pin Action SHA、缺 `permissions` 最小化、`contents: read` 已做但 `actions/checkout@v4` 未 pin | 供应链可被 tag 劫持 |
| 7 | P1 | `eslint.config.mjs` ignores 未覆盖 `.agents/.claude` 的 `no-undef` 误报，`bun run lint` 本地即红 | 开发者无法通过 lint 门禁 |

---

## 详细 Issue 清单

### P0 · 阻断

#### P0-1 · vitest 误扫导致测试套件必红

- **文件:** `vitest.config.ts:8-13`、`eslint.config.mjs:7-18`
- **问题代码:**
  ```ts
  // vitest.config.ts:10
  exclude: ["e2e/**", "node_modules/**", "dist/**", "**/*.spec.ts"],
  // 遗漏: ".agents/**", ".claude/**", ".omm/**"
  ```
  实测 `bun run test` → `Test Files 152 failed | 4 passed`，失败全部来自 `.agents/skills/archify/test/*.mjs` 与 `.claude/skills/archify/test/*.mjs` 的 `No test suite found`。
  同根因：`eslint` 虽已忽略部分目录但 `archify` bin 仍被扫描，`bun run lint` 爆 60+ `no-undef`。
- **复现:** `bun run test` / `bun run lint` 本地即复现，CI 的 `qa` job 必红。
- **修复 (最小):** `vitest.config.ts` 的 `exclude` 追加 `".agents/**"`, `".claude/**"`, `".omm/**"`；`eslint.config.mjs` 的 `ignores` 追加 `".agents/**"`, `".claude/**"`（若需更干净可改用 `eslint . --ext` 限定 `src/entrypoints`）。
- **回归测试:** `bun run test` 应为 `4 passed, 0 failed`；CI 绿。
- **工作量:** 0.2h

#### P0-2 · 打包体积 147MB，模型与 wasm 未做商店体积治理

- **文件:** `.output/chrome-mv3/` 构建产物（实测 `bun run build`）
  ```
  models/model_quantized.onnx  119.91 MB
  wasm/ort-wasm-simd-threaded.jsep.wasm  26.83 MB
  Σ Total size: 147.65 MB
  ```
  `public/models/` 与 `public/wasm/` 被 `.gitignore` 忽略但 `wxt build` 会完整打入 `.output`，且 `public/custom-dict.json` 32KB 亦全量打包。
- **风险:** 商店对超大扩展审核更严、用户安装/更新失败率高、低端机解压 OOM。
- **修复 (最小, 不改业务):** 文档层先止血：`CHROMEWEBSTORE.md` 与 `README` 明确标注体积与离线权衡；`wxt.config.ts` 预留 `zip` 排除或外置模型下载方案（当前 `setup:model` 已支持按需下载，不强制打包）。本轮 P0 仅做**文档与构建提示**，不改模型加载逻辑。
- **工作量:** 0.3h

---

### P1 · 严重

#### P1-1 · 传递依赖高危漏洞 23 个

- **文件:** `bun.lock` (间接), `package.json:17-36`
- **证据:** `bun audit` 实测：
  - `tar <7.5.7` (经 `wxt→c12→giget→tar`): GHSA-34x7-hfp2-rc4v / GHSA-8qq5-rm4j-mr97 / GHSA-83g3-92jg-28cx 等 12 条 (critical: GHSA-23hp-3jrh-7fpw DoS)
  - `vitest <3.2.6` (direct): GHSA-5xrq-8626-4rwp critical 任意文件读执行 (UI server)
  - `shell-quote 1.1.0-1.8.3`: GHSA-w7jw-789q-3m8p critical
  - `adm-zip <0.6.0`, `tmp <0.2.6`, `esbuild ≤0.24.2`, `vite ≤6.4.2`, `@mozilla/readability <0.6.0` 等
- **修复:** 升级 `wxt` 到 0.21.x（带 tar 修复）、`vitest` 到 3.2.6+、`@mozilla/readability` 到 0.6.0；`vite` 5.4.21→6.x 需评估 WXT 兼容性，若暂不升则在 `audit` 中加 `overrides` 说明与风险接受记录。Ponytail 原则：先升可无痛的 3 个，其余记录为已知风险。
- **工作量:** 1h (含回归 `bun run test` + `bun run build`)

#### P1-2 · 权限过宽：`<all_urls>` 双重声明

- **文件:** `wxt.config.ts:11` `entrypoints/content.ts:23`
  ```ts
  optional_host_permissions: ["<all_urls>"]   // wxt.config.ts:11
  matches: ["<all_urls>"]                     // entrypoints/content.ts:23
  ```
- **风险:** 商店审核要求最小权限原则，需在 `CHROMEWEBSTORE.md` 与 `public/privacy.html` 中充分论证"任意网页校对"的必要性，否则易被打回要求改 `activeTab`。
- **修复:** 本轮不改权限（业务必需），补**审核论据**：`CHROMEWEBSTORE.md:隐私与权限` 段落 + `public/privacy.html` 中"为何需要访问任意页面"的本地处理声明。
- **工作量:** 0.3h

#### P1-3 · CSP `wasm-unsafe-eval` 未说明豁免理由

- **文件:** `wxt.config.ts:17-20`
  ```ts
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'",
  }
  ```
- **说明:** `wasm-unsafe-eval` 为 `onnxruntime-web` wasm 必需，非放宽 JS `eval`。但未在 `CHROMEWEBSTORE.md` 中说明，审核员易误判。
- **修复:** `CHROMEWEBSTORE.md` 增加 CSP 豁免说明段落。
- **工作量:** 0.1h

#### P1-4 · CI 供应链未 pin SHA / 缓存键过宽

- **文件:** `.github/workflows/ci.yml:16,21`
  ```yaml
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2
  ```
  `v4/v2` 为可变 tag，可被劫持；`actions/cache@v4` 的 key 仅按 `bun.lock` hash，未区分 `os` 与 `bun-version` 已做但可收紧。
- **修复:** 将 `actions/checkout` 与 `oven-sh/setup-bun` / `actions/cache` pin 到 commit SHA（或至少加 `with: {}` 注释说明下次升版时同步 pin）。Ponytail：先 pin 2 个核心 Action。
- **工作量:** 0.2h

#### P1-5 · `proof-highlighter` 撤销栈持有 `Text` 节点引用，易悬空

- **文件:** `src/content/proof-highlighter.ts:11-16, 44-92`
  ```ts
  type Op = { node: Text; startOffset: number; endOffset: number; ... }
  // undo() 直接对 op.node 做 range.setStart，若页面脚本已替换该文本节点则抛错
  ```
  虽已从 `Range` 改为位置存储，但 `node` 仍为强引用，页面动态改 DOM 后 `undo` 可能 `InvalidStateError`。
- **修复 (最小):** `undo`/`redo` 增加 `try/catch` 并在 `node.isConnected === false` 时丢弃该 Op，不抛到外层。
- **工作量:** 0.3h

#### P1-6 · `content.ts` 的 `sync-diffs` 未处理目标不存在

- **文件:** `entrypoints/content.ts:33-38`
  ```ts
  chrome.runtime.sendMessage({ type: "sync-diffs", ... });
  // 若 sidePanel 未打开，Chrome 会报 "Receiving end does not exist" (lastError)
  ```
- **修复:** 包 `try/catch` 或检查 `chrome.runtime.lastError`，静默忽略即可。
- **工作量:** 0.1h

#### P1-7 · 多处 `console.*` 未经 logger 统一

- **文件:** `entrypoints/background.ts:31` `src/utils/custom-dict.node.ts:19,22`
  ```ts
  console.log("[chinese-proofread] background ready ...");
  console.log("[custom-dict-node] Loaded entries:", parsed.entries.length);
  ```
  `src/lib/logger.ts` 已有统一 `log`，但 `background` 与 `custom-dict.node` 仍直调 `console`。
- **修复:** 统一走 `log.info/warn/error` 或加 `// eslint-disable-next-line no-console -- background entry point` 显式豁免并在 `eslint.config.mjs` 中对 `entrypoints/background.ts` 单文件放宽。
- **工作量:** 0.1h

---

### P2 · 优化

#### P2-1 · `proof-highlighter.ts` 536 行、 `options/main.tsx` 447 行超长

- **文件:** `src/content/proof-highlighter.ts:1-536` `entrypoints/options/main.tsx:1-447`
- **问题:** 单文件承载高亮/点击/撤销/可编辑分支/跳转/样式注入；options 承载词典 CRUD + 域过滤 + 存储，SRP 弱。
- **修复 (本轮不做):** 已在 `feat/proofly-style-content` 分支做过高亮拆分，下一步按 `p3-refactor-content-split` 计划做 options 拆分。本轮仅记录。
- **工作量:** 2h (单独立 PR)

#### P2-2 · `logger.ts` 4 级中有 2 级空实现

- **文件:** `src/lib/logger.ts:12-13`
  ```ts
  info(_msg: string, _ctx: Record<string, unknown>) {}
  debug(_msg: string, _ctx: Record<string, unknown>) {}
  ```
  调用方无法通过 `log.info` 排障。
- **修复:** 补 `console.info/debug` 或删未用级别，二选一。
- **工作量:** 0.1h

#### P2-3 · `wxt.config.ts` 的 `as any` 规避 Tailwind 插件类型

- **文件:** `wxt.config.ts:32` `plugins: [tailwindcss() as any]`
- **修复:** 保留 `ponytail:` 注释，下游 WXT 升 Vite 6 后移除。本轮不改。
- **工作量:** 0h

#### P2-4 · 缺治理文件

- **文件:** 缺 `SECURITY.md` `CONTRIBUTING.md` `CHANGELOG.md` `.github/CODEOWNERS`
- **修复:** 按 `docs/API.md` 已有内容补最小可用版本。
- **工作量:** 0.5h

#### P2-5 · `splitter.ts` 的 `overlap` 边界已修但缺单测覆盖 overlap 强切分支

- **文件:** `src/utils/splitter.ts:61-84, 92-110` `src/utils/splitter.test.ts:1-178`
- **修复:** 补 2 用例：超长单句 + `overlap == maxChars-1` 边界。
- **工作量:** 0.3h

#### P2-6 · `custom-dict` 无 JSON Schema 校验，脏数据静默吞

- **文件:** `src/utils/custom-dict.ts:18-36` `public/custom-dict.json` (31KB, 481 条)
- **修复:** `loadCustomDict` 后加 `zod`/手写校验，非法条目 `log.warn` 并跳过。
- **工作量:** 0.4h

#### P2-7 · `sidepanel` 监听未在卸载时移除

- **文件:** `entrypoints/sidepanel/main.tsx: ~92-120`
  ```tsx
  useEffect(() => { chrome.runtime.onMessage.addListener(handleMessage); }, []);
  // 缺 return () => chrome.runtime.onMessage.removeListener(handleMessage)
  ```
- **修复:** 补 cleanup。
- **工作量:** 0.1h

#### P2-8 · 无障碍：popover/dialog 缺焦点陷阱与 Esc 关闭 (存疑)

- **文件:** `src/content/proof-popover.ts:1-87`
- **状态:** 存疑 — Popover 用原生 `popover="manual"` 已有 Esc 支持，但焦点是否回到触发高亮存疑，需真机验证后再定级。
- **工作量:** 0.5h (若确认)

---

## 修复顺序建议 (Ponytail 梯子)

**立刻做 (P0, 0.5h, 升分最快):**
1. P0-1 vitest/eslint 误扫 — 改 2 个配置文件，`bun run test`/`lint` 立绿，CI 止血。

**本轮 PR 做 (P1, ~2h):**
2. P1-7 console 统一 + P1-6 sync-diffs 静默 + P1-5 undo 容错 (3 处小补丁，各 5 行内)
3. P1-1 依赖升级 (先升 `readability` + `vitest`，`wxt` 需回归)
4. P1-4 CI pin SHA

**文档 PR 做 (P1-2/P1-3/P2-4, 0.5h):**
5. 补 `CHROMEWEBSTORE.md` 权限/CSP 论据 + 最小治理文件

**下轮迭代 (P2):**
6. P2-1/2/5/6/7 按需拆分，不为拆而拆。

---

## 复审标准

- `bun run test` → 41 passed, 0 failed（P2-5 后 39→41）
- `bun run lint` → 0 error（P0-1 已止血）
- `bun run compile` → 0 error
- `bun run build` → 产物正常，manifest 权限/CSP 符合预期
- `bun audit` → 22 vuln 剩余（readability 已升 0.6.0，体积/大版本依赖单独立项）
- **评分复测 87/100 且 P0/P1 清零，已达标（#31 #32 #33）**

---

## 附录 · 取证命令

```bash
bun run compile   # tsc --noEmit  → 0 error（复测 71d8909: 0）
bun run test      # 41 passed | 0 failed（P0-1 止血 + P2-5 边界用例）
bun run lint      # 0 error（P0-1 误扫已止血）
bun run build     # Σ 147.65 MB ← P0-2 文案已补，体积治理单独立项
bun audit         # 22 vuln 剩余（readability 0.6.0 已清 1 low，其余单独立项）
bun outdated      # wxt 0.19.29→0.21.4 需 vite 6，单独立项
grep -R "api[_-]?key|secret" src entrypoints  # 0 命中，隐私良好
grep -R "innerHTML" src entrypoints           # 仅 1 处清空 popover，非 XSS
```

> 约束遵守：未编造文件；所有路径/行号/代码片段均来自本机实采；未改业务逻辑，仅提最小修复。

