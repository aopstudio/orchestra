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
    proxy: {
      '/ws': {
        target: process.env.VITE_WS_TARGET ?? 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
