import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const apiAiRoot = dirname(fileURLToPath(import.meta.url));

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return collectRouteFiles(path);
      return entry === "route.ts" ? [path] : [];
    });
}

describe("AI route server fetch contract", () => {
  it("uses centralized server-fetch helpers for upstream fetch calls", () => {
    const offenders = collectRouteFiles(apiAiRoot)
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8");
        const hasFetchCall = /\bfetch\s*\(/.test(source);
        if (!hasFetchCall) return false;
        return !source.includes("@/lib/ai/server-fetch") &&
          !source.includes("../../../../lib/ai/server-fetch.ts");
      })
      .map((filePath) => relative(apiAiRoot, filePath));

    assert.deepEqual(offenders, []);
  });
});
