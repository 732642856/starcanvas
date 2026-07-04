# 当前能力图谱（唯一能力真相源）

> 更新日期: 2026-07-03
> 适用范围: `/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`
> 规则: 本文档只记录“当前主仓代码 + 已验证证据”支持的事实，不记录历史设想、旧副本状态或未验证猜测。

## 1. 唯一事实源规则

1. 源码事实源只有主仓当前工作树。
2. `Documents/星轨画布/findings.md`、`progress.md` 是工作记忆，不是功能事实源。
3. 旧 Codex / WorkBuddy / 开发版副本只作为查漏源，不作为完成度依据。
4. 任何“已完成”判断，必须尽量附代码路径、测试路径或验证命令。

## 2. 当前已形成硬证据的主链路

### 2.1 真实视频分析链

- 真实上传视频
- 浏览器端抽帧
- 浏览器端像素分析
- 生成分析结果与下游分镜草稿
- 项目包导出 / 导入后可立即再次运行真实抽帧与分析

主要代码：

- `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`
- `apps/web/src/app/canvas/utils/real-video-frame-extractor.ts`
- `apps/web/src/app/canvas/utils/real-video-analyzer.ts`

主要验证：

- `apps/web/e2e/real-video-workflow.spec.ts`
- 其中 `imported project package restores uploaded-video assets and can rerun the workflow immediately`
  这条用例是“恢复后再次进入真实工作流执行”的直接硬证据

状态：`roundtrip verified`

### 2.2 reverse-prompt 资产闭环

- 图片节点触发反推提示词
- 结果落到画布为 prompt 节点
- 自动入资产库
- 刷新恢复
- 从资产库再次拖回画布再消费

主要代码：

- `apps/web/src/app/canvas/utils/reversePromptNodeAction.ts`
- `apps/web/src/app/canvas/utils/reversePromptCanvasArtifacts.ts`
- `apps/web/src/app/canvas/stores/canvasStore.ts`
- `apps/web/src/app/canvas/components/nodes/ImageNode.tsx`
- `apps/web/src/app/canvas/StarCanvas.tsx`

主要验证：

- `apps/web/e2e/image-node-reverse-prompt.spec.ts`
- `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`
- `apps/web/e2e/reverse-prompt-asset-library-roundtrip.spec.ts`

状态：`roundtrip verified`

### 2.3 项目包导出 / 导入 / 恢复

- 项目包 JSON 导出
- 导入恢复节点、边、视口
- 清洗 runtime URL
- 恢复资产线索

主要代码：

- `apps/web/src/app/canvas/utils/projectPackageExport.ts`
- `apps/web/src/app/canvas/utils/projectPackageImport.ts`
- `apps/web/src/app/canvas/StarCanvas.tsx`
- `apps/web/src/app/canvas/hooks/useCanvasDropUpload.ts`

主要验证：

- `apps/web/e2e/project-package-import.spec.ts`
- `apps/web/e2e/project-package-roundtrip.spec.ts`
- `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`

状态：`roundtrip verified`

### 2.4 Provider health / smoke

- 配置摘要
- text / image / video / tts 分项可见
- 显式授权 smoke 入口
- Vidu 最终结果等待
- smoke 结果可一键导回画布与资产库，视频结果会自动挂出 `uploaded-video -> video-sample-frames -> video-analyze` 子链

主要代码：

- `apps/web/src/lib/ai/providerSmoke.ts`
- `apps/web/src/lib/ai/providerSmokeResult.ts`
- `apps/web/src/app/api/ai/provider-smoke/`
- `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx`

主要验证：

- `apps/web/e2e/provider-health-summary.spec.ts`
- 对应 node test / typecheck / lint
- 其中 `smoke artifacts can be imported back into canvas and asset library for continued workflow use`
  是“provider smoke 产物进入真实工作流”的直接硬证据

状态：`real provider integrated`

### 2.4.1 Provider smoke 与真实视频恢复链的复合证据

以下两条证据组合后，已经覆盖“真实产物进入工作流，并且恢复后还能再次运行”这条主链：

