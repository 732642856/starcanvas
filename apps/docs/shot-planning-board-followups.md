# Shot Planning Board — 下游功能梳理

> 基于 `main` @ `735977c`（PR #9 RunQueue→Executor Bridge 已合入）的代码地图分析。
> PR #11 (Quick Add Node Search) 和 PR #12 (e2e Stabilization) 待合入，不影响此文档分析。

---

## 1. 当前状态

### 1.1 已完成的能力

| 能力 | 位置 | 状态 |
|------|------|------|
| Shot Planning Board 面板 | `features/production/ShotPlanningPanel.tsx` | ✅ |
| 从 storyboard 生成 shot 列表 | `features/production/shotPlanningCore.ts` | ✅ |
| Shot 状态流转 (todo→ready→shooting→done→blocked) | `features/production/shotPlanningTypes.ts` | ✅ |
| Planning Board → RunQueue 桥接 | `features/production/shotPlanningRunQueueAdapter.ts` | ✅ |
| RunQueue → Executor 桥接 | `lib/storyboard/productionRunQueue.ts` + `useProductionRunExecutor.ts` | ✅ |
| Shot 节点在画布上的渲染 | `app/canvas/components/nodes/ShotNode.tsx` | ✅ |
| Shot 表格视图 | `app/canvas/components/panels/ShotListTable.tsx` | ✅ |
| Shot 编辑器面板 | `app/canvas/components/panels/StoryboardShotEditorPanel.tsx` | ✅ |
| 镜头预设库 | `features/shot-library/shotPresets.ts` | ✅ |
| 风格库 | `lib/styles/styleLibrary.ts` | ✅ |
| 角色 Bible | `app/canvas/components/panels/CharacterBiblePanel.tsx` | ✅ |
| 场景 Bible | `app/canvas/components/panels/SceneBiblePanel.tsx` | ✅ |
| 资产库面板 | `app/canvas/components/canvas/AssetLibraryPanel.tsx` | ✅ |
| AI Script → Storyboard | `features/ai-script/convertAIScriptToStoryboard.ts` | ✅ |

### 1.2 数据流

```
AI Script → Storyboard Text → Shot Planning Board → RunQueue → Executor → Shot Image Node
                                                         ↑
                                              (人工标记 ready 才流入)
```

---

## 2. 数据模型地图

### 2.1 核心实体及类型定义位置

| 实体 | 类型文件 | 关键字段 |
|------|----------|----------|
| **Shot (规划层)** | `features/production/shotPlanningTypes.ts` | `id, sourceNodeId, title, status, shotPresetId, stylePresetId, durationSec` |
| **Shot (cinematic)** | `types/cinematic.ts` | `shotType, cameraMovement, layers, dialogue, description` |
| **Shot (canvas node)** | `app/canvas/components/canvas/types.ts` | `shotImageUrl, shotPresetId, stylePresetId, cameraConfig` |
| **RunQueue Task** | `lib/storyboard/productionRunQueue.ts` | `id, shotId, action, status, progress` |
| **Asset** | `lib/assets/localImageStore.ts` | 分散在多个模块，无统一 Asset ID |
| **Character** | 分散（`characterAssetLibrary.ts`, `identity-anchors.ts`） | 无统一 Character 类型文件 |
| **Agent** | `lib/ai/agent-output-schema.ts` | Agent 输出结构，不含 shot context 注入 |
| **Storyboard** | `lib/storyboard/storyboardExportFormats.ts` | `StoryboardRow` 等导出格式 |
| **Scene (cinematic)** | `types/cinematic.ts` | `id, sceneNumber, location, timeOfDay` |

### 2.2 关键发现：实体之间的桥接状态

```
Shot Planning Item ←──→ Canvas Shot Node         ⚠️ 部分桥接（通过 sourceNodeId）
Shot Planning Item ←──→ RunQueue Task             ✅ 已桥接（PR #8）
Shot Planning Item ←──→ Asset                     ❌ 未桥接
Shot Planning Item ←──→ Character                 ❌ 未桥接
Agent Message ←──→ Shot Context                   ❌ 未注入
Canvas Node ←──→ Asset Reference                  ⚠️ 部分支持（AssetPreviewPopover）
```

### 2.3 Shot 类型的三层分裂

目前存在三个互不统一的 "Shot" 概念：

| 层 | 类型 | ID 格式 | 用途 |
|----|------|---------|------|
| **规划层** | `ShotPlanningItem` | `sp-xxx` | 人工管理状态 |
| **画布层** | Shot node data | `shot-xxx` | 可视化渲染 |
| **执行层** | `ProductionRunQueueTask` | `shotId:action` | 自动生产 |

这三层通过 `sourceNodeId` 和 `shotId` 字段桥接，但**没有统一的 Shot ID**，也**没有共享的 shot schema**。

