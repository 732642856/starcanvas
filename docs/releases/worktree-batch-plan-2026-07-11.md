# StarCanvas 工作树拆批计划（2026-07-11）

## 快照

- 主仓：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`
- 分支：`codex/starcanvas-staged-split`
- HEAD / upstream：`a41305a`，`0 ahead / 0 behind`
- 工作树：`92 modified / 29 untracked / 0 deleted`
- 变更分布：`apps/web/src` 89、`apps/web/e2e` 24、docs 5、配置 3
- 大文件：变更集中无超过 1 MiB 的产品文件；仅 `.turbo/cache` 有大缓存，已 ignore
- Secret scan：当前 tracked tree 无候选；工作树候选均为 E2E 假 Key；227 个本地/远端 commit 的候选仅来自 `provider-health-summary.spec.ts` 测试夹具

## 扫描过的副本

| 位置 | 结论 |
|---|---|
| `Desktop/星轨画布文件库/star-canvas-files` | 21 个文件；主仓无相对路径缺失，不迁移 |
| `Documents/Codex/2026-06-18/new-chat-4/work/starcanvas-active` | 唯一缺路径为旧 `sentry.client.config.ts`；当前已使用 `instrumentation-client.ts`，不迁移 |
| `Documents/Codex/2026-06-21/.../work/starcanvas` | Preview Draft 已迁回；其余缺路径逐项对照当前实现，不批量复制 |
| `.gemini/antigravity-ide/brain/...` | 计划/报告资料，不是运行时代码 |
| `Documents/星轨画布/patches` | 历史迁移计划，保留为审计资料，不直接应用 |

旧副本中背景移除、BGM、连续性、角色参考和资产库已有当前等价实现。仅保留三类后续候选：客户端存储修复入口、Chat 批次来源追踪、浏览器音频/字幕最终合成；均不阻塞个人发布，未经当前代码/测试对照不得迁入。

## 提交批次

### Batch A：发布与运行时错误边界

范围：`.gitignore`、`next.config.ts`、`global-error.tsx`、`global-error.test.ts`。

发布/QA/错误账本包含多个功能批次的事实记录，统一留到 Batch F 逐 hunk 暂存。

硬标准：global-error 合同测试、typecheck、production build、定向 lint、`git diff --check`。

### Batch B：Provider 合同与网络层

范围：`app/api/ai/**` 的 `server-fetch` 统一、`lib/ai` 的 session scope / task readiness / health / smoke / error normalization、Settings provider UI 及对应单测/E2E。

注意：`SettingsPanel.tsx` 与 `ProductionRunQueuePanel.tsx` 使用 `git add -p`；只纳入 provider readiness/smoke hunks。

审计：无 Key 泄漏、无 AI route 裸 `fetch()` 回归；`serverFetchContract`、provider session scope、readiness/health/smoke/error normalization 定向测试 `exit 0`。

### Batch C：媒体桥接、资产持久化与真实产物回写

范围：`providerMediaDataUrl`、image/video/talking-photo/upscale/focus-edit 服务、`toDataUrl`、`videoSourceImage`、`useCanvasPersistence`、`createShotImageArtifacts`、角色三视图及媒体桥接 E2E。

硬标准：本地媒体 -> provider 输入、生成产物 -> `assetId/persistence`、刷新/项目包恢复后可继续消费。

审计：无 secret；provider media bridge、image/video generation、media hydration、shot artifact 定向回归 `exit 0`。

### Batch D：Auto Agent 与 Preview Draft 事务

范围：`chatPreviewState`、`DraftNodeWrapper`、`previewTransactionLifecycle*`、`chatActionNodePlacement`、Auto Agent 澄清/真实 Project Bible、Preview E2E。

共享文件：`StarCanvas.tsx`、`ChatPanel.tsx`、`canvasStore.ts`、`chatActions.ts`。必须 `git add -p`，只纳入 preview/agent hunks。

审计：Preview state、deferred lifecycle、节点布局、Auto Agent 定向回归均 `exit 0`；production E2E 已有确认/丢弃/deferred edge 证据。

### Batch E：生产队列、Shot Planning 与交付导出

范围：production executor、Shot Planning adapter/store、项目包 roundtrip、剪映 ZIP、结构化导出、浏览器视频/音频/字幕 MP4 合成及超限 ZIP 降级、Export Preflight 及对应单测/E2E。

共享文件：`StarCanvas.tsx`、`useWorkflowRunner.ts`、`useCanvasPersistence.ts`。承接 Batch C/D 未纳入的 production/export hunks；纳入 `videoCompositionBrowser.ts`、`videoCompositionGuard.ts`、`WorkflowNode.tsx` 与合成 E2E/单测。

审计：队列依赖、Shot Planning bridge、项目包导入/导出、剪映 ZIP、生产预检定向回归 `exit 0`；含“图片不导出为假 MP4”与 data URL 文件名保护。

本轮 composition hunk 边界：

| 文件 | 暂存方式 | 允许范围 |
| --- | --- | --- |
| `videoCompositionBrowser.ts`、`videoCompositionGuard.ts`、`videoCompositionPlan.ts`、对应单测/E2E | 整文件 | 浏览器 MP4、分阶段字幕/混音、64MB 预检、超限 ZIP 降级 |
| `WorkflowNode.tsx` | `git add -p` | composition 下载 MP4、超限导出 ZIP 按钮 |
| `useWorkflowRunner.ts` | `git add -p` | composition 失败向外抛出、成功状态不被旧 running metadata 覆盖 |
| `StarCanvas.tsx` | `git add -p` | `starcanvas:open-jianying-export` listener 三处 hunk |
| `QA_CHECKLIST.md`、能力矩阵、错误账本 | `git add -p` | 仅 composition/EL-080~082 事实更新 |

### Batch F：E2E 基础设施与最终事实文档

范围：`playwright.config.ts`、`e2e/utils.ts`、preflight、`playwrightBrowser.ts`、基础入口稳定性测试、最终 capability/QA/release docs。

该批次最后提交，确保文档记录的是提交后的真实结果。

审计：E2E readiness preflight、Chrome executable resolver、global-error 合同测试 `9/9` 通过；事实文档已交叉引用 error ledger、能力矩阵与验收报告。

## 执行约束

1. 每批先 `git diff -- <paths>`，共享文件只用 `git add -p`。
2. 每批暂存后运行 `git diff --cached --check`，并确认无 secret、缓存、生成物。
3. 每批至少跑对应定向测试 + typecheck；Batch F 再跑 full unit、lint、P0/P1 E2E。
4. 不删除历史副本，不把 `.serena/`、`graphify-out/`、`.next/`、Playwright artifacts 纳入提交。
5. 当前仅生成计划；未执行 stage、commit 或 push。

## Fresh 验证

- Full unit：`exit 0`；localhost:3000 route-contract 仍为既有跳过诊断。
- Typecheck：单独运行 `exit 0`。
- Lint：上一轮代码定向 lint `exit 0`；本轮 full lint 被 120 秒工具预算终止且无诊断，见 `EL-078`。
- Secret scan：工作树、tracked tree、全部 refs 已完成。
- `git diff --check`：通过。
