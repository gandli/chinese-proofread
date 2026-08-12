# chinese-proofread 中文校对助手

> 浏览器本地 AI 中文长文智能校对 — 离线可用，隐私保护

## 🎯 产品定位

一个完全本地运行的浏览器扩展，对当前网页中的长篇文章进行智能校对

核心卖点：**离线 + 隐私 + 中文智能校对** —— 正文和校对结果不上传服务器，断网也能工作。

## 🏗️ 架构

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
  分词/分句 + 背景推理
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

* 双层引擎演进路线：
  - **第一阶段**：轻量 MacBERT4CSC 负责快速错别字检测
  - **第二阶段**：ChineseErrorCorrector-1.5B (Qwen 基底 LLM) 负责复杂语法/用词校对
  - **第三阶段**：ChineseErrorCorrector4-4B 作为高质量效果旗舰

## 🚀 使用方式

### 开发

```bash
bun install
bun dev
# 浏览器加载扩展：chrome://extensions/ → 加载解压后的 .output/chrome-mv3
```

### 编译

```bash
bun build
# 输出：.output/chrome-mv3 可以直接打包安装
```

## 📦 模型

当前内置模型：

| 模型 | 大小 | 类型 | 任务 | 下载地址 |
|------|------|------|------|----------|
| MacBERT4CSC (Q8 量化) | **114 MB** | 字符级拼写纠错 | 快速扫描错别字 | [gandli/macbert4csc-base-chinese-q8-onnx](https://huggingface.co/gandli/macbert4csc-base-chinese-q8-onnx) |

下载后放置到 `public/models/` 目录：
```
public/models/
  ├── model_quantized.onnx
  └── vocab.txt
```

* 下一阶段：ChineseErrorCorrector-1.5B (Q4) → ~ 900 MB | 生成式校对 | 复杂语法/上下文纠错

## 🔒 隐私

- ❌ 无云端 API 调用
- ❌ 不上传正文/校对结果
- ❌ 不需要用户账号
- ✅ 断网依然可用

## 📄 许可证

Apache-2.0