1. `apps/web/e2e/provider-health-summary.spec.ts`
   - 证明 provider smoke 的图片/视频产物可回写到画布和资产库
   - 证明视频产物导回后会自动长出 `uploaded-video -> video-sample-frames -> video-analyze` 子链
2. `apps/web/e2e/real-video-workflow.spec.ts`
   - 证明项目包导入恢复后，`uploaded-video` 视频链无需刷新页面即可再次运行真实抽帧和本地分析

规则：后续若再评估“恢复后再次进入真实工作流执行”是否缺硬证据，应先引用这两条测试，不得绕过它们重复造题。

### 2.5 Chat / Auto Agent 主入口

- 聊天输入 `@` 引用节点/资产
- Auto Agent 能对模糊创作意图进入澄清路径
- `ask_clarification` 不再直接吞回普通聊天
- 澄清状态可跨刷新恢复，并继续推进到 Project Bible / 制作资产骨架

主要代码：

- `apps/web/src/app/canvas/components/chat/ChatInput.tsx`
- `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`
- `apps/web/src/app/canvas/utils/autoAgentService.ts`
- `apps/web/src/app/canvas/StarCanvas.tsx`

主要验证：

- `apps/web/e2e/auto-agent-clarification.spec.ts`
- `apps/web/e2e/chat-clarification-resume.spec.ts`

状态：`real provider integrated`

### 2.6 Auto Agent 创意到生产交付串联闭环

- 用户输入一句模糊创意
- Auto Agent 进入澄清，而不是 fallback 到普通聊天
- 澄清状态可跨刷新恢复
- 继续生成分镜并桥接到生产队列
- 队列完成后直接导出剪映兼容 ZIP 交接包

主要代码：

- `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`
- `apps/web/src/app/canvas/utils/autoAgentService.ts`
- `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`
- `apps/web/src/app/canvas/utils/jianyingDraftExport.ts`
- `apps/web/src/app/canvas/StarCanvas.tsx`

主要验证：

- `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`
- `apps/web/e2e/auto-agent-clarification.spec.ts`
- `apps/web/e2e/chat-clarification-resume.spec.ts`
- `apps/web/e2e/production-run-jianying-export.spec.ts`

状态：`roundtrip verified`

说明：

- 已覆盖“创意输入 -> 澄清 -> 刷新恢复 -> 继续生产 -> 导出交接物”的完整 UI 主路径。
- 仍未单独证明真实付费 provider 的长任务成本、批量任务吞吐和最终成片文件回收都已完全稳定。

## 3. 当前能力矩阵（能力 + 缺口 + 代码/测试锚点）

