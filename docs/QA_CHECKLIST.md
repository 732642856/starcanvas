# QA 人工验收清单

## 2026-07-11 Sentry 根错误边界验收

- 复用旧 Codex 副本 `global-error.tsx` / `global-error.test.ts`，实现与 Sentry 官方 Next.js App Router 手动配置模式一致。
- 合同测试：`1/1` 通过。
- Typecheck：通过。
- Fresh production build：`exit 0`。
- 构建日志：无 `don't have a global error handler` / missing `global-error` 警告。

> 在每次 Release Candidate 发布前，按此清单逐项人工验证。

## 2026-07-11 Task 3 工作树/个人发布候选验收

- 主仓、两个 Git worktree、旧开发副本、旧 Codex 副本、历史 docs/feature 分支已扫描。
- `.serena/` 与 `apps/web/src/graphify-out/` 确认为本地工具状态/索引，已 ignore，未删除。
- 剩余 untracked 均为被引用实现、单测/E2E 或发布文档；无 >1 MiB 新大文件。
- Secret scan：变更文件无真实 `sk-...` 长密钥；Git 仅跟踪 `.env.example`。
- 发现 P1：“先预览”草稿节点事务仅留在旧 Codex 副本，主仓 UI 却仍展示该模式；详见 `EL-074`。
- Fresh unit：`959 tests / 950 pass / 9 skipped / 0 fail`。
- Fresh typecheck：通过。
- Fresh lint：`0 errors / 78 warnings`。
- Fresh `git diff --check`：通过。
- P0/P1 E2E：沿用本任务紧邻的同一 production build 矩阵；Task 3 后续仅改 docs/ignore，未改产品运行码。

## 2026-07-11 Preview Draft 历史实现恢复验收

- 复用：旧 Codex 副本 `DraftNodeWrapper`、`chatPreviewState`、`previewTransactionLifecycle`、`chatActionNodePlacement`及测试；未重写状态机。
- 对标：React Flow 官方 `NodeToolbar`；LangGraphJS human-in-the-loop `interrupt/resume` 状态模式；均为 MIT 开源参考。
- 状态单测：`17/17`。
- 批量布局单测：`2/2`。
- Production E2E：`chat-preview-draft-nodes.spec.ts` `2/2` 通过，覆盖确认、丢弃、普通 Chat action 批次、deferred edge。
- Production build：通过。
- Full unit：`978 tests / 969 pass / 9 skipped / 0 fail`。
- Typecheck：通过。
- Lint：`0 errors / 79 warnings`。
- `git diff --check`：通过。

## 2026-07-11 Task 2 发布回归矩阵

- Full unit：`957 tests / 948 pass / 9 skipped / 0 fail`
- P0/P1 矩阵：7 个 spec、38 条用例；首轮暴露 4 条过时合同/真实导出问题，逐条修复并定向复跑全绿。
- 产品修复：剪映导出仅接受视频类节点；`data:` / `blob:` URL 不再泄漏为文件名。
- E2E 合同修复：生图内部 3 次尝试穷尽后才进入用户手动重试；依赖任务保持 queued；导出数量与 ready shot 数量一致。
- Final focused browser rerun：生产失败重试 `1 passed (13.0s)`；Shot Planning -> Run Queue -> Jianying ZIP `1 passed (57.1s)`。
- 错误账本：`EL-069` ~ `EL-072`。

## 2026-07-11 Task 1 真实主链验收

