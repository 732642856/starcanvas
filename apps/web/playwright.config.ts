import { defineConfig, devices } from "@playwright/test"
import { resolvePlaywrightChromeExecutablePath } from "./src/lib/testing/playwrightBrowser"

const PORT = Number(process.env.STARCANVAS_E2E_PORT || 3107)
const baseURL = process.env.STARCANVAS_E2E_BASE_URL || `http://127.0.0.1:${PORT}`
const isCI = Boolean(process.env.CI)
const isProdE2E = process.env.E2E_SERVER === "prod"
const chromeExecutablePath = resolvePlaywrightChromeExecutablePath()
const videoMode = process.env.STARCANVAS_E2E_DISABLE_VIDEO === "1"
  ? "off"
  : "retain-on-failure"

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.STARCANVAS_E2E_OUTPUT_DIR || "/tmp/starcanvas-playwright-test-results",

  // ── 并发控制：串行跑，避免压垮 server ──
  fullyParallel: false,
  workers: 1,

  // ── 超时配置：prod 模式更稳定，用更短 timeout；dev 模式编译慢，需充裕时间 ──
  timeout: isProdE2E ? 120_000 : 180_000,
  expect: {
    timeout: isProdE2E ? 10_000 : 15_000,
  },

  forbidOnly: isCI,
  retries: isCI ? 1 : 0,

  // ── reporter：本地用 list + html ──
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: isProdE2E ? 30_000 : 90_000,

    trace: "retain-on-failure",
    video: videoMode,
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromeExecutablePath
          ? { launchOptions: { executablePath: chromeExecutablePath } }
          : {}),
      },
    },
  ],

  // ── web server：prod/dev 双模式 ──
  //   E2E_SERVER=prod → 使用 next start (需要先 build)
  //   默认（dev）      → 使用 next dev --webpack
  webServer: process.env.STARCANVAS_E2E_BASE_URL
    ? undefined
    : {
        command: isProdE2E
          ? `pnpm exec next start --hostname 127.0.0.1 --port ${PORT}`
          : `pnpm exec next dev --webpack --hostname 127.0.0.1 --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: isProdE2E ? 60_000 : 180_000,
      },
})
