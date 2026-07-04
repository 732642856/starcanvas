import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePlaywrightChromeExecutablePath,
} from "./playwrightBrowser.ts";

describe("resolvePlaywrightChromeExecutablePath", () => {
  it("prefers explicit environment variables over auto-detected system browsers", () => {
    const resolved = resolvePlaywrightChromeExecutablePath({
      env: {
        STARCANVAS_E2E_CHROME_PATH: "/custom/chrome",
      },
      isExecutableFile: () => true,
      platform: "darwin",
    });

    assert.equal(resolved, "/custom/chrome");
  });

  it("auto-detects the standard macOS Google Chrome bundle when no env override is set", () => {
    const resolved = resolvePlaywrightChromeExecutablePath({
      env: {},
      platform: "darwin",
      isExecutableFile: (filePath) =>
        filePath === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

    assert.equal(
      resolved,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );
  });

  it("returns undefined when no configured or detected browser is executable", () => {
    const resolved = resolvePlaywrightChromeExecutablePath({
      env: {},
      platform: "darwin",
      isExecutableFile: () => false,
    });

    assert.equal(resolved, undefined);
  });
});
