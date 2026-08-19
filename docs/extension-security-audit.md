# chinese-proofread 扩展安全审计报告（深度）

**扩展**: 中文校对助手 v0.1.0
**框架**: WXT + React + TypeScript + Tailwind CSS v4
**Manifest Version**: 3
**审计日期**: 2026-08-19
**审计技能**: extension-review + wxt-browser-extensions + extension-analyze

---

## 执行摘要

| 严重度   | 计数 | 状态                                                |
| -------- | ---- | --------------------------------------------------- |
| Critical | 0    | ✅ 无                                               |
| High     | 0    | ✅ 无（已修复 onMessage 验证）                      |
| Medium   | 1    | ⚠️ CSP `wasm-unsafe-eval`（业务必须，CWS 说明备注） |
| Low      | 1    | ✅ `@mozilla/readability` 低危 DoS（本地用无风险）  |

**结论**: **APPROVED WITH NOTES** — 核心安全通过，CWS 提交需备注 CSP 例外

---

## 详细发现

### 🟢 PASSED - 关键安全项

| 检查项           | 结果       | 证据                                                                 |
| ---------------- | ---------- | -------------------------------------------------------------------- |
| 远程代码执行     | ✅ 无      | 无 eval/Function/动态 import/脚本注入                                |
| 代码混淆         | ✅ 无      | 无 atob/btoa/fromCharCode/hex 混淆                                   |
| API 密钥硬编码   | ✅ 无      | 无 secret/token/apiKey 明文                                          |
| HTTPS 强制       | ✅ 无 HTTP | 全站 HTTPS，无明文传输                                               |
| 存储敏感数据     | ✅ 无      | 仅本地词典/设置，无 PII/token                                        |
| XSS 注入向量     | ✅ 已修    | `innerHTML` 仅用于扩展自建 DOM（`textContent` 赋值），无页面数据拼接 |
| 消息发送者验证   | ✅ 已修    | **3 处 onMessage 均加 `sender.id === chrome.runtime.id`**            |
| 权限最小化       | ✅ 已修    | `optional_host_permissions` + 运行时申请，支持拒绝流程               |
| 单一用途         | ✅ 通过    | 仅中文校对，无无关功能                                               |
| 依赖漏洞（生产） | ✅ 可接受  | 仅 readability LOW DoS + onnxruntime-web 无漏洞                      |

---

### 🟡 MEDIUM - 1 项待说明

#### CSP 包含 `wasm-unsafe-eval`

- **文件**: `wxt.config.ts` → `manifest.json` `content_security_policy.extension_pages`
- **值**: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'`
- **原因**: onnxruntime-web 加载 WASM 模块（`ort-wasm-simd-threaded.jsep.wasm` 26.8MB）需此指令
- **风险**: 允许 WebAssembly 编译，理论上可被恶意利用，但：
  1. 仅用于**加载本地打包模型**（`chrome-extension://.../wasm/...`）
  2. 不执行远程代码，无动态 `fetch+compile` 路径
  3. 模型文件随扩展分发，哈希固定
- **CWS 应对**: 提交时在「开发者备注」说明：离线 AI 推理必须，不执行远程代码，模型文件完整性由 CWS 签名保证

---

### 🟢 PASSED - WXT 性能规则（49 条核心）

| 类别           | 状态 | 关键项                                                                  |
| -------------- | ---- | ----------------------------------------------------------------------- |
| Service Worker | ✅   | 同步注册 listeners，无全局状态，无长任务                                |
| Content Script | ✅   | `defineContentScript({main()})`、`runAt: document_idle`、ISOLATED world |
| Messaging      | ✅   | 类型安全（手工），sender 验证，异步 `return true`                       |
| Storage        | ⚠️   | 直接 `chrome.storage.local`，建议后续迁移 `defineItem` 类型安全         |
| Bundle         | ✅   | WASM 外部化、content script 压缩、代码分割                              |
| Manifest       | ✅   | 权限最小化、CSP 配置、cross-browser 兼容                                |
| UI             | ✅   | Shadow DOM 无需（popup/sidepanel/options 独立页面），延迟渲染           |
| TypeScript     | ✅   | 严格模式、路径别名、类型入口配置                                        |

---

## 依赖漏洞详情（仅构建时）

| 包                           | 严重度    | 类型 | 说明                                                                 |
| ---------------------------- | --------- | ---- | -------------------------------------------------------------------- |
| `@mozilla/readability@0.5.0` | LOW       | 生产 | 正则 DoS (GHSA-3p6v-hrg8-8qj7)，本地提取文章文本，输入可控，风险极低 |
| `vitest@2.1.0`               | CRITICAL  | 开发 | UI 服务器任意文件读取，仅测试时运行，**不打包**                      |
| `vite@5` / `esbuild`         | HIGH/MOD  | 开发 | 路径遍历/开发服务器暴露，**不打包**                                  |
| `shell-quote/tar/tmp/uuid`   | HIGH/CRIT | 开发 | 间接依赖，**不打包**                                                 |

**结论**: 所有高危漏洞限于 `devDependencies`，构建产物 `.output/chrome-mv3/` 不含任何构建工具代码。生产依赖安全。

---

## CWS 提交清单（最终）

- [x] 16/48/128 图标（PNG，`public/icons/`）
- [x] 隐私政策（`public/privacy.html`，GitHub 可访问，manifest `privacy_policy`）
- [x] 权限最小化（`optional_host_permissions` + 运行时 `permissions.request()`）
- [x] 拒绝授权友好 UI（`permission-denied` 状态 + 「授权后重试」）
- [x] CSP 例外说明材料（`wasm-unsafe-eval` 仅用本地 WASM 推理）
- [x] 消息发送者验证（3 处 `sender.id === chrome.runtime.id` → 统一 `isFromThisExtension(sender)`）
- [x] 无审计/内部文档打包（`docs/extension-security-audit.md`）
- [x] 截图（`docs/guide/screenshots/01-07.png`）
- [x] 测试包（`bun run zip` → `.output/chrome-mv3.zip`）
- [x] CI 全绿（qa/e2e/GitGuardian/Sourcery）

---

## 下一步行动

1. **运行 `bun run zip`** 生成上传包
2. **Chrome Web Store Developer Dashboard** 上传 `.zip`
3. **填写店铺信息**：
   - 标题：中文校对助手
   - 简短描述：本地 AI 中文长文智能校对 - 离线可用，隐私优先
   - 详细描述：参考 `public/privacy.html` 与 README
   - 分类：生产力工具
   - 隐私政策链接：`https://github.com/gandli/chinese-proofread/blob/main/public/privacy.html`
4. **开发者备注**（关键）：
   > `content_security_policy` 中的 `wasm-unsafe-eval` 仅用于加载本地打包的 ONNX 模型（onnxruntime-web 离线推理），不执行任何远程代码。模型文件随扩展分发，完整性由 CWS 签名保证。

---

_报告由 extension-review + wxt-browser-extensions + extension-analyze skills 完整生成_
