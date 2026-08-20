#!/usr/bin/env bun
// 下载量化模型到 public/models/
// 用法: bun run setup:model [--mirror hf|hfd]
//   --mirror hf   默认，Hugging Face 官方（海外）
//   --mirror hfd  hf-mirror.com（国内加速镜像）
import { $ } from "bun";
import { exists } from "node:fs/promises";

const MODEL_REPO = "gandli/macbert4csc-base-chinese-q8-onnx";
const TARGET = "public/models";
const MIRRORS = {
  hf: "https://huggingface.co",
  hfd: "https://hf-mirror.com",
};

const files = ["model_quantized.onnx", "vocab.txt"];

const mirrorArg = Bun.argv.find((a) => a.startsWith("--mirror=")) ?? "--mirror=hf";
const mirror = mirrorArg.split("=")[1] as keyof typeof MIRRORS;
const base = MIRRORS[mirror] ?? MIRRORS.hf;

console.log(`模型镜像：${mirror} → ${base}`);

// 确保目录存在
await $`mkdir -p ${TARGET}`;

for (const file of files) {
  const dest = `${TARGET}/${file}`;
  if (await exists(dest)) {
    console.log(`跳过：${dest} 已存在`);
    continue;
  }
  console.log(`下载：${file} ...`);
  // curl -L 跟随重定向；--progress-bar 显示进度
  await $`curl -L --progress-bar -o ${dest} "${base}/${MODEL_REPO}/resolve/main/${file}"`;
  console.log(`  ✓ ${file}`);
}

console.log("模型准备完成。运行 `bun build` 即可构建扩展。");
