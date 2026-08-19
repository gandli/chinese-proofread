# chinese-proofread 中文校对助手

> 浏览器本地 AI 中文长文智能校对 — 离线可用，隐私保护

[![CI](https://github.com/gandli/chinese-proofread/actions/workflows/ci.yml/badge.svg)](https://github.com/gandli/chinese-proofread/actions/workflows/ci.yml)

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="chinese-proofread 中文校对助手 — 浏览器本地 AI 中文长文智能校对，红色波浪线标出错别字并给出修正建议">
</p>

## ✨ 它是什么

一个完全本地运行的浏览器扩展，对当前网页中的长篇文章做**中文智能校对**——错别字、常见语法、用词不当，在原文中标红并给出修正建议。

**核心卖点**：离线 + 隐私 + 中文。

- 🔒 正文和校对结果**不上传任何服务器**
- 📴 **断网也能工作**
- 📖 支持**长篇文章**（自动分段，超 512 token 也能处理）

## 🏗️ 工作原理

```
浏览器网页
      │
      ▼
 Content Script (提取正文)
      │
      ▼
  Mozilla Readability 正文提取
      │
      ▼
  分句 + 滑动窗口分段
      │
      ▼
  WebGPU (优先) ↔ WASM (fallback)
      │
      ▼
  本地 ONNX 模型 (MacBERT4CSC Q8 量化)
      │
      ▼
  结果高亮 diff + popup 展示
```

## 🚀 快速开始

### 开发调试

```bash
bun install
bun run setup:model   # 下载模型到 public/models/ (114MB)
bun dev
# 浏览器加载扩展：chrome://extensions/ → 开发者模式 → 加载已解压 → 选 .output/chrome-mv3
```

### 构建

```bash
bun run setup:model
bun build
# 输出：.output/chrome-mv3 可直接打包安装
```

### 测试

```bash
bun run test       # 单元测试 (vitest, 22 用例)
bun run test:e2e   # 端到端 (Playwright 加载真实扩展)
bun run compile    # 类型检查 (tsc)
```

## 🧠 引擎路线

双层演进：轻量模型快速扫描 → 大型 LLM 复杂校对。

| 阶段       | 模型                            | 大小    | 任务                 |
| ---------- | ------------------------------- | ------- | -------------------- |
| **① 当前** | MacBERT4CSC (Q8)                | 114 MB  | 字符级快速错别字检测 |
| **② 规划** | ChineseErrorCorrector-1.5B (Q4) | ~900 MB | 复杂语法/上下文纠错  |
| **③ 愿景** | ChineseErrorCorrector4-4B       | —       | 高质量效果旗舰       |

## 📦 模型下载

当前内置 MacBERT4CSC（Q8 量化，452MB → 114MB，精度无损）。

```bash
bun run setup:model
```

下载到 `public/models/`：

```text
public/models/
  ├── model_quantized.onnx
  └── vocab.txt
```

模型来源：[gandli/macbert4csc-base-chinese-q8-onnx](https://huggingface.co/gandli/macbert4csc-base-chinese-q8-onnx)

## 📄 许可证

Apache-2.0