| 能力域 | 当前级别 | 当前用户可做什么 | 主要缺口 | 主要代码锚点 | 主要测试锚点 |
|------|----------|------------------|----------|--------------|--------------|
| 真实视频分析链 | `roundtrip verified` | 上传真实视频、抽帧、分析、生成下游分镜草稿、导出/导入后再次运行 | 仍缺更强的视频理解模型与更完整的镜头语义抽取 | `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/utils/real-video-frame-extractor.ts`, `apps/web/src/app/canvas/utils/real-video-analyzer.ts` | `apps/web/e2e/real-video-workflow.spec.ts` |
| reverse-prompt 资产闭环 | `roundtrip verified` | 图片节点反推提示词、生成 prompt 节点、自动入资产库、刷新恢复、再次拖回画布再消费 | 仍缺“本地图片 -> provider 可访问 URL 桥接”的更通用素材桥接层 | `apps/web/src/app/canvas/utils/reversePromptNodeAction.ts`, `apps/web/src/app/canvas/utils/reversePromptCanvasArtifacts.ts`, `apps/web/src/app/canvas/stores/canvasStore.ts`, `apps/web/src/app/canvas/components/nodes/ImageNode.tsx` | `apps/web/e2e/image-node-reverse-prompt.spec.ts`, `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`, `apps/web/e2e/reverse-prompt-asset-library-roundtrip.spec.ts` |
| 项目包导出 / 导入 / 恢复 | `roundtrip verified` | 导出项目包 JSON、导入恢复节点/边/视口、刷新后继续编辑、生产链路项目可恢复 | 跨设备只能恢复结构和资产线索，无法自动找回另一台设备本地二进制素材 | `apps/web/src/app/canvas/utils/projectPackageExport.ts`, `apps/web/src/app/canvas/utils/projectPackageImport.ts`, `apps/web/src/app/canvas/hooks/useCanvasDropUpload.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/project-package-import.spec.ts`, `apps/web/e2e/project-package-roundtrip.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts` |
| Provider health / smoke | `real provider integrated` | 在设置页检查 text / image / video / tts 可用性，执行带显式授权的 smoke | 真实 smoke 仍是分项能力，不等于全流程 production 完整可交付 | `apps/web/src/lib/ai/providerSmoke.ts`, `apps/web/src/lib/ai/providerSmokeResult.ts`, `apps/web/src/app/api/ai/provider-smoke/`, `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx` | `apps/web/e2e/provider-health-summary.spec.ts`, `apps/web/src/lib/ai/providerSmoke.test.ts`, `apps/web/src/app/api/ai/provider-smoke/run-core.test.ts` |
| Chat / Auto Agent 主入口 | `roundtrip verified` | `@` 引用节点/资产、模糊创意进入澄清流程、澄清可跨刷新恢复、继续生成分镜并直接进入生产与导出 | 更丰富的 Project Bible / 角色 / 场记等项目结构，还没与这条主链合成真实 provider 级长链验收 | `apps/web/src/app/canvas/components/chat/ChatInput.tsx`, `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`, `apps/web/src/app/canvas/utils/autoAgentService.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/auto-agent-clarification.spec.ts`, `apps/web/e2e/chat-clarification-resume.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`, `apps/web/src/app/canvas/components/chat/chatAutoAgentFlow.test.ts` |
| 生产队列执行与失败恢复 | `roundtrip verified` | 从队列启动生成、暂停/恢复、失败任务重试/跳过、队列与画布桥接，并可导出剪映兼容 ZIP 交接包 | 真实 provider 的长任务、批量任务、最终成片文件回收与失败归因证据仍不足 | `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`, `apps/web/src/app/canvas/hooks/useProductionRunExecutor.ts`, `apps/web/src/lib/storyboard/productionRunQueue.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/production-run-queue.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`, `apps/web/src/lib/storyboard/productionRunQueue.test.ts` |
| 分镜规划板与队列桥接 | `real provider integrated` | 生成 shot planning board、将 ready shots 转为 production run queue、自动打开队列 | 仍缺更成熟的“规划板 -> 真实大批量生产 -> 最终交付”完整证据 | `apps/web/src/features/production/ShotPlanningPanel.tsx`, `apps/web/src/features/production/shotPlanningRunQueueAdapter.ts`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/shot-planning-board.spec.ts`, `apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/src/features/production/__tests__/shotPlanningRunQueueAdapter.test.ts` |
| 剪映导出 / 交接包 | `roundtrip verified`（限 JSON/ZIP 兼容包） | 导出剪映 JSON、兼容 ZIP、带视频/音频/字幕素材交接 | PDF / Excel / 真视频拼接导出仍未接入；“已完成”只适用于当前 JSON/ZIP 兼容导出，不适用于更广义的交付层 | `apps/web/src/app/canvas/components/panels/ExportPreflightPanel.tsx`, `apps/web/src/app/canvas/utils/jianyingDraftExport.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/jianying-export.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/src/app/canvas/utils/jianyingDraftExport.package.test.ts` |
| 参考视频逆向分镜 | `real provider integrated` | 打开参考视频逆向分镜面板、从视频提取结构化分镜草稿 | 逆向分镜与爆款结构拆解的体验仍是两块面板，尚未统一成单一入口 | `apps/web/src/features/reverse-storyboard/ReverseStoryboardPanel.tsx`, `apps/web/src/features/reverse-storyboard/useVideoFrameExtractor.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/create-flow.spec.ts`, `apps/web/e2e/demo-screenshots.spec.ts`, `apps/web/src/features/reverse-storyboard/__tests__/computeSceneChangeFrameTimes.test.ts` |
| 爆款结构拆解 / remix analysis | `roundtrip verified`（局部） | 打开结构拆解面板，导入结果为 `remix-analysis` 节点，并可继续派生提示词 / 参考分镜 / 生产队列 | 仍缺“结构拆解 -> 真实跑图/跑视频 -> 最终交付物”的更长实跑证据 | `apps/web/src/app/canvas/components/panels/VideoRemixPanel.tsx`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/components/menus/NodeContextMenu.tsx`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/remix-analysis-derivation.spec.ts`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.test.ts` |
| 分镜 / 字幕 / 结构化导出格式 | `local logic only` | 可生成 storyboard CSV / markdown screenplay 等结构化文本导出 | 仍缺 UI 直达入口、PDF 文档级导出和更清晰的用户交付路径 | `apps/web/src/lib/storyboard/storyboardExportFormats.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/src/lib/storyboard/storyboardExportFormats.test.ts` |
| 画布导航与基础交互 | `real provider integrated` | 小地图开关、快速加节点、项目隔离、基础创作流程 smoke | 仍需继续减少大组件耦合与帮助文案/真实入口之间的不一致 | `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/app/canvas/components/toolbar/AddNodePanel.tsx`, `apps/web/src/app/canvas/components/chat/ChatInput.tsx` | `apps/web/e2e/canvas-minimap.spec.ts`, `apps/web/e2e/canvas-quick-add-node-search.spec.ts`, `apps/web/e2e/project-canvas-isolation.spec.ts`, `apps/web/e2e/core-workflow-smoke.spec.ts` |

