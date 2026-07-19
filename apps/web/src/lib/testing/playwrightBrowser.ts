import { accessSync, constants } from "node:fs";

type ResolvePlaywrightChromeExecutablePathOptions = {
  env?: Record<string, string | undefined>;
  isExecutableFile?: (filePath: string) => boolean;
  platform?: NodeJS.Platform;
};

function isExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolvePlaywrightChromeExecutablePath(
  options: ResolvePlaywrightChromeExecutablePathOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const canExecute = options.isExecutableFile ?? isExecutableFile;
  const explicitPath = env.STARCANVAS_E2E_CHROME_PATH?.trim();
  if (explicitPath && canExecute(explicitPath)) return explicitPath;

  if ((options.platform ?? process.platform) === "darwin") {
    const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (canExecute(macChrome)) return macChrome;
  }

  return undefined;
}
