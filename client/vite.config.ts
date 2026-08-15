import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Phase 0 client dev server.
 *
 * The UI speaks the WebSocket protocol through the Vite proxy so the browser
 * only ever sees `ws://localhost:5173/ws` — no CORS/port juggling.
 *
 * The backend target is configurable via `VITE_WS_TARGET` (default
 * `ws://localhost:8080`). This machine has an unrelated daemon squatting on
 * port 8080, so run the backend on another port and point the proxy at it,
 * e.g.:
 *
 *   PORT=8081 npm run dev:server
 *   VITE_WS_TARGET=ws://localhost:8081 npm run dev:client
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // 端口被占时报错而不是静默换端口 —— 避免 dev server 悄悄跑到 5175、
    // 页面 502 却查不出原因(E2E 也固定用 5173,冲突时明确提示先停 dev server)。
    strictPort: true,
    proxy: {
      '/ws': {
        target: process.env.VITE_WS_TARGET ?? 'ws://localhost:8080',
        ws: true,
      },
      '/api': {
        target: process.env.VITE_WS_TARGET ?? 'http://localhost:8080',
      },
    },
  },
})
