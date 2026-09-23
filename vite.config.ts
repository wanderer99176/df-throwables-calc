import { defineConfig } from 'vite'

// Electron 用 file:// 加载 dist，资源需相对路径
export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
