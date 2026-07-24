# ARCHIVE — 2026-06-11 历史地毯式审计快照

> 警告: 本文档是阶段性审计结果，不是当前主仓的唯一能力事实源。
> 当前能力事实请先看: `docs/reference/current-capability-map.md`
> 使用规则: 如本文结论与当前代码、当前测试、`current-capability-map.md` 冲突，一律以后者为准。

# StarCanvas 地毯式审计报告

> 审计日期：2026-06-11  
> 审计分支：main  
> 审计范围：apps/web/src/app/canvas/ 全部组件/API/Store/Hooks/Utils/Packages

---

## 一、总体摘要

| 类别 | 发现数 | 严重程度 |
|------|--------|----------|
| 未接入的组件 | 12 个 | 🔴 高 |
| 未使用的 Utils | 9 个 | 🟡 中 |
| 未使用的 Hooks | 1 个 | 🟡 中 |
| 未调用的 API 路由 | 8 个 | 🔴 高 |
| 未使用的 Packages | 4 个包 | 🔴 高 |
| 未合并的分支代码 | 418 个文件差异 | 🔴 高 |
| TODO/未完成标记 | 2 处 | 🟢 低 |
| 导出未导入的模块 | 多个组件 | 🟡 中 |

---

## 二、组件审计 — 未在 StarCanvas.tsx 中渲染的组件

### 2.1 完全未被引用（12 个）

以下组件在任何地方都没有被 import/使用：

| # | 文件路径 | 状态 | 潜在价值 | 建议 |
|---|---------|------|---------|------|
| 1 | `canvas/BackgroundRemoverPanel.tsx` | 🔴 未接入 | AI 图片背景移除面板，可提供一键去背功能 | 接入到 ImageNode 的工具栏中 |
| 2 | `canvas/CanvasDiagnosticsPanel.tsx` | 🔴 未接入 | 画布运行诊断面板，用于调试节点状态/性能 | 接入到调试模式或设置面板中 |
| 3 | `canvas/PortHandle.tsx` | 🔴 未接入 | 自定义节点连接点 UI 组件 | 集成到节点系统中作为连接手柄 |
| 4 | `nodes/AngleControlPanel.tsx` | 🔴 未接入 | 摄像机角度控制面板 | 接入到 ShotNode 或 CinematicParamPanel |
| 5 | `nodes/AudioWaveform.tsx` | 🔴 未接入 | 音频波形可视化组件 | 接入到 VideoNode 或语音相关面板 |
| 6 | `nodes/BgmPanel.tsx` | 🔴 未接入 | BGM 背景音乐选择/生成面板 | 接入到 VideoNode 或 TimelinePanel |
| 7 | `nodes/CinemaLabPanel.tsx` | 🔴 未接入 | 电影实验室面板（调节滤镜/风格） | 接入到 ImageNode 或 ColorGradePanel |
| 8 | `nodes/PoseEditor.tsx` | 🔴 未接入 | 姿势编辑器（角色骨骼/姿势调整） | 接入到 CharacterAssetLibraryPanel |
| 9 | `nodes/TransitionPicker.tsx` | 🔴 未接入 | 转场效果选择器 | 接入到 ShotNode 之间作为转场配置 |
| 10 | `panels/ChainGeneratePanel.tsx` | 🔴 未接入 | 链式生成面板（串联多个生成步骤） | 接入到 LeftToolbar 或专用触发入口 |
| 11 | `panels/ParamControlPanel.tsx` | 🔴 未接入 | 参数控制面板（集中控制节点参数） | 接入到 PropertyPanel 集成 |
| 12 | `panels/StoryboardShotEditorPanel.tsx` | 🔴 未接入 | 分镜镜头编辑器（含 ideogram 生成） | 接入到 StoryboardGridNode 双击编辑 |

### 2.2 间接使用（已通过子组件接入，无需处理）

以下组件虽然未在 StarCanvas.tsx 中直接 import，但通过其他已接入的组件间接使用，属于正常情况：

