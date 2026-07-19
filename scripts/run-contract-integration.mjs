#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForLocalServerReady } from "./server-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.STARCANVAS_CONTRACT_PORT || 3110);
const baseUrl = process.env.STARCANVAS_E2E_BASE_URL || `http://127.0.0.1:${port}`;
const devServer = spawn(process.execPath, ["scripts/starcanvas-dev-safe.mjs", String(port)], {
  cwd: root,
  detached: true,
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});
let serverReady = false;
const serverExitedBeforeReady = once(devServer, "exit").then(([code, signal]) => {
  if (!serverReady) {
    throw new Error(`Contract server exited before readiness (code ${code ?? "unknown"}, signal ${signal ?? "none"})`);
  }
});

async function stopServer() {
  if (devServer.exitCode !== null || devServer.killed) return;
  process.kill(-devServer.pid, "SIGTERM");
  await Promise.race([
    once(devServer, "exit"),
    new Promise((resolveExit) => setTimeout(resolveExit, 5_000)),
  ]);
}

try {
  const ready = await Promise.race([
    waitForLocalServerReady({
      port,
      maxAttempts: 120,
      intervalMs: 500,
      timeoutMs: 30_000,
      readyPath: "/api/ai/upscale",
      isReady: (response) => response.status < 500,
    }),
    serverExitedBeforeReady,
  ]);
  if (!ready.ok) {
    throw new Error(`Contract server did not become ready at ${baseUrl}: ${ready.error ?? `HTTP ${ready.status ?? "unknown"}`}`);
  }
  serverReady = true;

  const testProcess = spawn(process.execPath, [
    "--test",
    "--experimental-strip-types",
    "apps/web/src/app/api/ai/route-contract.test.ts",
  ], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, STARCANVAS_E2E_BASE_URL: baseUrl },
  });
  const [code, signal] = await once(testProcess, "exit");
  if (signal || code !== 0) process.exitCode = code || 1;
} finally {
  await stopServer();
}
