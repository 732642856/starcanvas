import { accessSync, constants } from "node:fs"

export interface ResolvePlaywrightChromeExecutablePathOptions {
  env?: Record<string, string | undefined>
  platform?: NodeJS.Platform
  isExecutableFile?: (filePath: string) => boolean
}

function defaultIsExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function browserCandidates(platform: NodeJS.Platform): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
  }

  if (platform === "linux") {
    return [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ]
  }

  if (platform === "win32") {
    return [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ]
  }

  return []
}

/**
 * 为本机 Playwright E2E 解析一个可用 Chromium 浏览器。
 * 显式配置始终优先，未配置时才扫描常见系统安装路径。
 */
export function resolvePlaywrightChromeExecutablePath(
  options: ResolvePlaywrightChromeExecutablePathOptions = {},
): string | undefined {
  const env = options.env ?? process.env
  const explicitPath = env.STARCANVAS_E2E_CHROME_PATH?.trim()
  if (explicitPath) return explicitPath

  const platform = options.platform ?? process.platform
  const isExecutableFile = options.isExecutableFile ?? defaultIsExecutableFile
  return browserCandidates(platform).find((filePath) => isExecutableFile(filePath))
}
