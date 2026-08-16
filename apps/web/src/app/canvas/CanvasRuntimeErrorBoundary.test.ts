import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const boundaryPath = path.join(import.meta.dirname, "components/canvas/CanvasRuntimeErrorBoundary.tsx")
const pagePath = path.join(import.meta.dirname, "page.tsx")

test("canvas page wraps StarCanvas with a local runtime error boundary", async () => {
  const pageSource = await readFile(pagePath, "utf8")

  assert.match(pageSource, /CanvasRuntimeErrorBoundary/)
  assert.match(pageSource, /<CanvasRuntimeErrorBoundary>/)
  assert.match(pageSource, /<StarCanvas projectId=\{projectId\} \/>/)
})

test("CanvasRuntimeErrorBoundary is a client boundary with retry fallback", async () => {
  const source = await readFile(boundaryPath, "utf8")

  assert.match(source, /["']use client["']/)
  assert.match(source, /getDerivedStateFromError/)
  assert.match(source, /componentDidCatch/)
  assert.match(source, /data-testid="starcanvas-runtime-error"/)
  assert.match(source, /重试画布组件/)
})