补充说明：

- 当前运行时的镜头/光影参数主入口是 `apps/web/src/app/canvas/components/panels/CinematicParamPanel.tsx`。
- `apps/web/src/app/canvas/components/nodes/AngleControlPanel.tsx` 为历史原型，不在当前运行时主路径；后续审计不得再把它计为现役入口。

## 4. 当前能力等级说明

统一使用以下四级，避免“看起来做了”：

- `UI only`
- `local logic only`
- `real provider integrated`
- `roundtrip verified`

### 4.1 使用建议

- 只要某能力没有进入 `roundtrip verified`，就不应对外表述为“已经完整可用”。
- `real provider integrated` 代表真实调用存在，但不自动等于“最终用户交付闭环已经稳固”。
- `local logic only` 代表代码和测试有价值，但缺少真正的用户路径或交付入口。

## 5. 当前仍应视为历史/归档的文档

以下文档仍有价值，但不能直接当当前事实源：

- `星轨画布真实能力清点与对标报告_2026-06-10.md`
- `StarCanvas_地毯式审计报告_2026-06-11.md`
- `docs/StarCanvas-全版本架构分析报告.md`
- `03_REFERENCES_参考资料/reports/StarCanvas-全版本架构分析报告.md`

## 6. 推荐的后续选题方式

后续继续推进时，优先按这个顺序选题：

1. 先找 `real provider integrated` 但还没 `roundtrip verified` 的能力。
2. 再找 `local logic only` 但已有测试、离产品入口只差一层 UI/流程桥接的能力。
3. 最后才做全新能力扩展。

这能最大程度避免重复研究和重复选题。

## 7. 最高优先级任务 Top 10（当前推进序）

以下 Top 10 直接基于上面的能力矩阵排序。

2026-07-03 进展：
- 原 Top 1 / Top 2 已由 `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts` 收口到同一条串联主链。
- Batch A 现继续推进 Top 3 / Top 4。