| 组件 | 由谁接入 | 
|------|---------|
| `canvas/FocusEditPanel` | CharacterAssetLibraryPanel（动态加载） |
| `canvas/PoseReferenceEditor` | CharacterAssetLibraryPanel |
| `chat/AssetPreviewPopover` | ChatPanel |
| `chat/ChatAttachmentPreview` | ChatInput→ChatPanel |
| `chat/ChatInput` | ChatPanel |
| `chat/SlashCommandMenu` | ChatInput→ChatPanel |
| `menus/InlineSlashCommandMenu` | ContentNode, ShotNode |
| `nodes/FocusEditPanel` | CharacterAssetLibraryPanel（动态加载 canvas 版本） |
| `nodes/NodeRunStatusIndicator` | ContentNode, ImageNode |
| `nodes/VoicePanel` | ShotNode |
| `workflow/WorkflowRunNodeRow` | WorkflowRunPanel |
| `panels/VideoAnalysisPreview` | NodeHistoryPanel |

---

## 三、API 路由审计 — 前端未调用的路由

### 3.1 完全未被调用的路由（8 个）

以下 API 路由的前端调用代码本身也是死代码：

| # | 路由 | 调用方 | 调用方状态 | 建议 |
|---|------|--------|-----------|------|
| 1 | `/api/ai/camera-control` | `newWorkflowServices.ts` | 当前主流程已切到参考视频逆向分镜，旧 remix util 不再是主入口 | 迁移到真实镜头/机位工作流，或清理旧 util |
| 2 | `/api/ai/generate-image-ideogram` | `StoryboardShotEditorPanel` | 该组件未接入 | 接入 StoryboardShotEditorPanel 后自动解决 |
| 3 | `/api/ai/generate-poster` | `newWorkflowServices.ts` | 可见入口已收敛为“海报提示词”，避免误导为直接出图；底层接口待接入真实海报生成闭环 | 接入海报生成到 ExportDropdown 或保留为提示词节点 |
| 4 | `/api/ai/generate-video` | `useChainVideoGeneration.ts` | 该 hook 完全未被使用 | 接入链式视频生成或移除此路由 |
| 5 | `/api/ai/generate-video-vidu` | `videoGenerationService.ts` | useWorkflowRunner 默认走 Vidu；Seedance/Kling/Runway 未接线时已改为明确报错，不再静默 mock 成功 | 继续增强 Vidu 配置和错误提示 |
| 6 | `/api/ai/reverse-prompt` | **无** | Slash 可见入口已撤下，底层工具待接入 ImageNode 右键菜单 | 接入到 ImageNode 的"反推提示词"功能，或移除 |
| 7 | `/api/ai/remix-analysis` | `newWorkflowServices.ts` | 旧 VideoRemixPanel 已删除，可见入口已撤下，底层分析能力待并入参考视频逆向分镜 | 并入参考视频分析链路，或移除旧接口 |
| 8 | `/api/ai/talking-photo` | `newWorkflowServices.ts` | 可见入口已撤下，API 保留 not_ready 合同和部署指南 | 接入照片说话功能后再恢复入口，或移除旧链路 |

### 3.2 正常使用的路由

以下路由已被正确调用：`chat`, `chat/stream`, `config`, `crew/run`, `bible-director`, `generate-character-view`, `generate-image`, `generate-moodboard`, `generate-panorama`, `generate-with-pose`, `health`, `focus-edit`, `tts`, `upscale`

---

## 四、Store 审计

所有 Store 均已被使用：

| Store | 引用数 | 状态 |
|-------|--------|------|
| `canvasStore` | 2 (StarCanvas) | ✅ 正常 |
| `useCanvasSnapshotStore` | 5 | ✅ 正常 |
| `useRunHistoryStore` | 12 | ✅ 正常 |
| `useWorkspaceHistoryStore` | 4 | ✅ 正常 |

Stores barrel export (`index.ts`) 已正确导出所有 4 个 store。

---

## 五、Hooks 审计

### 5.1 未使用的 Hook（1 个）

| # | Hook | 状态 | 潜在价值 | 建议 |
|---|------|------|---------|------|
| 1 | `useChainVideoGeneration.ts` | 🔴 未使用 | 链式视频生成（多步骤自动串联） | 接入到 ChainGeneratePanel 或 WorkflowRunner |

