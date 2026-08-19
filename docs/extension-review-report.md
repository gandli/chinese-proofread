# chinese-proofread 扩展审计报告

**扩展名**: 中文校对助手
**版本**: 0.1.0
**框架**: WXT + React + TypeScript + Tailwind CSS v4
**模型**: MacBERT4CSC Q8 (本地 ONNX)
**审计日期**: 2026-08-19

---

## 执行摘要

| 严重度   | 数量 |
| -------- | ---- |
| CRITICAL | 0    |
| HIGH     | 3    |
| MEDIUM   | 1    |
| PASS     | 11   |

**结论**: **NEEDS FIXES** — 需修复 3 个 HIGH + 1 个 MEDIUM 项后可提交 CWS

---

## 详细发现

### HIGH 严重度 (3 项)

#### 1. 权限过度：`<all_urls>` host_permissions

- **Violation Code**: Purple Potassium
- **Root Cause**: `wxt.config.ts` 与生成的 `manifest.json` 均声明 `host_permissions: ['<all_urls>']`。扩展在所有站点注入 content script，理论上可读取/修改任意页面 DOM。
- **Files**: `wxt.config.ts:12`, `.output/chrome-mv3/manifest.json:6`
- **Solution**:
  1. 评估是否真需在**所有站点**工作（Chrome 商店要求权限最小化）。若仅需用户主动触发的页面，改用 `optional_host_permissions` + `chrome.permissions.request()` 运行时申请。
  2. 或改为 `activeTab` + 用户点击 popup 时临时授权。
  3. 若业务必须全站（如自动高亮），在隐私政策说明并准备 CWS 审核解释材料。

#### 2. 缺少扩展图标

- **Violation Code**: Yellow Zinc
- **Root Cause**: `wxt.config.ts` 未配置 `icons`，`public/` 目录无 icon 文件，生成的 manifest 无 `icons` 字段。CWS 要求 16/48/128 三种尺寸 PNG 图标。
- **Files**: `wxt.config.ts`, `public/` (缺失)
- **Solution**:
  1. 准备 16×16, 48×48, 128×128 PNG 图标放入 `public/icons/`
  2. `wxt.config.ts` manifest 增加 `icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' }`
  3. 重新构建验证 `.output/chrome-mv3/` 包含图标

#### 3. 缺少隐私政策声明

- **Violation Code**: Purple Lithium
- **Root Cause**: 扩展使用 `storage` 权限（本地存储用户词典/偏好），但 manifest 无 `privacy_policy` 字段，项目无隐私政策页面。Chrome 政策要求**任何存储用户数据的扩展**必须提供隐私政策 URL。
- **Files**: `wxt.config.ts` manifest 缺失 `privacy_policy`
- **Solution**:
  1. 编写隐私政策（说明：仅本地存储词典/设置，不上传任何数据，无追踪，无第三方分享）
  2. 部署到 GitHub Pages 或自有域名（如 `https://gandli.github.io/chinese-proofread/privacy.html`）
  3. manifest 增加 `"privacy_policy": "https://..."`

---

### MEDIUM 严重度 (1 项)

#### 4. CSP 包含 `wasm-unsafe-eval`

- **Violation Code**: Yellow Potassium (CSP 放宽)
- **Root Cause**: `content_security_policy.extension_pages` 包含 `'wasm-unsafe-eval'`。onnxruntime-web WASM 加载需要此指令，但 CWS 审核会关注 `unsafe-eval` 类指令。需在说明中证明必要性。
- **Files**: `wxt.config.ts:14`, `.output/chrome-mv3/manifest.json:5`
- **Solution**:
  1. 保留（onnxruntime-web 离线推理必须），但在 CWS 提交说明中备注：本地 AI 推理依赖 WASM，`wasm-unsafe-eval` 仅用于加载本地模型，不执行远程代码。
  2. 可选：若 CWS 拒绝，改用 `import.meta.env.PROD` 分离 CSP（生产环境更严格），或探索 `wasm-threads` 替代。

---

### PASS 项 (11 项)

