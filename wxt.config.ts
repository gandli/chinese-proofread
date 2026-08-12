import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    version: '0.1.0',
    name: '中文校对助手',
    description: '本地 AI 中文长文智能校对 - 离线可用',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    build: {
      target: 'esnext',
    },
  }),
});