- 固定 BASE_URL：`http://127.0.0.1:3100`
- Server：fresh `next build --webpack` + `next start`；`/api/ai/config` 200，约 `0.264s`
- Provider dry-run：text / image / video / browser TTS ready；server TTS warning，浏览器 TTS 可兜底
- 真实 Auto Agent -> Project Bible：`1 passed (1.4m)`
- 真实生图 -> 画布节点 + 资产库：`1 passed (2.2m)`
- 真实 Vidu：`provider-smoke/run waitForResult=true` 返回 passed；最终 URL 可读，HTTP 206、`video/mp4`、首段 1024 bytes
- 视频任务轮询/本地持久化单测：`16/16` 通过
- Auto Agent 创意 -> 生产完成 -> 剪映 ZIP：`1 passed (1.5m)`
- 完成产物 -> 项目包 -> 新画布恢复：`1 passed (1.9m)`
- 本轮测试修复：长链总 timeout 95s -> 240s；mock 前端短路后改验 `generatedImageNodeId -> ai-generated-image` 产物关联
- 环境结论：长驻 webpack dev server 会出现高 CPU/内存编译卡顿；发布验收改用 fresh production build，详见 `EL-067`、`EL-068`
- Fresh verification：production build 通过；typecheck exit 0；full lint exit 0（80 个既有 warnings）；定向 Node `16/16`；`git diff --check` 通过

## 2026-07-07 当前正式自用最小验收

> ponytail: 先验最短真主链；长链/批量链单独验，避免把 provider 波动误判成产品主链失效。

### 先看哪两份事实源
- `docs/reference/current-capability-map.md`
- `docs/reference/error-ledger.md`

### 先确认环境就绪
- [ ] 打开 `/api/ai/config`
- [ ] 确认 `hasApiKey=true`
- [ ] 确认 `defaultModel` / `defaultImageModel` / `videoModel` 都有值

### 最快机检命令
- [ ] `pnpm --dir /Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas --filter web typecheck`
- [ ] `curl -sS -X POST 'http://127.0.0.1:<port>/api/ai/provider-smoke/run' -H 'Content-Type: application/json' --data '{"target":"image","confirmCost":true,"confirmationText":"RUN_IMAGE_SMOKE"}'`

### 现在就能自用的 10 步
1. [ ] 新建项目并进入 Canvas
2. [ ] 用一句话走 Auto Agent，生成 Project Bible / 分镜骨架
3. [ ] 打开 Shot Planning，生成 planning items，并至少把 1 条镜头加入 production queue
4. [ ] 确认 production queue 会真实露出当前 provider 阻塞原因，且能打开设置面板，不是静默失败；若当前已提供匹配的 provider 会话 Key，则保存设置后应收口到 `0 阻塞`，开始按钮恢复为 `一键开始生产`，点击后应出现 `生产任务执行中 / 运行中`，并看到 `🖼️ 准备中...` 或 `🖼️ n/n 生成中...`
5. [ ] 用短 prompt 跑一次 dedicated 真实生图 smoke，确认图片自动回写到画布和资产库；不要把这一步默认绑进第 4 步的 `Project Bible -> queue-start` 基线 smoke
6. [ ] 如果长中文创意生图失败，确认出现 `概念图待重试 Prompt` 节点
7. [ ] 对该 prompt 节点执行“运行当前节点”，确认补出 `ai-generated-image` 结果节点
8. [ ] 对图片节点执行 reverse-prompt，确认 prompt 节点落画布并进入资产库
9. [ ] 导出项目包，重新导入恢复
10. [ ] 导出剪映 ZIP 交接包

### 当前不要误判为“已稳定”的 3 件事
- [ ] 不把长中文创意 prompt 的单次 `524` 当成产品主链失效；当前设计是退化到可重试 prompt
- [ ] 不把 mock E2E 当成真实 provider 稳定性证明
- [ ] 不把剪映 JSON/ZIP 交接包当成最终成片导出

### 对应硬证据
- `Project Bible -> queue-start` 基线 smoke：
  - `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`
- dedicated 真实 UI 生图自动回写：
  - `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`
- 真生图失败后 fallback prompt 再补图：
  - `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`
- Auto Agent 文本/澄清/Project Bible 主链：
  - `apps/web/e2e/auto-agent-clarification.spec.ts`
  - `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`
- reverse-prompt 资产闭环：
  - `apps/web/e2e/image-node-reverse-prompt.spec.ts`
  - `apps/web/e2e/reverse-prompt-asset-library-roundtrip.spec.ts`