### 5.2 间接使用（通过子组件）

以下 hooks 虽未直接在 StarCanvas.tsx 中使用，但通过子组件间接调用，属于正常：

| Hook | 使用者 |
|------|--------|
| `useChatSSE` | ChatPanel |
| `useNodeRunHistory` | NodeHistoryPanel, SourceTracePanel |
| `useAiConfig` | SettingsPanel |

### 5.3 直接使用

以下 hooks 由 StarCanvas.tsx 直接使用：`useCanvasStore`, `useCanvasDropUpload`, `useCanvasPersistence`, `useChatAttachments`, `useHistoryDrop`, `useProductionRunExecutor`, `useWorkflowRunner`, `useWorkflowTemplates`

---

## 六、Utils 工具函数审计

### 6.1 完全未被使用的 Utils（9 个）

| # | 文件 | 说明 | 建议 |
|---|------|------|------|
| 1 | `autoAgentService.ts` | 自动 Agent 服务 | 若不需要则移除 |
| 2 | `bible-context.ts` | Bible 数据 AI 上下文构建 | 接入到 Bible 面板的 AI 上下文注入 |
| 3 | `characterAstrologyService.ts` | 紫微斗数角色设计引擎 | 接入到 CharacterBiblePanel 增强角色设计 |
| 4 | `imagePromptReverser.ts` | 从图片反推提示词 | 接入到 ImageNode 右键菜单 |
| 5 | `stalePropagation.ts` | Stale 状态传播 | 接入到 NodeRunStatusIndicator |
| 6 | `video-metadata.ts` | 视频元数据提取 | 接入到 VideoNode 上传时自动读取 |
| 7 | `canvasSnapshotSanitizer.ts` | Canvas 快照清理 | 接入到 CanvasPersistence（测试文件存在但 util 未使用） |
| 8 | `galleryComposer.ts` | 画廊组合工具 | 接入到导出功能 |
| 9 | `run-stage-titles.ts` | 运行阶段标题 | 接入到 WorkflowRunPanel 显示进度 |

### 6.2 已使用的 Utils

以下 utils 已被正确引用（1+ 次）：`bgmGenerator`, `build-node-execution-context`, `canvasIndexedDB`, `canvasPersistence`, `canvasPositionUtils`, `canvasVisibilityUtils`, `continuityGuard`, `dagre-layout`, `execution-plan`, `fileParser`, `generateId`, `graph-traversal`, `handle-role-resolver`, `history-safety`, `imageGeneration`, `jianyingDraftExport`, `mock-video-analyzer`, `moodboardService`, `newWorkflowServices`, `node-run-history`, `nodeRunMeta`, `storyboardGridComposer`, `storyboardParser`, `toDataUrl`, `ttsService`, `videoCompositionBrowser`, `videoGenerationService`, `videoWorkflowTemplate`, `workflow-run-reducer`

---

## 七、Packages/ Monorepo 审计

### 7.1 严重：4 个共享包完全未被 apps/web 使用

| 包名 | 路径 | 内容 | 状态 |
|------|------|------|------|
| `@creative-canvas/shared` | `packages/shared/` | CanvasNodeType 枚举, BillingMode 枚举 | 🔴 仅被 packages 内部引用 |
| `@creative-canvas/canvas` | `packages/canvas/` | 分镜/运镜 Prompt 分析管线 | 🔴 仅被 packages 内部引用 |
| `@creative-canvas/providers` | `packages/providers/` | AI Provider 抽象接口 | 🔴 仅被 packages 内部引用 |
| `@creative-canvas/billing` | `packages/billing/` | 计费/用量接口 | 🔴 仅被 packages 内部引用 |

**关键问题**：`apps/web/package.json` 中虽然声明了 `"@creative-canvas/canvas": "workspace:*"` 依赖，但实际源码中仅在一个注释中引用了它。这 4 个包是独立的业务逻辑层（Provider 抽象、计费系统、分镜分析管线），但从未被前端 UI 代码使用。

**建议**：
- 如果需要 Provider 抽象层和计费系统，应将其接入到 AI 调用链路中
- 如果不需要，应从 monorepo 中移除这些包以简化项目

