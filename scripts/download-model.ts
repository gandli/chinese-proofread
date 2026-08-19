#!/usr/bin/env bun
// 下载量化模型到 public/models/
import { $ } from "bun";
import { exists } from "node:fs/promises";

const MODEL_REPO = "gandli/macbert4csc-base-chinese-q8-onnx";
const TARGET = "public/models";

const files = ["model_quantized.onnx", "vocab.txt"];

// 确保目录存在
await $`mkdir -p ${TARGET}`;

for (const file of files) {
  const dest = `${TARGET}/${file}`;
  if (await exists(dest)) {
    console.log(`跳过：${dest} 已存在`);
    continue;
  }
  console.log(`下载：${file} ...`);
  await $`curl -L -o ${dest} "https://huggingface.co/${MODEL_REPO}/resolve/main/${file}"`;
  console.log(`  ✓ ${file}`);
}

console.log("模型准备完成。运行 `bun build` 即可构建扩展。");