- 项目包恢复 / 恢复后再消费 / 剪映交接包：
  - `apps/web/src/app/canvas/utils/projectPackageExport.test.ts`
  - `apps/web/src/app/canvas/utils/projectPackageImport.test.ts`
  - `apps/web/src/app/canvas/components/panels/exportPreflightCheck.test.ts`
  - `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`
  - `apps/web/e2e/project-package-roundtrip.spec.ts`（项目包导入、图片再生视频、视频再抽帧/分析、音频进剪映 ZIP）
  - `apps/web/src/app/canvas/utils/jianyingDraftExport.package.test.ts`
  - `apps/web/e2e/production-run-jianying-export.spec.ts`（剪映 ZIP 下载、preflight 文件名风险提示、修正后产物一致）

### 这份最小验收单的使用原则
- [ ] 先跑这 10 步，再决定要不要继续做长链验收
- [ ] 阻断自用的才算 P0；非阻断波动先记入 `error-ledger.md`
- [ ] 每修完一个自用阻断项，只补 1 条最小证据，不重复堆长链 E2E

## 2026-07-09 分层正式验收矩阵

> 目标：后续验收只按这张表执行，不再临时重选题。
> 顺序：先 P0，再 P1，最后 P2。
> 失败处理：先查 `docs/reference/error-ledger.md`，命中旧案例就复用旧根因。

### P0 — 阻断“正式自用 / 交接”的主链

| 链路 | 通过硬标准 | 自动证据 | 常见误判 / 对应 EL |
|------|------------|----------|---------------------|
| Auto Agent 一句话创作主入口 | 一句话输入后，能走澄清 / 生成 Project Bible 或 storyboard 结构；刷新后可恢复继续 | `apps/web/e2e/auto-agent-clarification.spec.ts`, `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/chat-clarification-resume.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts` | `EL-017`, `EL-018`, `EL-041` |
| Production queue readiness / 启动 | 若 provider 缺项，要显式显示首条阻塞原因 + 设置入口；若配置完整，须收口到 `0 阻塞`，点击后进入 `运行中` | `apps/web/e2e/production-run-queue.spec.ts`, `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/provider-health-summary.spec.ts` | `EL-030`, `EL-044`, `EL-045`, `EL-046`, `EL-057` |
| 首张分镜图真实回写 | `shot.generatedImageAssetId/generatedImageNodeId` 存在；对应 `ai-generated-image` 节点存在；资产库计数增长 | `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.test.ts` | `EL-021`, `EL-049`, `EL-050`, `EL-057` |
| 项目包 roundtrip + 恢复后再执行 | 导入后节点/边/视口恢复；恢复后的 `image-result -> video-generation` 可再次运行；恢复后再生产得到的 `shot.generatedImage*` 导出不丢；内联资产 bytes 能随项目包恢复为可消费 URL | `apps/web/e2e/project-package-import.spec.ts`, `apps/web/e2e/project-package-roundtrip.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/src/app/canvas/utils/projectPackageExport.test.ts`, `apps/web/src/app/canvas/utils/projectPackageImport.test.ts` | `EL-026`, `EL-027`, `EL-028`, `EL-051`, `EL-058` |
| 剪映交接包导出 / 超限浏览器合成降级 | 能拿到 JSON/ZIP 兼容交接包；项目包恢复后还能再次导出；浏览器合成超限节点可直接打开 ZIP 预检；文件名风险提示与 ZIP 修正产物一致 | `apps/web/e2e/jianying-export.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/e2e/browser-video-composition.spec.ts` | `EL-024`, `EL-025`, `EL-026`, `EL-028`, `EL-039`, `EL-040`, `EL-041`, `EL-063`, `EL-082` |
| reverse-prompt 资产闭环 | 图片 -> prompt 节点 -> 资产库；刷新恢复；从资产库再拖回画布再消费 | `apps/web/e2e/image-node-reverse-prompt.spec.ts`, `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`, `apps/web/e2e/reverse-prompt-asset-library-roundtrip.spec.ts` | `EL-007`, `EL-031` |

### P1 — 重要闭环，挂了不该阻断最小自用，但会伤体验

