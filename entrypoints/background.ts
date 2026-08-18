// Background: 仅保留消息路由（引擎已迁至 popup —— SW 无法初始化 onnxruntime wasm）
export default defineBackground(() => {
  console.log('[chinese-proofread] background ready (engine runs in popup)');
});