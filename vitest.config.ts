import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 10000,
    reporters: ['verbose'],
    // 用 node 环境避免 browser globals 注入 onnxruntime-web
    environment: 'node',
    // 不加载 onnxruntime-web 到测试环境
    deps: {
      inline: ['@mozilla/readability'],
      // vitest 不会把 onnxruntime-web 当外部模块引入
    },
  },
});