---

## 八、Git 分支审计

### 8.1 分支概览

| 分支 | 状态 | 与 main 差异文件数 |
|------|------|-------------------|
| `main` (HEAD) | ✅ 当前 | - |
| `origin/master` | 🔴 未合并 | 418 个文件 |
| `origin/starcanvas-ai-film-workflow-20260608` | 🟡 部分合并 | 大量重叠 |
| `origin/starcanvas-pr1-safe-sync-20260608` | 🟡 PR 分支 | 与 workflow 类似 |

### 8.2 master 分支上未合并的关键内容

`master` 分支比 `main` 多出 418 个文件，主要包括：

1. **完整后端 API 服务** (`apps/api/`)：包含 NestJS 后端，模块包括：
   - `auth` - 用户认证
   - `organizations` - 组织管理
   - `projects` - 项目管理
   - `assets` - 资产管理
   - `canvas` - 画布持久化
   - `generation` - AI 生成管理
   - `providers` - AI Provider 管理
   - `usage` - 用量计费
   - Prisma 数据库 Schema

2. **PLAN.md** - 项目计划文档

3. **大量前后端集成代码**

**建议**：决定是否需要将 master 分支的后端代码合并到 main。这是当前项目最大的代码碎片。

---

## 九、TODO/FIXME/HACK 标记

| # | 文件 | 行号 | 内容 | 建议 |
|---|------|------|------|------|
| 1 | `utils/videoGenerationService.ts` | - | Seedance/Kling/Runway 真实请求未接线 | 已禁止静默 fallback mock；后续接入真实后端或从可选项移除 |
| 2 | `StarCanvas.tsx` | 7744 | `TODO: 接入真实登录` | 接入 master 分支的 auth 模块 |

---

## 十、导出但未 import 的模块

以下组件/模块有 `export` 声明但完全未被任何文件引用（与第二节重复，此处汇总）：

**节点类**：`AngleControlPanel`, `AudioWaveform`, `BgmPanel`, `CinemaLabPanel`, `PoseEditor`, `TransitionPicker`  
**面板类**：`BackgroundRemoverPanel`, `CanvasDiagnosticsPanel`, `ChainGeneratePanel`, `ParamControlPanel`, `StoryboardShotEditorPanel`  
**工具类**：`PortHandle`

---

## 十一、优先行动建议

### 紧急（P0）

1. **决策 master 分支合并策略**：master 分支的 418 个文件包含完整后端是最严重的碎片
2. **接入或移除 packages/ 目录**：4 个 @creative-canvas/* 包完全未被前端使用

### 高优先级（P1）

3. **接入 12 个未使用的组件**：尤其是 `StoryboardShotEditorPanel`（分镜编辑）、`ChainGeneratePanel`（链式生成）、`BackgroundRemoverPanel`（AI 去背）
4. **清理或接入 8 个未被调用的 API 路由**

### 中优先级（P2）

5. **接入 9 个未使用的 Utils**：`characterAstrologyService` 和 `bible-context` 最有价值
6. **解决 2 个 TODO 标记**
7. **接入 `useChainVideoGeneration` hook**

### 低优先级（P3）

8. **代码清理**：确认无引用后移除死代码，减少项目复杂度

---

## 十二、统计数据

| 指标 | 数值 |
|------|------|
| 总组件文件数 | 75 个 |
| 已接入组件 | 52 个（直接）+ 12 个（间接）= 64 个 |
| 未接入组件 | 12 个 |
| 总 API 路由 | 22 个 |
| 已调用路由 | 14 个 |
| 未调用路由 | 8 个 |
| 总 Store | 4 个 |
| 已使用 Store | 4 个 |
| 总 Hooks | 11 个 |
| 已使用 Hooks | 10 个 |
| 未使用 Hooks | 1 个 |
| 总 Utils | 50+ 个 |
| 未使用 Utils | 9 个 |
| Monorepo 包 | 4 个 |
| 被前端引用的包 | 0 个 |
| 未合并分支 | 3 个 |
| 未完成标记 | 2 处 |
