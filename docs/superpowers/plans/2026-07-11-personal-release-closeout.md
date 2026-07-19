# StarCanvas Personal Release Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前主仓收口为可重复启动、可跑真实主链、可恢复交付的个人正式使用版本。

**Architecture:** 不扩新功能。复用现有 Auto Agent、Project Bible、Shot Planning、Production Queue、项目包和剪映兼容导出链。固定一个 webpack dev server 与一个 BASE_URL，分层验证；任何失败先写 `error-ledger.md`，再最小修复。

**Tech Stack:** Next.js 16、React 19、@xyflow/react v12、Zustand v5、TailwindCSS v4、Node test、Playwright、系统 Google Chrome。

## Global Constraints

- 主仓固定：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`
- 不 revert 用户已有改动。
- 搜索使用 `rg`；手工编辑使用 `apply_patch`。
- 复用现有 helper、测试 fixture、E2E utils；不新建第二套 provider、资产或队列实现。
- API Key 只从现有安全配置读取；不得写入代码、测试、文档或终端输出。
- E2E 固定 webpack dev server、固定 BASE_URL、系统 Google Chrome。
- 每个失败先查 `docs/reference/error-ledger.md`；新错误追加记录。
- 每个任务结束至少跑定向测试、typecheck、lint、`git diff --check`。

## Task 1: 固定真实用户主链验收

**Files:**

- Inspect: `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`
- Inspect: `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`
- Inspect: `apps/web/e2e/production-run-queue.spec.ts`
- Modify only if failed: corresponding production code/test
- Update: `docs/QA_CHECKLIST.md`
- Update on failure: `docs/reference/error-ledger.md`

**Acceptance chain:** 一句话创意 → 导演澄清 → Project Bible/角色/场景/分镜 → 真实生图回写节点和资产库 → Shot Planning → 生产队列 → 视频结果回收 → 项目包/剪映交付。

- [x] 启动固定 production server，记录 BASE_URL 与 PID；dev server 编译卡顿后切 fresh webpack build。
- [x] 跑 text/image/video provider readiness；禁止重复烧额度的无目标 smoke。
- [x] 跑 Auto Agent 真实 Project Bible 专项。
- [x] 跑真实首图回写专项。
- [x] 跑真实视频结果回收专项；确认最终 `videoUrl` 可读，并由现有持久化测试守 `assetId + persistence`。
- [x] 用现有导出链拿到项目包与剪映兼容 ZIP。
- [x] 失败时按层归因：入口、provider 合同、远端生成、资产回写、队列状态、导出。
- [x] 只修首个真实 blocker；补最小防复发测试。
- [x] 更新 QA 结果、时间、BASE_URL、真实/模拟边界。

**Verification:**

```bash
npx -y pnpm@10.33.0 --filter web typecheck
npx -y pnpm@10.33.0 --filter web lint
git diff --check
```

## Task 2: 发布回归矩阵与 blocker 收束

**Files:**

- Read first: `docs/QA_CHECKLIST.md`
- Read first: `docs/reference/error-ledger.md`
- Reuse: `apps/web/e2e/utils.ts`
- Reuse: `apps/web/playwright.config.ts`
- Update: `docs/QA_CHECKLIST.md`
- Update on failure: `docs/reference/error-ledger.md`

- [x] 跑 `pnpm --filter web typecheck`。
- [x] 跑 `pnpm --filter web test`。
- [x] 跑 `pnpm --filter web lint`，区分既有 warning 与新增 error。
- [x] 跑 P0/P1 浏览器矩阵：核心画布、Auto Agent、Project Bible、生产队列、项目包 roundtrip、剪映导出、真实视频工作流、reverse-prompt。
- [x] 每条 E2E 只守一个硬标准；不把恢复、真实长任务、导出塞进同一超长测试。
- [x] 对失败先复跑一次并检查 server/log/trace；环境失败不得改产品代码。
- [x] 修复确认属于产品的 blocker，并补对应最小单测或 E2E。
- [x] 所有命令和结果写回 QA；错误模式写回 error ledger。

**Exit criteria:** 0 type error、0 lint error、定向 P0/P1 E2E 全绿；真实 provider 波动有可见失败归因与可重试退路。

## Task 3: 工作树清点与个人发布候选

**Files:**

- Inspect: entire `git status --short`
- Inspect: `.gitignore`
- Inspect: `.serena/`, `apps/web/src/graphify-out/`, test artifacts, historical reports
- Update if justified: `.gitignore`
- Update: `docs/reference/current-capability-map.md`
- Create: `docs/releases/personal-release-acceptance-2026-07-11.md`

- [x] 按代码、测试、文档、缓存、生成物分类当前 modified/untracked 文件。
- [x] 查同名副本和历史碎片；只迁移主仓缺失且有证据价值的内容。
- [x] 缓存/生成物加入 ignore；不得删除无法确认归属的用户文件。
- [x] 精确审查本轮相关 diff；不混入无关改动。
- [x] 生成个人发布验收报告：启动方式、已验证主链、provider 配置边界、已知非阻塞限制、回滚/备份方式。
- [x] 再跑 typecheck、tests、lint、P0/P1 E2E、`git diff --check`。
- [x] 形成可提交批次建议；未经用户要求不自动提交或推送。

**Exit criteria:** 主仓事实源一致；缓存/历史碎片不再干扰判断；用户拿到固定启动方式与验收报告。

## Task 4: 工作树拆批与历史碎片复核

- [x] Fresh fetch 远端 refs，确认当前分支 `0 ahead / 0 behind`。
- [x] 重扫 Desktop、Codex 2026-06-18/21、Antigravity brain、资料仓 patches。
- [x] 对旧副本缺路径做当前等价实现检索；禁止批量复制。
- [x] 扫描工作树、当前 tracked tree 与全部 refs 的 secret 候选。
- [x] 生成 `docs/releases/worktree-batch-plan-2026-07-11.md`，明确共享文件必须 patch-stage。
- [x] 本轮未 stage、commit 或 push；后续仍需用户明确授权才执行这些外部状态变更。

## Deferred Enhancements

以下不阻塞个人正式使用：

- 项目包流式 ZIP / 超大媒体优化。
- PDF / Excel 高级交付。
- 浏览器音频、字幕视频合成的性能与交付验证（单片段、双片段 MP4 已通过）。
- 更强视频语义理解模型。
- `StarCanvas.tsx` 渐进拆分。
- 多用户、计费、SLA、云部署。

## Completion Estimate

- 必做：3 个任务。
- 理想执行：2–4 轮；取决于真实 provider 是否出现 blocker。
- 无 provider blocker：可在 Task 1 + Task 2 后开始个人正式使用；Task 3 负责形成干净发布候选。