| 链路 | 通过硬标准 | 自动证据 | 常见误判 / 对应 EL |
|------|------------|----------|---------------------|
| Provider health / smoke | 设置页能给出 `ready / blocked / warning`；显式授权 smoke 可回写画布 / 资产库 | `apps/web/e2e/provider-health-summary.spec.ts`, `apps/web/src/lib/ai/providerSmoke.test.ts`, `apps/web/src/app/api/ai/provider-smoke/run-core.test.ts` | `EL-006`, `EL-013`, `EL-030` |
| 角色三视图生成 / 恢复 / 下游消费 | `front/side/back` 生成成功；刷新后仍可见；可进入 `Shot Planning -> create queue` | `apps/web/e2e/character-view-modal.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/src/app/canvas/hooks/useCanvasPersistence.test.ts` | `EL-052`, `EL-053`, `EL-054`, `EL-055` |
| Shot Planning -> Run Queue bridge | ready shot 可转执行队列；桥接后可启动 / 清空 / 继续导出交接包 | `apps/web/e2e/shot-planning-board.spec.ts`, `apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts` | `EL-022`, `EL-023`, `EL-029`, `EL-030` |
| 真实视频分析链 | 真实上传视频后能抽帧 / 分析 / 生成下游分镜草稿；导出导入后可再次运行 | `apps/web/e2e/real-video-workflow.spec.ts` | 参考 `EL-026` 的“不要把 roundtrip 和其它长链绑一起”原则 |
| 本地媒体桥接到 provider 输入 | `upscale / focus-edit / talking-photo` 会优先吃 provider 可读媒体；本地音频也能桥接 | `apps/web/e2e/upscale-provider-media-bridge.spec.ts`, `apps/web/e2e/focus-edit-provider-media-bridge.spec.ts`, `apps/web/e2e/talking-photo-provider-media-bridge.spec.ts`, `apps/web/src/app/canvas/utils/providerMediaDataUrl.test.ts` | `EL-009`, `EL-010`, `EL-011`, `EL-031`, `EL-032` |
| fallback prompt 再补图 | 真生图失败后出现 `概念图待重试 Prompt`；点“运行当前节点”能补出图片结果节点 | `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/src/app/canvas/utils/autoAgentService.real.test.ts` | `EL-035`, `EL-038` |
| 结构化导出 | storyboard CSV / screenplay markdown / character CSV 可下载 | `apps/web/e2e/structured-export-downloads.spec.ts`, `apps/web/src/lib/storyboard/storyboardExportFormats.test.ts` | 避免把结构化导出误报成“最终成片已完成” |

### P2 — 补强体验 / 降低误判

