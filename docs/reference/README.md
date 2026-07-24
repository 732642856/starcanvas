# docs/reference/ — 调研与参考文档索引

> 最后更新: 2026-06-30
> 作用: 这是主仓内的参考资料索引，不是功能完成度的唯一事实源。
> 唯一源码事实源: `/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`
> 唯一当前能力图: `docs/reference/current-capability-map.md`

## 使用规则

1. 先看 `current-capability-map.md`，再看历史审计或外部对标文档。
2. 这里的报告分为四类状态：
   - `current`: 仍可直接用于当前判断
   - `pending`: 有高价值结论，但未完全吸收到主线索引
   - `archive`: 历史审计或阶段性结论，不能直接当当前能力事实
   - `mirror`: 镜像/复制文件，以原始文档为准
3. 任何“已完成/未完成”判断，必须回到当前主仓代码与测试验证，不得只引用本目录文档。

## 当前事实源

| 文件 | 状态 | 说明 |
|------|------|------|
| `current-capability-map.md` | `current` | 当前主仓的能力真相源，只记录当前代码与验证现状 |
| `星轨画布真实能力清单.md` | `archive` | 2026-06-10 的能力快照，已被后续真实视频、项目包、provider smoke 等进展部分覆盖 |

## 参考文档索引

| 文件 | 状态 | 来源 | 说明 | 代码/功能落点 |
|------|------|------|------|---------------|
| `TapNow深度调研报告.md` | `pending` | WorkBuddy 2026-06-09 | TapNow 功能深度分析 | Chat -> Canvas、专业控制面板、模板生态 |
| `StarCanvas_开源项目调研报告.md` | `pending` | WorkBuddy 2026-06-09 | 可复用的开源项目清单 | provider 能力目录、工作流交互模式、资产管理 |
| `StarCanvas_vs_4竞品_逐维度功能对比.md` | `pending` | WorkBuddy 2026-06-09 | TapNow + 小云雀 + LibreTV + ArcReel 逐项对比 | 能力 gap 跟踪 |
| `深度对标报告_StarCanvas_vs_TapNow_小云雀_LibreTV_MAM.md` | `pending` | WorkBuddy 2026-06-09 | 完整对标分析 | 全量产品路线参考 |
| `SHORT_DRAMA_AGENT_2_0_ARCHITECTURE.md` | `pending` | WorkBuddy 2026-06-09 | 小云雀 2.0 架构拆解 | Agent 工作流、短剧生产链路 |
| `AI-Film-OpenSource-Search-Report.md` | `pending` | WorkBuddy 2026-06-09 | AI 影视开源项目搜索报告 | ArcReel / Moyin / tldraw / xyflow 复用线索 |
| `剪映草稿导出格式逆向与一键拉片实现方案.md` | `pending` | WorkBuddy 2026-06-09 | 剪映导出方案 | `apps/web/src/app/canvas/utils/jianyingDraftExport.ts`, `ExportPreflightPanel.tsx` |
| `tapnow-doc1-extracted.md` | `pending` | 主项目已有 | TapNow 使用流程 | 用户工作流对标 |
| `tapnow-doc2-extracted.md` | `pending` | 主项目已有 | TapNow 功能拆解 | 节点/工作流模型对标 |
| `tapnow-doc3-extracted.md` | `pending` | 主项目已有 | TapNow 技术分析 | 架构与系统设计参考 |
| `tapnow-canvas-chat.md` | `pending` | 主项目已有 | TapNow 画布对话 | `ChatInput.tsx`, `ChatPanel.tsx`, `chatActions.ts` |
| `tapnow-video-flow.md` | `pending` | 主项目已有 | TapNow 视频流程 | `useWorkflowRunner.ts`, `ProductionRunQueuePanel.tsx` |
| `handoff-2026-06-10.md` | `archive` | Desktop | 历史接力提示词 | 历史交接记录，不作为当前事实源 |

## 已知本地开源参考仓

以下仓库已在本机被发现，后续应优先本地查阅，不必重复联网搜索：

- `tldraw`
- `xyflow`
- `arcreel`
- `comfyui-frontend`
- `moyin-creator`
- `ai-short-drama`
- `penshot`

## 仍待吸收为主线索引的结论

1. `剪映草稿导出格式逆向与一键拉片实现方案.md`
   - 当前已吸收: 导出预检、剪映 JSON/ZIP 导出骨架
   - 待继续收口: 更明确的交付物矩阵和恢复说明
2. `AI-Film-OpenSource-Search-Report.md`
   - 当前已吸收: 工作流/队列/可观测性思路
   - 待继续收口: 对标项目 -> 本地主仓代码落点矩阵
3. TapNow / 小云雀 / ArcReel 对标资料
   - 当前已吸收: `@引用`、Auto Agent、生产队列、项目包 roundtrip、reverse-prompt roundtrip 部分思路
   - 待继续收口: 模板生态、协作审批、批次溯源、最终交付体验
