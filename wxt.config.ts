import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    version: '0.1.0',
    name: '中文校对助手',
    description: '本地 AI 中文长文智能校对 - 离线可用',
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self'",
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    options_page: 'options.html',
  },
  vite: () => ({
    // ponytail: Tailwind v4 插件类型与 WXT 内置 Vite 5 类型不匹配，as any 规避；
    // WXT 升 Vite 6 后移除
    plugins: [tailwindcss() as any],
    build: {
      target: 'esnext',
    },
  }),
});