| 链路 | 通过硬标准 | 自动证据 | 常见误判 / 对应 EL |
|------|------------|----------|---------------------|
| 参考视频统一入口 | 空画布和主工作流都能从统一入口进“参考视频分析” | `apps/web/e2e/create-flow.spec.ts`, `apps/web/e2e/demo-screenshots.spec.ts` | 旧双入口认知漂移；以 `current-capability-map.md` 为准 |
| remix analysis 派生 | `remix-analysis` 可派生 prompt / storyboard / queue / CSV | `apps/web/e2e/remix-analysis-derivation.spec.ts`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.test.ts` | `EL-001`, `EL-002`, `EL-008` |
| 画布基础交互 | 小地图、quick add、项目隔离、首页/仪表盘进入画布、文本保存恢复 | `apps/web/e2e/canvas-minimap.spec.ts`, `apps/web/e2e/canvas-quick-add-node-search.spec.ts`, `apps/web/e2e/project-canvas-isolation.spec.ts`, `apps/web/e2e/core-workflow-smoke.spec.ts` | `EL-003`, `EL-004`, `EL-005`, `EL-012`, `EL-015`, `EL-016` |

### 失败回写规则

1. 先执行：`rg -n "<症状关键词>|<spec 文件名>" docs/reference/error-ledger.md`
2. 若命中旧案例：
   - 先按旧根因排
   - 若只是复发，更新日期 / 次数 / 新证据
3. 若没命中：
   - 直接在 `docs/reference/error-ledger.md` 追加新条目
   - 模板固定为：

```md
## EL-0xx 标题
- 日期：YYYY-MM-DD
- 症状：
- 根因：
- 处理：
- 防复发：`spec/test/file`
```

### 推荐机检顺序

1. `pnpm --dir /Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas --filter web typecheck`
2. `pnpm --dir /Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas --filter web test`
3. `pnpm --dir /Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas --filter web lint`
4. P0 定向 E2E
5. P1 / P2 只跑本轮 touched 链路，避免重复烧长链

### 推荐判定规则

- P0 全绿 + 本轮 touched 的 P1 不红 → 可继续正式自用
- 任一 P0 红 → 不宣称“正式可用”
- P1 / P2 红但 P0 全绿 → 记台账，别把非阻断波动夸大成主链失效

### 2026-07-09 P0 当前验收快照

> 口径：基于当前 `current-capability-map.md` 已记录硬证据 + 本轮 fresh `typecheck`。
> 不是“今天全量 fresh 重跑全部 P0 E2E”；未重跑项保持诚实标注。

| P0 链路 | 当前判断 | 最新硬证据 | 当前仍需注意 |
|---------|----------|------------|--------------|
| Auto Agent 一句话创作主入口 | `fresh 通过（2026-07-09, 1 passed / 1.2m）` | `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/auto-agent-clarification.spec.ts`, `apps/web/e2e/chat-clarification-resume.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts` | 长中文创意 prompt 仍可能遇上游 `524`；当前正确口径是 fallback prompt 可重试，不是假装长链稳定 |
| Production queue readiness / 启动 | `fresh 通过（2026-07-10, 1 passed / 11.4s）` | `apps/web/e2e/production-run-queue.spec.ts`, `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/provider-health-summary.spec.ts` | 主链路验证 `4/4 完成`，并覆盖视频节点、配音节点、字幕节点、分镜首图回写；若卡在 `2/4`，优先检查 `useProductionRunExecutor` 的同步执行状态 ref 和 TTS backend seed |
| 首张分镜图真实回写 | `fresh 通过（2026-07-09, 1 passed / 1.0m）` | `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.test.ts` | `generate-storyboard-image` 队列入口现已补 `requestId + 外层 retryWithBackoff`；同机 fresh real queue smoke 已再次证明 `shot.generatedImage* + ai-generated-image + asset library` 会一起落地 |
| 项目包 roundtrip + 恢复后再执行 | `fresh 补强通过（2026-07-10, unit 10 passed）` | `apps/web/e2e/project-package-import.spec.ts`, `apps/web/e2e/project-package-roundtrip.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/src/app/canvas/utils/projectPackageExport.test.ts`, `apps/web/src/app/canvas/utils/projectPackageImport.test.ts` | 当前已支持项目包携带已有 `data:image/video/audio` bytes 并在导入后恢复为可消费 URL；仍不承诺找回未被导入包携带的另一台机器本地 IndexedDB 素材 |
| 剪映交接包导出 / 浏览器视频合成 | `通过（JSON/ZIP 兼容交接包 + 单/双片段、WAV、字幕 MP4）` | `apps/web/e2e/jianying-export.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/e2e/browser-video-composition.spec.ts` | 浏览器已验证真实一段/两段 WebM、WAV、字幕及其同次合成 -> MP4 下载；总输入超过 64MB 会在下载 wasm 前转到可点击的剪映 ZIP 预检。PDF / Excel、长片段/大素材性能仍无同等级证据 |
| reverse-prompt 资产闭环 | `fresh 通过（2026-07-09, 1 passed / 50.3s）` | `apps/web/e2e/image-node-reverse-prompt.spec.ts`, `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`, `apps/web/e2e/reverse-prompt-asset-library-roundtrip.spec.ts` | 仍应优先复用共享媒体桥接层，别在新入口再手搓 URL 选择顺序 |

### 2026-07-09 本轮 fresh 机检

- `npx -y pnpm@10.33.0 --filter web typecheck` → 通过
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' STARCANVAS_REAL_PROVIDER_AUTO_AGENT_UI_SMOKE=1 npx -y pnpm@10.33.0 --filter web exec playwright test e2e/auto-agent-real-provider-project-bible.spec.ts --project=chromium --grep "real provider UI smoke can bootstrap a project bible from one sentence" --reporter=line` → `1 passed (1.2m)`
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' STARCANVAS_REAL_PROVIDER_AUTO_AGENT_IMAGE_UI_SMOKE=1 npx -y pnpm@10.33.0 --filter web exec playwright test e2e/auto-agent-real-provider-project-bible.spec.ts --project=chromium --grep "real provider UI smoke can generate an image and auto-write it into canvas + asset library" --reporter=line` → `1 passed (3.7m)`
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE=1 npx -y pnpm@10.33.0 --filter web exec playwright test e2e/auto-agent-real-provider-project-bible.spec.ts --project=chromium --grep "real provider queue smoke writes first storyboard image back into shot node + asset library" --reporter=line` → 历史上曾出现 3 类失败：无 session key 时开始按钮 disabled；Aliyun key 时 `INVALID_API_KEY`；`copse` key 时 `fetch failed`
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE=1 STARCANVAS_REAL_PROVIDER_SESSION_API_KEY=<copse key> STARCANVAS_REAL_PROVIDER_OVERRIDE_BASE_URL='https://copse.top' STARCANVAS_REAL_PROVIDER_OVERRIDE_IMAGE_MODEL='gpt-image-2' npx -y pnpm@10.33.0 --filter web exec playwright test e2e/auto-agent-real-provider-project-bible.spec.ts --project=chromium --grep "real provider queue smoke writes first storyboard image back into shot node + asset library" --reporter=line` → `1 passed (1.0m)`
- `NODE_OPTIONS='' node --test --experimental-strip-types apps/web/src/lib/ai/providerSessionScope.test.ts apps/web/src/lib/ai/provider-health-summary.test.ts` → `11 passed`
- `npx -y pnpm@10.33.0 --filter web typecheck` → `通过`
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE=1 STARCANVAS_REAL_PROVIDER_SESSION_API_KEY=<copse key> STARCANVAS_REAL_PROVIDER_OVERRIDE_BASE_URL='https://copse.top' STARCANVAS_REAL_PROVIDER_OVERRIDE_IMAGE_MODEL='gpt-image-2' npx -y pnpm@10.33.0 --filter web exec playwright test e2e/auto-agent-real-provider-project-bible.spec.ts --project=chromium --grep "real provider queue smoke writes first storyboard image back into shot node + asset library" --reporter=line` → `1 passed (1.3m)`（session key 限域改动后 fresh 回归）
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx -y pnpm@10.33.0 --filter web exec playwright test e2e/reverse-prompt-asset-library-roundtrip.spec.ts --project=chromium --reporter=line` → `1 passed (50.3s)`
- `STARCANVAS_E2E_BASE_URL='http://127.0.0.1:3172' STARCANVAS_E2E_DISABLE_VIDEO=1 STARCANVAS_E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx -y pnpm@10.33.0 --filter web exec playwright test e2e/project-package-roundtrip.spec.ts --project=chromium --reporter=line` → `2 passed (3.8m)`
- `git diff --check -- docs/QA_CHECKLIST.md docs/reference/current-capability-map.md docs/reference/error-ledger.md` → 通过