---

## 3. 架构缺口分析

### 3.1 P0 缺口（阻塞后续功能）

#### 缺口 1：无统一 Asset Reference 格式

**现状：** Asset 在各个模块用不同方式引用：
- `lib/assets/localImageStore.ts` — 本地图片存储 ID
- `app/canvas/components/chat/AssetPreviewPopover.tsx` — `@` 提及语法
- 聊天消息中的 `@asset-id` 格式

**影响：** `agent-asset-mentions` 需要统一的 asset reference，否则 agent 无法可靠地引用资产。

**建议：** 定义 `AssetRef` 类型：
```ts
type AssetRef = {
  type: "image" | "audio" | "video" | "document"
  id: string
  label: string
  url?: string
}
```

#### 缺口 2：无统一 Shot ID 体系

**现状：** 三层 Shot 各自使用独立 ID，没有中心化的 shot 注册表。

**影响：** `shot-parameter-panel` 需要知道"当前选中节点的 shot 参数属于哪个 shot"，如果 ID 体系不统一，参数读回和持久化会很脆弱。

**建议：** 在 `features/production/shotPlanningTypes.ts` 中扩展 `ShotPlanningItem`，使其同时持有规划层 ID 和画布节点层的 ID 映射。

#### 缺口 3：Agent 无 Shot Context 注入

**现状：** Agent 消息通过聊天面板发送，但 agent 不知道当前正在编辑哪个 shot、shot 的状态、相关角色/场景上下文。

**影响：** `agent-asset-mentions` 如果只支持资产引用但没有 shot context，agent 在实际制片流程中的价值有限。

**建议：** 在 agent 消息构造时注入 `ShotContext`：
```ts
type ShotContext = {
  currentShotId?: string
  currentPlanningStatus?: ShotPlanningStatus
  relatedCharacterIds?: string[]
  relatedSceneId?: string
}
```

### 3.2 P1 缺口（影响开发体验）

#### 缺口 4：Canvas 上的 Shot 节点没有参数面板

**现状：** `ShotNode.tsx` 渲染镜头节点，`StoryboardShotEditorPanel.tsx` 提供编辑，但没有独立的参数面板（cinematic params、视觉风格、相机配置等统一展示）。

**影响：** `shot-parameter-panel` 需要从零构建。

#### 缺口 5：Shot 之间无批量连接能力

**现状：** 画布上节点通过 React Flow 的边连接，但没有批量操作（多选 → 连接 → 布局）。

**影响：** `canvas-bulk-connect` 需要先有选择模型和批量操作基础设施。

#### 缺口 6：无智能辅助线/吸附

**现状：** React Flow 默认无吸附行为。

**影响：** `canvas-smart-guides` 是纯交互层功能，可以实现，但不影响其他功能。

---

## 4. 推荐下一功能路线

### 推荐排序（按依赖关系）

```
Phase A: asset reference 统一            ← agent-asset-mentions 的前置
Phase B: shot ID 体系 + context 注入     ← shot-parameter-panel + agent-asset-mentions 的前置
Phase C: shot-parameter-panel            ← 可视化参数编辑
Phase D: agent-asset-mentions            ← 组合前面能力
Phase E: canvas-bulk-connect             ← 依赖 stable 节点类型
Phase F: canvas-smart-guides             ← 纯交互增量，可并行
```

### 细化

#### Phase A: Asset Reference 统一

**分支：** `feat/unified-asset-reference`
**文件：** 新增 `lib/assets/types.ts`，修改聊天/资产库面板中的引用

```ts
// lib/assets/types.ts
export type AssetType = "image" | "audio" | "video" | "document" | "character" | "style"
export type AssetRef = {
  type: AssetType
  id: string
  label: string
  thumbnailUrl?: string
}
export type AssetMention = AssetRef & {
  source: "user-upload" | "ai-generated" | "library"
  usedInShots: string[]  // shot IDs
}
```

**工作量：** ~100 lines, 2-3 files 修改
**PR 规模：** Small

#### Phase B: Shot ID 体系 + Context 注入

**分支：** `feat/shot-id-and-context`
**文件：** 修改 `shotPlanningTypes.ts`, `ShotPlanningPanel.tsx`, chat message 构造

- 在 `ShotPlanningItem` 中加入 `canvasNodeId` 字段
- 在 agent 消息构造时注入 `ShotContext`
- 确保 shot 可以从规划层 → 画布层 → 执行层 完整追踪

**工作量：** ~200 lines, 4-5 files
**PR 规模：** Medium

#### Phase C: Shot Parameter Panel

**分支：** `feat/shot-parameter-panel`
**文件：** 新增 `ShotParameterPanel.tsx`，修改 `ShotNode.tsx`, `StarCanvas.tsx`

