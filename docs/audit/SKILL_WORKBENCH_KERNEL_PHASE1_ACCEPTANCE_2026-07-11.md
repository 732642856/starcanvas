# Skill Workbench Kernel：Phase 1 验收记录

- 日期：2026-07-11
- 分支：`feature/skill-workbench-kernel`
- 范围：共享 Skill 内核、Film Crew 首个注册 Skill、通用/导演组工作台 Profile、画布 AgentNode 运行时接入。

## 结论

Phase 1 建立了“共享内核、双工作台”的最小可运行边界：通用画布与导演组画布可共享项目资产命名空间，同时隔离布局、历史和快照；Film Crew 已通过统一 Runtime 执行并将结果映射回现有 AgentNode 字段。该阶段不改变既有的创作节点与 API 路由。

## 已交付内核

| 区域 | 交付 | 关键保证 |
| --- | --- | --- |
| Contracts | `resource`、`skill`、`run`、`registry`、`workspace` | 版本化请求/结果、可重放的 Run 身份、资源引用边界 |
| Registry | `SkillRegistry` | primary 优先、priority 降序、ID 字典序的确定性路由 |
| Runtime | `SkillRuntime` + `RunPort` | queued → running → 终态、结构化错误、结果身份校验 |
| Graph/Asset | 独立 Port 与内存适配器 | GraphPatch 原子/幂等；资产 Candidate/Promote/Reject/Rollback lineage |
| Workspace | `general` / `director` Profile | 共享项目资产；隔离布局、历史、快照和默认工作流 |
| Film Crew | `FilmCrewSkillAdapter` | 既有编排被适配为 L1 primary Skill，进度映射为 RunEvent |

## 画布垂直切片

`runAgentFromCanvas(nodeId)` 不再绕过 Runtime 直接执行节点。当前链路为：

```text
AgentNode → createAgentSkillRuntime → SkillRegistry
          → SkillRuntime → FilmCrewSkillAdapter → orchestrateCrew
          → SkillResult → mapRunToAgentNodePatch → CanvasNodeData
```

兼容性策略：

- 空剧本仍即时写入 AgentNode 错误状态；
- 开始时写入 `agentStatus: "running"` 与 `activeRunId`；
- 成功时写入 `crewStatuses`、`executionTrace`、`runMeta`、`lastSuccessfulRunId`；
- 失败时保留结构化错误摘要、运行历史与 `WorkflowRunEvent`；
- 当前画布侧仍使用内存 `RunPort`，持久化 Run 存储是后续阶段的替换点。

## 回归覆盖

1. 合同、Registry、Runtime、Graph、Asset、Workspace Profile 的确定性 `node:test` 覆盖；
2. Film Crew Adapter 的输入校验、进度、取消、部分失败和错误转换覆盖；
3. `createAgentSkillRuntime.test.ts`：验证画布装配注册 Film Crew 并完成 Run；
4. `filmCrewRuntimeVerticalSlice.test.ts`：验证装配 → Runtime → RunStore → AgentNode patch 的完整确定性链路；
5. 补回 `playwrightBrowser.ts`：恢复原有浏览器路径解析测试依赖，并在 Playwright 配置中复用同一解析逻辑。

## 本次验证证据

在本 worktree 的 `apps/web` 运行：

```bash
pnpm test
# 994 pass / 0 fail / 7 skipped

pnpm lint
# 0 errors；77 个既有 warning

pnpm build
# Next.js production build 成功，并完成内置 TypeScript 校验

pnpm exec tsc --noEmit --project tsconfig.json \
  --tsBuildInfoFile /tmp/starcanvas-skill-workbench.tsbuildinfo
# build 生成 .next 类型后通过

pnpm test:e2e:smoke:prod
# 5 passed / 11 skipped / 0 failed；生产核心路径通过
# 跳过项均为既有的条件性 UI 覆盖或显式标注的后续限制

git diff --check
# 通过
```

## 已知边界与下一阶段

- `/director` 的独立路由、布局恢复和 UI 入口尚未创建；Phase 1 仅完成 Profile 与存储边界。
- Run 持久化、跨会话恢复、取消控制器与实时订阅仍是后续工作。
- Playwright 浏览器 smoke 配置已优先使用 `STARCANVAS_E2E_CHROME_PATH`，否则探测系统 Chrome；生产 smoke 脚本默认关闭视频录制，避免未安装 Playwright ffmpeg 时在创建浏览器页面前失败。需要保留失败视频时可显式运行 `STARCANVAS_E2E_DISABLE_VIDEO=0 pnpm test:e2e:smoke:prod`，并先安装 Playwright ffmpeg。
- 现有 lint warning 未在本阶段扩散；本阶段新增文件没有 lint error。