---

## Dashboard

- [ ] 打开 Dashboard 页面（`/dashboard`）
- [ ] 点击「新建项目」按钮，弹出创建对话框
- [ ] 输入项目名称，点击确认
- [ ] 项目卡片出现在 Dashboard 列表中
- [ ] 点击项目卡片，跳转到 Canvas 页面
- [ ] Canvas URL 中的 `projectId` 与 Dashboard 中创建的一致
- [ ] 空名称创建项目，默认使用「未命名项目」
- [ ] 刷新 Dashboard，项目列表保持不变
- [ ] 删除项目后，列表更新

---

## Canvas — 节点操作

- [ ] 进入空画布，显示「开始创作」引导界面
- [ ] 引导界面三个入口均可点击：
  - [ ] 导入剧本 / AI 分析
  - [ ] 空白写作
  - [ ] 上传参考图
- [ ] 右键画布空白区域，弹出节点菜单
- [ ] 添加一个文本节点到画布
- [ ] 节点显示在画布中心位置
- [ ] 点击节点，节点高亮（选中态）
- [ ] 编辑节点文本内容
- [ ] 文本保存后点击画布空白退出编辑
- [ ] 拖拽节点到新位置
- [ ] 选中节点按 `Delete` 键删除
- [ ] 节点从画布消失

