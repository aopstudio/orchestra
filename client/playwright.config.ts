import { defineConfig } from '@playwright/test'

/**
 * Phase 0 two-browser jam E2E.
 *
 * Boots both backends before the suite:
 *   1. the ws room server (npm run start -w @orchestra/server)
 *   2. the Vite dev server (port 5173, proxies /ws -> ws://localhost:8080)
 *
 * The ws server runs on port 8081 for the E2E run, NOT the default 8080:
 * this machine has an unrelated daemon (TeleAgent scheduler) permanently
 * listening on 8080, which would be "reused" by Playwright's port check and
 * never speak the orchestra protocol — the client would hang on CONNECTING.
 * The test therefore points the app at ws://localhost:8081 directly (the
 * WebSocket protocol has no CORS/origin gate, so bypassing the Vite /ws
 * proxy is fine). The default `npm run dev:server` still uses 8080.
 *
 * Tests are timing/audio sensitive, so they run serially (fullyParallel: false).
 */
export default defineConfig({
  testDir: './e2e',
  // .e2e.ts (not .spec.ts/.test.ts) so Vitest's default include never collects the Playwright suite.
  testMatch: /.*\.e2e\.ts/,
  // 套件冷启动时 Vite 首次页面加载可能较慢(大 bundle 按需编译),60s 容错。
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    // Only the full chromium build is installed (no headless shell); channel
    // 'chromium' opts into the new headless mode running that build.
    channel: 'chromium',
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: [
    {
      command: 'PORT=8081 npm run start -w @orchestra/server',
      cwd: '..',
      port: 8081,
      reuseExistingServer: false, // 见文件头注释: 复用易踩端口冲突,
      timeout: 30_000,
    },
    {
      // 把 /ws 与 /api 的 Vite 代理都指向 E2E 用的 8081 后端
      command: 'VITE_WS_TARGET=http://localhost:8081 npm run dev',
      port: 5173,
      reuseExistingServer: false, // 见文件头注释: 复用易踩端口冲突,
      timeout: 30_000,
    },
    {
      // 跨城模拟中继: 单程 60ms 延迟,用于验证事件架构对 RTT 不敏感
      command: 'PORT=8082 TARGET=ws://localhost:8081 DELAY_MS=60 node e2e/relay.cjs',
      port: 8082,
      reuseExistingServer: false, // 见文件头注释: 复用易踩端口冲突,
      timeout: 30_000,
    },
  ],
})
