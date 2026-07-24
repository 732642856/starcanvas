# API Contract Reliability Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make API contract verification fail explicitly when its required Next server is unavailable, then provide a self-contained integration command that starts and verifies that server.

**Architecture:** Keep pure unit tests in `web:test`. Move HTTP contract tests behind an explicit integration runner. Reuse the repository's existing `probeLocalServerReady` behavior conceptually: an unavailable prerequisite is a test failure, never a skipped assertion path.

**Tech Stack:** Node.js test runner, Next.js, pnpm, TypeScript.

### Task 1: Remove the false-green contract-test path

**Files:**
- Modify: `apps/web/src/app/api/ai/route-contract.test.ts`

- [x] **Step 1: Write a failing preflight test**

Add a test that invokes the extracted preflight function using a throwing `fetch` stub and asserts a rejected promise containing the base URL.

- [x] **Step 2: Run the focused test and verify failure**

Run: `node --test --experimental-strip-types apps/web/src/app/api/ai/route-contract.test.ts`

Expected: failing preflight behavior instead of a skipped suite that exits zero.

- [x] **Step 3: Implement explicit preflight failure**

Replace `t.skip(...)` with a thrown error that names `STARCANVAS_E2E_BASE_URL`; use a bounded request timeout.

- [x] **Step 4: Verify focused tests**

Run: `node --test --experimental-strip-types apps/web/src/app/api/ai/route-contract.test.ts`

Expected: no-server execution exits non-zero and prints one actionable prerequisite error.

### Task 2: Separate the integration command from default unit tests

**Files:**
- Modify: `apps/web/package.json`

- [x] **Step 1: Write the command contract**

Keep `test` free of `route-contract.test.ts`; add `test:integration:contracts` for the HTTP suite.

- [x] **Step 2: Implement package scripts**

Exclude the server-dependent test from `test`; give the integration script an explicit name and preserve its `STARCANVAS_E2E_BASE_URL` override.

- [x] **Step 3: Verify script selection**

Run: `corepack pnpm --filter web test` and confirm it has no localhost connection attempts.

### Task 3: Verify current workflow fixes remain covered

**Files:**
- Test: existing `apps/web/src/app/canvas/utils/workflow-run-reducer.test.ts`

- [x] **Step 1: Run reducer suite**

Run: `node --test --experimental-strip-types apps/web/src/app/canvas/utils/workflow-run-reducer.test.ts`

- [x] **Step 2: Record residual gap**

Do not invent a hook test harness unless an existing runner seam is found. Leave the registry migration as a separate planned change because it restructures production execution, not the contract-test defect.

### Task 4: Final verification

- [x] **Step 1:** Run `corepack pnpm --filter web typecheck`.
- [x] **Step 2:** Run `corepack pnpm --filter web test`.
- [x] **Step 3:** Run the self-starting integration command and verify it exits cleanly.
- [x] **Step 4:** Run `corepack pnpm --filter web lint` and report pre-existing warnings separately.