---

## Canvas — 撤销/重做

- [ ] 添加一个节点
- [ ] 按 `Ctrl+Z` 撤销添加，节点消失
- [ ] 按 `Ctrl+Y` 或 `Shift+Z` 重做，节点恢复
- [ ] 移动节点位置，撤销/重做位置变更
- [ ] 编辑节点文本，撤销/重做文本变更

---

## Canvas — 保存/刷新/恢复

- [ ] 添加文本节点并编辑唯一内容
- [ ] 等待 6 秒以上（自动保存触发）
- [ ] 刷新浏览器页面
- [ ] canvas 恢复，URL 中 `projectId` 不变
- [ ] 之前添加的节点和内容完整恢复
- [ ] 删除节点，等待自动保存
- [ ] 再次刷新，节点不再出现

---

## Chat 面板

- [ ] 右侧 Chat 面板默认打开
- [ ] 可以正常发送文本消息
- [ ] 返回的消息中文显示正常（无乱码）
- [ ] 可以上传附件（图片等）
- [ ] 附件显示缩略图
- [ ] 上传无效文件时有错误提示
- [ ] 检查 Console 无 `[USAGE]` 乱码日志
- [ ] AI provider 未配置时显示合理提示（不崩溃）
- [ ] 可以关闭 Chat 面板

---

## Settings

- [ ] 打开 Settings 面板
- [ ] 查看当前 provider 配置列表
- [ ] 添加新的 API Key
- [ ] API Key 保存后可以正常使用
- [ ] 清除 API Key，确认清除成功
- [ ] 输入无效值或有错误提示（不静默吞错）
- [ ] 切换不同 provider
- [ ] 关闭 Settings 面板

---

## Timeline

- [ ] 默认状态时间轴是折叠的
- [ ] 底部显示「⌃ 时间轴」展开按钮
- [ ] 点击展开按钮或时间轴控制条，时间轴展开
- [ ] 时间轴展开后面板完整可见（不被裁切）
- [ ] 时间轴显示视频轨 / 音频轨 / 字幕轨
- [ ] 点击播放按钮，播放头开始移动
- [ ] 点击暂停按钮，播放头停止
- [ ] 点击时间轴空区域 seek 到指定时间
- [ ] 如果有素材，时间轴上显示对应片段
- [ ] 时间轴折叠/展开切换流畅

---

## Provider 配置

- [ ] 在 `.env.local` 中配置 AI 服务
- [ ] provider-registry 正确读取配置
- [ ] API 路由使用 provider registry 而非 process.env 直读
- [ ] 支持多个 provider 同时配置
- [ ] 切换 provider 后服务正常

---

## 安全检查

- [ ] `git grep "sk-"` 仅测试文件中有占位值
- [ ] `git grep "NEXT_PUBLIC_"` 不包含 API Key 类环境变量
- [ ] `.env.local` 在 `.gitignore` 中（不被提交）
- [ ] API Key 不出现在客户端 bundle（浏览器 DevTools → Sources 搜索）
- [ ] 错误日志不打印完整的 API Key
- [ ] IndexedDB / localStorage 无明文存储敏感 token

---

## 控制台/错误监控

- [ ] 打开 Canvas 页面，Console 无红色错误
- [ ] 操作节点（创建/编辑/删除），Console 无新增错误
- [ ] Network 面板无 500 错误
- [ ] 刷新页面后无未捕获的异常

---

## 版本信息

| 项目 | 值 |
|------|-----|
| 验收日期 | ____年__月__日 |
| 验收版本 | v0.1.0-rc.1 |
| 验收人 | ___________ |
| 环境 | [ ] 本地 dev / [ ] 本地 prod / [ ] staging |
| 结果 | [ ] 通过 / [ ] 部分通过 / [ ] 未通过 |

---

## 备注
