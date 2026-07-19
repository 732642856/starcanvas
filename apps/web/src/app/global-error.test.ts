import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const globalErrorPath = path.join(import.meta.dirname, "global-error.tsx");

test("App Router global error page reports render errors to Sentry", async () => {
  const source = await readFile(globalErrorPath, "utf8");

  assert.match(source, /["']use client["']/);
  assert.match(source, /Sentry\.captureException\(error\)/);
  assert.match(source, /<html/);
  assert.match(source, /<body/);
});