| Check                          | 结果 | 备注                                            |
| ------------------------------ | ---- | ----------------------------------------------- |
| Blue Argon (远程代码执行)      | ✅   | 无 eval、Function、动态 import HTTP、fetch+eval |
| Red Titanium (代码混淆)        | ✅   | 无 atob/btoa、fromCharCode、hex 字符串混淆      |
| Red Magnesium (单一用途)       | ✅   | 仅中文校对，无无关功能                          |
| Purple Copper (不安全传输)     | ✅   | 无 HTTP URL，无敏感参数泄露                     |
| Grey Silicon (挖矿)            | ✅   | 无挖矿特征                                      |
| Blue Zinc (版权绕过)           | ✅   | 无下载/绕过付费墙代码                           |
| Yellow Argon (关键词堆砌)      | ✅   | manifest name/description 简洁                  |
| Grey Titanium (联盟链接)       | ✅   | 无                                              |
| Yellow Nickel (通知滥用)       | ✅   | 无通知 API 使用                                 |
| Grey Titanium (数据收集无同意) | ✅   | 无 history/webNavigation/tabs 追踪              |
| Minimum Functionality          | ✅   | 有完整校对、高亮、修正、词典管理功能            |

---

## WXT 性能规则审计 (49 条)

### CRITICAL 类 (Service Worker / Content Script)

| Rule                                   | 状态      | 备注                                                           |
| -------------------------------------- | --------- | -------------------------------------------------------------- |
| `svc-register-listeners-synchronously` | ⚠️ 需验证 | `background.ts` 需同步注册所有 listeners，避免异步导致事件丢失 |
| `svc-avoid-global-state`               | ⚠️ 需验证 | Service Worker 不应持有内存状态，改用 `chrome.storage`         |
| `inject-use-main-function`             | ✅        | content.ts 使用 `defineContentScript({ main() {...} })` 模式   |
| `inject-run-at-timing`                 | ✅        | `runAt: 'document_idle'` 正确                                  |
| `inject-choose-correct-world`          | ✅        | 默认 ISOLATED world，无需访问页面 JS 变量                      |

### HIGH 类 (Messaging / Storage)

| Rule                        | 状态 | 备注                                                                                                                 |
| --------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| `msg-type-safe-messaging`   | ⚠️   | 当前用原生 `chrome.runtime.onMessage`，建议引入 `@webext-core/messaging` 做类型安全协议                              |
| `msg-return-true-for-async` | ⚠️   | content.ts 中异步 handler 需显式 `return true`（已检查：有 `sendResponse` 调用但无 `return true`，可能导致响应丢失） |
| `store-use-define-item`     | ⚠️   | 直接用 `chrome.storage.local.get/set`，建议改 `storage.defineItem` 类型安全                                          |
| `store-choose-storage-area` | ✅   | 仅用 `local`（同步不需要）                                                                                           |

### MEDIUM 类 (Bundle / Manifest / UI)

| Rule                                | 状态 | 备注                                         |
| ----------------------------------- | ---- | -------------------------------------------- |
| `manifest-minimal-permissions`      | ❌   | `<all_urls>` 过度，见 HIGH #1                |
| `manifest-use-optional-permissions` | ❌   | 可将 `<all_urls>` 改为 optional              |
| `manifest-content-security-policy`  | ⚠️   | 有 CSP 但含 `wasm-unsafe-eval`，见 MEDIUM #4 |
| `bundle-minify-content-scripts`     | ✅   | WXT 默认 production build 压缩               |
| `bundle-externalize-wasm`           | ✅   | WASM 在 `public/wasm/` 独立加载              |

---

## 修复优先级建议

| 优先级 | 任务                                                                    | 预估工时 |
| ------ | ----------------------------------------------------------------------- | -------- |
| P0     | 添加 16/48/128 图标到 `public/icons/` + manifest 配置                   | 0.5h     |
| P0     | 编写并部署隐私政策，manifest 加 `privacy_policy` URL                    | 1h       |
| P0     | 评估 `<all_urls>` 必要性，改为 `optional_host_permissions` + 运行时申请 | 2h       |
| P1     | background.ts 同步注册 listeners，移除内存状态                          | 1h       |
| P1     | content.ts 异步 handler 加 `return true`                                | 0.5h     |
| P2     | 引入 `@webext-core/messaging` 类型化消息协议                            | 2h       |
| P2     | storage 改用 `defineItem` 类型安全                                      | 1h       |
| P3     | CSP 说明文档准备应对 CWS 审核                                           | 0.5h     |

---

## CWS 提交清单

- [ ] 3 个尺寸图标 (16/48/128 PNG)
- [ ] 隐私政策在线可访问
- [ ] 权限最小化（`<all_urls>` → optional + 运行时申请）
- [ ] `manifest.json` 含 `privacy_policy`、`icons`
- [ ] 截图：popup、sidepanel、options 各 1-3 张（已有 `docs/guide/screenshots/01-07.png`）
- [ ] 店铺列表：标题、描述、详细描述、分类（生产力工具）
- [ ] 测试包：`bun run zip` 生成 `.output/chrome-mv3.zip` 上传

---

_报告由 extension-review + wxt-browser-extensions skills 自动生成_