- 复用 `types/cinematic.ts` 的类型
- 集成 shot preset 库和 style library
- 支持参数编辑 + 自动保存 + 刷新恢复

**工作量：** ~400 lines, 4 files
**PR 规模：** Medium-Large

#### Phase D: Agent Asset Mentions

**分支：** `feat/agent-asset-mentions`
**文件：** 修改 chat panel、agent message 渲染、agent context 注入

- 使用统一的 `AssetRef` 格式
- Agent 自然语言输出中自动高亮/可点击资产引用
- 支持 `@shot-xxx` 和 `@asset-xxx` 两种 mention

**工作量：** ~300 lines, 4-5 files
**PR 规模：** Medium

#### Phase E: Canvas Bulk Connect

**分支：** `feat/canvas-bulk-connect`
**文件：** 修改画布选择模型、边创建逻辑

- 多选节点后一键连接（从左到右或从上到下）
- 连接时自动布局（dagre 或自定义算法）
- 支持撤销/重做

**工作量：** ~300 lines, 3-4 files
**PR 规模：** Medium

#### Phase F: Canvas Smart Guides

**分支：** `feat/canvas-smart-guides`
**文件：** 新增或修改画布交互层

- React Flow 的 guide / snap 层覆盖
- 基于节点 bounding box 的对齐辅助线
- 间距检测和提示

**工作量：** ~200 lines, 2-3 files
**PR 规模：** Small-Medium

---

## 5. 推荐实施顺序

```text
1. feat/unified-asset-reference    (前置，S)
2. feat/shot-id-and-context        (前置，M)
3. feat/shot-parameter-panel       (核心 UI，M-L)
4. feat/agent-asset-mentions       (组合，M)
5. feat/canvas-bulk-connect        (独立，M)
6. feat/canvas-smart-guides        (纯交互，S-M)
```

前两个 PR (1+2) 是基础设施，做好后 3+4 可以交错推进，5+6 随时可做。

---

## 6. 开放问题

1. **Shot 类型是否需要三层统一为一个 `Shot` 接口？** — 有利于维护但不一定需要立即做，可以在 Phase B 中逐步收敛。

2. **Asset ID 是否应该使用 UUID 而非文件路径？** — 当前 `localImageStore` 使用路径作为 ID。建议统一为 UUID，在 Phase A 中引入。

3. **Agent context 注入应该在客户端还是服务端？** — 建议客户端（浏览器端）注入，因为 shot context 在内存/Zustand 中，不经过 API 路由。

4. **Storyboard → Shot Planning 的触发是自动还是手动？** — 当前是手动点击「从分镜生成」。自动触发需要考虑 storyboard 变更检测的性能。

5. **`apps/docs/` 截图应该进入哪个分支？** — 其中包含 7 张 rc3 屏幕截图，建议合入此 docs 分支或单独的 docs 分支。当前未跟踪。

---

## 7. 相关文件索引

```
features/production/shotPlanningTypes.ts        — Shot 规划类型定义
features/production/shotPlanningCore.ts          — 规划引擎核心
features/production/ShotPlanningPanel.tsx        — 规划面板 UI
features/production/shotPlanningRunQueueAdapter.ts — 运行队列适配器
features/production/useShotPlanningRunQueueStore.ts — 队列状态管理
features/shot-library/types.ts                   — 镜头库类型
features/shot-library/shotPresets.ts             — 镜头预设
features/ai-script/convertAIScriptToStoryboard.ts — AI 脚本→分镜
lib/storyboard/productionRunQueue.ts             — 运行队列核心
lib/storyboard/characterAssetLibrary.ts          — 角色资产库
lib/storyboard/createShotImageNode.ts            — Shot 节点创建
lib/storyboard-director-agent.ts                 — 分镜导演 Agent
lib/ai/agent-output-schema.ts                    — Agent 输出格式
lib/assets/localImageStore.ts                    — 本地图片存储
lib/styles/styleLibrary.ts                       — 风格库
types/cinematic.ts                               — Cinematic 全局类型
app/canvas/components/nodes/ShotNode.tsx          — Shot 节点渲染
app/canvas/components/panels/ShotListTable.tsx    — Shot 表格视图
app/canvas/components/panels/StoryboardShotEditorPanel.tsx — Shot 编辑器
app/canvas/components/canvas/AssetLibraryPanel.tsx         — 资产库
app/canvas/components/canvas/CharacterBiblePanel.tsx       — 角色 Bible
app/canvas/components/canvas/SceneBiblePanel.tsx           — 场景 Bible
app/canvas/components/chat/AssetPreviewPopover.tsx         — 资产预览
app/canvas/StarCanvas.tsx                      — 主画布入口
```