| 排名 | 剩余缺口 | 当前级别 | 为什么优先 | 完成标准 | 主要代码锚点 | 主要测试锚点 |
|------|----------|----------|------------|----------|--------------|--------------|
| 1 | Auto Agent 一句话创作到完整项目结构闭环（本轮已收口） | `roundtrip verified` | 这是最接近用户“说一句话就开始创作”的核心体验，因此保留榜首，便于后续继续补真实 provider 长链证据 | 已达成：输入创意 -> 澄清 -> 刷新恢复 -> 生成分镜 -> 继续生产 -> 导出剪映兼容包；剩余观察点是更丰富项目结构与真实 provider 长链验收 | `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`, `apps/web/src/app/canvas/utils/autoAgentService.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/auto-agent-clarification.spec.ts`, `apps/web/e2e/chat-clarification-resume.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts` |
| 2 | 生产队列到最终交付物的统一闭环（本轮已收口） | `roundtrip verified` | 这条链决定“能不能交付”，因此保留高位，便于继续补真实 provider 长任务与最终成片回收证据 | 已达成：生产队列可完成并导出最终交付包；剩余观察点是真实 provider 的长任务、批量任务、最终成片文件回收与失败归因 | `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`, `apps/web/src/app/canvas/hooks/useProductionRunExecutor.ts`, `apps/web/src/lib/storyboard/productionRunQueue.ts` | `apps/web/e2e/production-run-queue.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts` |
| 3 | Shot Planning Board -> 大批量真实生产 -> 导出交付（本轮已收口边界） | `roundtrip verified` | 这是“从规划到生产”的主链路，因此需要明确它现在真实闭环到了哪一步 | 已达成：从规划板标记 ready 镜头 -> 生成执行队列 -> 跑通分镜图生产 -> 导出剪映兼容交接包；剩余观察点是把默认 action 从分镜图扩到更完整的视频/TTS/字幕生产链 | `apps/web/src/features/production/ShotPlanningPanel.tsx`, `apps/web/src/features/production/shotPlanningRunQueueAdapter.ts`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts` | `apps/web/e2e/shot-planning-board.spec.ts`, `apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/src/app/canvas/utils/jianyingDraftExport.extract.test.ts` |
| 4 | Provider smoke 从分项试跑提升到“可正式开工判定”（本轮已收口主表达） | `roundtrip verified` | 现在不只知道某个 provider 能不能跑，还能在设置页直接看到“可正式开工 / 项阻塞 / 项注意” | 已达成：设置页可根据 health + smoke 给出正式开工判定，并覆盖 ready / blocked / 显式授权 smoke / 产物导回画布等主场景；剩余观察点是更多真实 provider 组合与长期任务成本证明 | `apps/web/src/lib/ai/providerSmoke.ts`, `apps/web/src/lib/ai/providerSmokeResult.ts`, `apps/web/src/lib/ai/provider-health-summary.ts`, `apps/web/src/lib/ai/taskReadiness.ts`, `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx` | `apps/web/e2e/provider-health-summary.spec.ts`, `apps/web/src/lib/ai/provider-health-summary.test.ts`, `apps/web/src/lib/ai/taskReadiness.test.ts` |
| 5 | 参考视频逆向分镜与爆款结构拆解统一入口（本轮已收口主入口） | `roundtrip verified` | 参考视频现在已有单一主入口，用户不再需要先猜“该点逆向分镜还是结构拆解” | 已达成：空画布与主工作流都可从“导入参考视频 / 参考视频分析”进入统一入口，再分流到分镜草稿或结构拆解；剩余观察点是把统一入口 E2E 稳定性继续收紧，并补 Add Node 入口专项验证 | `apps/web/src/app/canvas/components/canvas/EmptyCanvasGuide.tsx`, `apps/web/src/app/canvas/components/panels/ReferenceVideoEntryPanel.tsx`, `apps/web/src/features/reverse-storyboard/ReverseStoryboardPanel.tsx`, `apps/web/src/app/canvas/components/panels/VideoRemixPanel.tsx`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/create-flow.spec.ts`（已覆盖统一入口两条分流路径，仍有串跑稳定性观察点）, `apps/web/e2e/demo-screenshots.spec.ts` |
| 6 | 爆款结构拆解结果继续进入真实生产链（本轮已收口 UI 证据） | `roundtrip verified`（局部） | 结构拆解不再只停在“分析资产”，而是能直接派生出可继续生产的下游对象 | 已达成：`remix-analysis` 节点可一键派生复刻提示词、参考分镜节点、生产队列，且右键主路径已由浏览器级 E2E 验证；剩余观察点是把“队列创建 -> 实际跑图/跑视频 -> 最终交付物”连成更长证据链 | `apps/web/src/app/canvas/components/menus/NodeContextMenu.tsx`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.ts`, `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts` | `apps/web/e2e/remix-analysis-derivation.spec.ts`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.test.ts` |
| 7 | 本地图片/媒体到 provider 可访问 URL 的通用桥接层 | `roundtrip verified`（局部） | reverse-prompt 主链已通，`image-to-video` 上游图片桥接已通，手动 `generate-video-clip` 首帧图路径已补桥接，`talking-photo` 上传音频也已补到 service 级桥接；但更通用的素材桥接仍是多个点状修补 | 本地图片、视频、音频等素材都能稳定进入需要远程 URL / base64 输入的 provider，不靠单点特判 | `apps/web/src/app/canvas/utils/reversePromptNodeAction.ts`, `apps/web/src/app/canvas/utils/videoSourceImage.ts`, `apps/web/src/app/canvas/utils/talkingPhotoService.ts`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/lib/assets/` | `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`, `apps/web/src/app/canvas/utils/videoSourceImage.test.ts`, `apps/web/src/app/canvas/utils/talkingPhotoService.test.ts` |
| 8 | 剪映/交接包之外的结构化导出入口补齐 | `local logic only` | 现在底层有 `storyboardExportFormats`，但用户层还没有稳定入口，这是一块低成本高价值收口项 | 用户可直接导出 storyboard CSV / markdown screenplay，且在界面上可发现、可操作 | `apps/web/src/lib/storyboard/storyboardExportFormats.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/src/lib/storyboard/storyboardExportFormats.test.ts`，后续需补 UI 交互测试 |
| 9 | 剪映导出能力边界写实并扩展到 PDF / Excel / 视频交付层 | `roundtrip verified`（限 JSON/ZIP） | 当前最容易被误说成“导出完成”，但其实只完成了 JSON/ZIP 兼容导出 | 文档和 UI 都明确边界；如继续扩展，则优先补 PDF/Excel，再考虑真视频拼接 | `apps/web/src/app/canvas/components/panels/ExportPreflightPanel.tsx`, `apps/web/src/app/canvas/utils/jianyingDraftExport.ts` | `apps/web/e2e/jianying-export.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts` |
| 10 | 画布大组件耦合与帮助文案/真实入口一致性治理 | `real provider integrated` | 这不是最显眼的功能缺口，但它是反复误判和 UI 体验割裂的来源之一 | 帮助文案、入口名称、真实可执行能力一致；后续逐步把 `StarCanvas.tsx` 的巨型耦合拆小 | `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/app/canvas/components/toolbar/AddNodePanel.tsx`, `apps/web/src/app/canvas/components/chat/ChatInput.tsx` | `apps/web/e2e/canvas-minimap.spec.ts`, `apps/web/e2e/canvas-quick-add-node-search.spec.ts`, `apps/web/e2e/core-workflow-smoke.spec.ts` |

### 7.1 选题执行规则

后续直接按这个顺序推进，除非出现以下两种情况之一：

1. 上位缺口被外部条件阻塞（例如真实 provider 凭证、额度或上游服务不可用）。
2. 下位缺口可以在极小成本下顺手收掉，且不会打断上位主链路。

### 7.2 推荐的推进批次

- **Batch A（直接影响“能不能正式用”）**
  - Top 1
  - Top 2
  - Top 3
  - Top 4
- **Batch B（统一主入口与再生产链路）**
  - Top 5
  - Top 6
  - Top 7
- **Batch C（低成本补交付层与体验一致性）**
  - Top 8
  - Top 9
  - Top 10

## 8. 当前最重要的工程纪律

1. 先看本文档，再看历史报告。
2. 先看主仓代码，再看旧副本。
3. 先看测试和验证证据，再下“已完成”结论。
