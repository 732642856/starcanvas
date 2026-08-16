import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const servicePath = path.join(import.meta.dirname, "characterAstrologyService.ts")

test("character astrology service lazy-loads iztro only when generating a chart", async () => {
  const source = await readFile(servicePath, "utf8")

  assert.doesNotMatch(source, /import\s+\{\s*astro\s*\}\s+from\s+["']iztro["']/)
  assert.match(source, /await import\(["']iztro["']\)/)
})
