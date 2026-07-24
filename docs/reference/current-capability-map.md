# 当前能力图谱（唯一能力真相源）

> 更新日期: 2026-07-11
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
- 将图片、视频、音频的本地 IndexedDB bytes 写入项目包 asset manifest
- 在另一画布导入时恢复资产 bytes、资产 ID 与节点/镜头关联
- 导入恢复后可直接重跑 `image-result -> video-generation` 工作流
- 恢复后再次生产得到的 `shot.generatedImageNodeId/generatedImageAssetId` 可继续随项目包导出，且关联 `ai-generated-image` 节点不会丢

主要代码：

- `apps/web/src/app/canvas/utils/projectPackageExport.ts`
- `apps/web/src/app/canvas/utils/projectPackageImport.ts`
- `apps/web/src/app/canvas/StarCanvas.tsx`
- `apps/web/src/app/canvas/hooks/useCanvasDropUpload.ts`

主要验证：

- `apps/web/e2e/project-package-import.spec.ts`
- `apps/web/e2e/project-package-roundtrip.spec.ts`
- `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`
- `apps/web/e2e/project-bible-character-view.spec.ts`

状态：`roundtrip verified`

### 2.4 Provider health / smoke

- 配置摘要
- text / image / video / tts 分项可见
- 显式授权 smoke 入口
- Vidu 最终结果等待
- smoke 结果可一键导回画布与资产库，视频结果会自动挂出 `uploaded-video -> video-sample-frames -> video-analyze` 子链
- `gpt-image-2` 纯文生图已真实成功；参考图编辑现在在设置页作为独立 `image-edit` smoke 呈现，使用 `/images/edits` 的 multipart `image[]` 合同，必须输入 `RUN_IMAGE_EDIT_SMOKE` 后才会发出最小真实请求。普通生图 smoke 不再被视为参考图编辑已验证。当前 `copse.top` 参考图编辑实际连续返回 Cloudflare `524`，仍按外部依赖阻塞，不能误标为已验真。
- I2V 已把镜头的主动作、景别、运镜和参考帧连续性编译为单镜头 prompt；连续动作只保留首个动作，并显式建议拆镜。动态/运镜镜头会标出 pose/depth/白模预演建议。本机 ComfyUI `v0.3.10` CPU 服务与文生图 route/client 已 local-only 接入，但未安装 checkpoint；ControlNet/IP-Adapter 参考图执行层仍待专用 workflow。
- 白模与拆镜建议已持久化到 `ShotProductionBrief.handoff.previs`，并通过既有 `handoff-warning` 进入生产队列预检/导出；当前是 warning，不阻塞没有 Comfy endpoint 的个人工作流。
- 项目交付 manifest 现在导出 `previsPlans`，可保留每镜的 pose/depth 与 `splitShotRecommended` 状态，供后续 Comfy/ControlNet worker 消费。
- 浏览器级证据：`e2e/production-run-project-package-roundtrip.spec.ts` 已直接检查导出的项目包 JSON 含连续动作镜头的 `previsPlans[].splitShotRecommended=true`，并完成导入恢复与再交付；不触发真实 Provider。

### 2.5 本机 Skill Registry / 导演组

- `Film Crew` 已接入本机 Skill metadata 选择：固定扫描 `~/.codex/skills`、`~/.agents/skills`、`~/.workbuddy/skills` 下的 `SKILL.md`，客户端只能看 metadata，不能传路径或读取本机文件。
- 默认仅发送被选 Skill 的 metadata 摘要；正文需本机内容开关与用户单次明确勾选，且每 Skill/总上下文限额。风险标记 Skill 的正文永不发送。
- Crew SSE 与 execution trace 记录 `skillId/source/hash/injection/truncated/skillBodySent`，不保存正文。
- 已验证本机 metadata-only Registry 可发现 164 个 allowlist Skill；安全合同见 `docs/reference/local-skill-registry-security.md`。

主要代码：

- `apps/web/src/lib/ai/providerSmoke.ts`
- `apps/web/src/lib/ai/providerSmokeResult.ts`
- `apps/web/src/app/api/ai/provider-smoke/`
- `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx`
- `apps/web/src/app/api/ai/generate-image/image-edit-form.ts`
- `apps/web/src/lib/storyboard/videoPromptDirector.ts`
- `apps/web/src/lib/storyboard/shotProductionBrief.ts`
- `apps/web/src/lib/storyboard/projectPackageManifest.ts`

主要验证：

- `apps/web/e2e/provider-health-summary.spec.ts`
- `apps/web/src/app/api/ai/generate-image/image-edit-form.test.ts`
- `apps/web/src/lib/storyboard/videoPromptDirector.test.ts`
- `apps/web/e2e/shot-video-direction.spec.ts`
- `apps/web/src/lib/storyboard/projectPackageManifest.test.ts`
- `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`
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
- “先预览”会自动创建半透明草稿节点；用户可逐个落地/丢弃，全部确认后自动执行连线等 deferred actions
- Auto Agent 生图成功后会自动落画布为 `ai-generated-image` 节点，并同步写入资产库
- 刷新恢复后，Auto Agent 生成图仍可再次触发 `reverse-prompt` 下游链
- 刷新恢复后，Auto Agent 生成图也可从素材库重新回画布，并继续触发 `reverse-prompt`

主要代码：

- `apps/web/src/app/canvas/components/chat/ChatInput.tsx`
- `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`
- `apps/web/src/app/canvas/utils/autoAgentService.ts`
- `apps/web/src/app/canvas/StarCanvas.tsx`

主要验证：

- `apps/web/e2e/auto-agent-clarification.spec.ts`
- `apps/web/e2e/chat-preview-draft-nodes.spec.ts`
- 其中 `stale failed real smoke blocks auto-agent image generation until settings save clears it`
  已覆盖“真实 smoke 失败阻塞 -> 设置保存清障 -> 自动生图回写画布 + 资产库”
- 同文件 `auto-agent generated image survives reload and can rerun reverse-prompt`
  已覆盖“自动生图 -> 保存 -> 新开页恢复 -> reverse-prompt 再消费”
- 同文件 `auto-agent generated image survives reload and can be re-added from asset library for reverse-prompt`
  已覆盖“自动生图 -> 保存 -> 新开页恢复 -> 从素材库回画布 -> reverse-prompt 再消费”
- 同文件 `clarification answer can create a production bible skeleton and bridge into shot planning queue`
  已覆盖“选择 `拆成制作圣经` -> 自动长出首批 shot -> 打开 Shot Planning -> 创建执行队列”
- 同文件 `clarification answer can create a production bible skeleton and bridge into shot planning queue`
  还覆盖“队列面板显示阻塞项时，首批可执行任务仍可真实启动”
- `apps/web/e2e/chat-clarification-resume.spec.ts`
- `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`（显式开启时跑真实文本 provider UI smoke；2026-07-06 已在 `http://127.0.0.1:3125 -> copse.top/v1` 实跑通过，`1 passed (1.6m)`）
- `apps/web/src/app/canvas/utils/autoAgentService.real.test.ts`（显式开启时跑真实 provider smoke；2026-07-06 已在同一 server 实跑通过，文本模式为 `1 pass / 1 skip`，开启图片 smoke 后为 `2 pass`，其中 Auto Agent 真实生图分支耗时约 `210.9s`）

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
- 已新增 `Auto Agent -> 制作圣经骨架` 的真实文本 provider smoke + 真实 UI smoke，证明主入口编排和画布回写都不是 mock 空壳。
- 仍未单独证明真实付费 provider 的长任务成本、批量任务吞吐和最终成片文件回收都已完全稳定。

## 3. 当前能力矩阵（能力 + 缺口 + 代码/测试锚点）

| 能力域 | 当前级别 | 当前用户可做什么 | 主要缺口 | 主要代码锚点 | 主要测试锚点 |
|------|----------|------------------|----------|--------------|--------------|
| 真实视频分析链 | `roundtrip verified` | 上传真实视频、抽帧、分析、生成下游分镜草稿、导出/导入后再次运行 | 仍缺更强的视频理解模型与更完整的镜头语义抽取 | `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/utils/real-video-frame-extractor.ts`, `apps/web/src/app/canvas/utils/real-video-analyzer.ts` | `apps/web/e2e/real-video-workflow.spec.ts` |
| reverse-prompt 资产闭环 | `roundtrip verified` | 图片节点反推提示词、生成 prompt 节点、自动入资产库、刷新恢复、再次拖回画布再消费 | 已补共享 `image/audio -> data URL` 桥接；剩余缺口是继续把 `video/file` 等 provider 输入统一收口到同一层 | `apps/web/src/app/canvas/utils/providerMediaDataUrl.ts`, `apps/web/src/app/canvas/utils/reversePromptNodeAction.ts`, `apps/web/src/app/canvas/utils/reversePromptCanvasArtifacts.ts`, `apps/web/src/app/canvas/stores/canvasStore.ts`, `apps/web/src/app/canvas/components/nodes/ImageNode.tsx` | `apps/web/e2e/image-node-reverse-prompt.spec.ts`, `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`, `apps/web/e2e/reverse-prompt-asset-library-roundtrip.spec.ts`, `apps/web/src/app/canvas/utils/providerMediaDataUrl.test.ts` |
| 项目包导出 / 导入 / 恢复 | `roundtrip verified` | 导出项目包 JSON、导入恢复节点/边/视口及图片/视频/音频 bytes、刷新后继续编辑；恢复后的媒体可再次进入生成、分析或剪映交接链；超过 100 MiB 时导出前显示体积/内存风险并允许取消 | 大体积媒体仍以内联 data URL 写进 JSON；超大项目后续可升级为流式 ZIP，但不阻塞当前个人使用 | `apps/web/src/app/canvas/utils/projectPackageExport.ts`, `apps/web/src/app/canvas/utils/projectPackageImport.ts`, `apps/web/src/app/canvas/hooks/useCanvasDropUpload.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/project-package-import.spec.ts`, `apps/web/e2e/project-package-roundtrip.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/src/app/canvas/utils/projectPackageExport.test.ts`, `apps/web/src/app/canvas/utils/projectPackageImport.test.ts` |
| Provider health / smoke | `real provider integrated` | 在设置页检查 text / image / reference-image edit / video / tts 可用性，执行带显式授权的 smoke；参考图编辑用独立确认短语和 `/images/edits` 合同 | 真实 smoke 仍是分项能力，不等于全流程 production 完整可交付；当前 Copse reference-image edit 已有连续 `524` 外部阻塞证据 | `apps/web/src/lib/ai/providerSmoke.ts`, `apps/web/src/lib/ai/providerSmokeResult.ts`, `apps/web/src/app/api/ai/provider-smoke/`, `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx` | `apps/web/e2e/provider-health-summary.spec.ts`, `apps/web/src/lib/ai/providerSmoke.test.ts`, `apps/web/src/app/api/ai/provider-smoke/run-core.test.ts` |
| 本机 Skill Registry / 导演组 | `local-only integrated` | 本机 Crew 面板发现、选择、取消 Skill；默认发送 metadata 摘要，正文仅按显式开关且有长度/风险限制 | AgentNode 主 runner 尚未完全切换到 SkillRuntime；不执行 Skill script，不支持云端/远程扫描 | `apps/web/src/lib/local-skills/`, `apps/web/src/app/api/ai/local-skills/`, `apps/web/src/app/api/ai/crew/run/route.ts`, `apps/web/src/lib/workbench-kernel/` | `apps/web/src/lib/local-skills/*.test.ts`, `apps/web/e2e/local-skill-crew-selection.spec.ts` |
| Chat / Auto Agent 主入口 | `roundtrip verified` | `@` 引用节点/资产、模糊创意进入澄清流程、澄清可跨刷新恢复、继续生成分镜并直接进入生产与导出；真生图遇 `524` 时会退化成可重跑 prompt，并可再次补出图片结果节点；恢复后的角色三视图 `front/side/backViewAssetId` 现也会被 Auto Agent / 角色合规检查视作有效参考锚点 | 更丰富的 Project Bible / 角色 / 场记等项目结构，还没与这条主链合成真实 provider 级长链验收 | `apps/web/src/app/canvas/components/chat/ChatInput.tsx`, `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`, `apps/web/src/app/canvas/utils/autoAgentService.ts`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/auto-agent-clarification.spec.ts`, `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/chat-clarification-resume.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`, `apps/web/src/app/canvas/components/chat/chatAutoAgentFlow.test.ts` |
| 生产队列执行与失败恢复 | `roundtrip verified` | 从队列启动生成、暂停/恢复、失败任务重试/跳过、队列与画布桥接，并可导出剪映兼容 ZIP / 项目包级交付物 | 真实 provider 的长任务、批量任务、最终成片文件回收与失败归因证据仍不足；当前 mock/browser 证据已覆盖启动前阻塞、会话 key 解除阻塞、执行进度、失败后重试/跳过、blocked action 展示、桥接队列的 start/clear 两条执行器联通证据，以及“已完成交付物 -> 项目包恢复 -> 剪映再导出”长链 | `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`, `apps/web/src/app/canvas/hooks/useProductionRunExecutor.ts`, `apps/web/src/lib/storyboard/productionRunQueue.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/production-run-queue.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`, `apps/web/src/lib/storyboard/productionRunQueue.test.ts` |
| 分镜规划板与队列桥接 | `roundtrip verified` | 生成 shot planning board、将 ready shots 转为 production run queue、自动打开队列，并可继续导出剪映兼容交接包 | 已补 source shot 回查与共享 brief / manifest / queue builder 复用，规划板桥接出的默认链已扩到 `generate-storyboard-image -> generate-video-clip -> generate-voice-track -> create-subtitle-track`；剩余缺口是更成熟的“规划板 -> 真实大批量生产 -> 最终交付”真实 provider 证据 | `apps/web/src/features/production/ShotPlanningPanel.tsx`, `apps/web/src/features/production/shotPlanningRunQueueAdapter.ts`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/shot-planning-board.spec.ts`, `apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/src/features/production/__tests__/shotPlanningRunQueueAdapter.test.ts` |
| 剪映导出 / 交接包 / 浏览器视频合成 | `roundtrip verified`（JSON/ZIP 兼容包 + 单/双片段、WAV、字幕 MP4） | 导出剪映 JSON、兼容 ZIP、带视频/音频/字幕素材交接，并可在项目包恢复后再次导出；浏览器可将真实单段/两段 WebM、WAV、字幕合成并下载 MP4；总素材超过 64 MB 会在加载 wasm 前明确转剪映交接包 | PDF / Excel、长片段/大素材浏览器性能尚无同等级证据；“已完成”不适用于更广义交付层 | `apps/web/src/app/canvas/components/panels/ExportPreflightPanel.tsx`, `apps/web/src/app/canvas/utils/jianyingDraftExport.ts`, `apps/web/src/app/canvas/utils/videoCompositionBrowser.ts`, `apps/web/src/app/canvas/components/nodes/WorkflowNode.tsx`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/jianying-export.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/e2e/browser-video-composition.spec.ts`, `apps/web/src/app/canvas/utils/videoCompositionPlan.test.ts` |
| 参考视频逆向分镜 | `real provider integrated` | 打开参考视频逆向分镜面板、从视频提取结构化分镜草稿 | 逆向分镜与爆款结构拆解的体验仍是两块面板，尚未统一成单一入口 | `apps/web/src/features/reverse-storyboard/ReverseStoryboardPanel.tsx`, `apps/web/src/features/reverse-storyboard/useVideoFrameExtractor.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/create-flow.spec.ts`, `apps/web/e2e/demo-screenshots.spec.ts`, `apps/web/src/features/reverse-storyboard/__tests__/computeSceneChangeFrameTimes.test.ts` |
| 爆款结构拆解 / remix analysis | `roundtrip verified`（局部） | 打开结构拆解面板，导入结果为 `remix-analysis` 节点，并可继续派生提示词 / 参考分镜 / 生产队列 / 结构化交接物导出 | 仍缺“结构拆解 -> 真视频生成/成片交付”的更长实跑证据；当前已到 storyboard CSV 这类结构化交接层 | `apps/web/src/app/canvas/components/panels/VideoRemixPanel.tsx`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/components/menus/NodeContextMenu.tsx`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/remix-analysis-derivation.spec.ts`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.test.ts` |
| 分镜 / 字幕 / 结构化导出格式 | `roundtrip verified`（局部） | 可从画布 UI 直接导出 storyboard CSV / markdown screenplay / character CSV 等结构化文本交接物 | 仍缺 PDF 文档级交付、Excel 更强格式化、以及这些导出物的反向导入/恢复链 | `apps/web/src/lib/storyboard/storyboardExportFormats.ts`, `apps/web/src/app/canvas/components/toolbar/ExportDropdown.tsx`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/structured-export-downloads.spec.ts`, `apps/web/src/lib/storyboard/storyboardExportFormats.test.ts` |
| 画布导航与基础交互 | `roundtrip verified`（局部） | 小地图开关、快速加节点、项目隔离、首页/仪表盘进入画布、文本节点保存后刷新恢复，以及右键删除后刷新仍为空画布 | 仍需继续减少大组件耦合与帮助文案/真实入口之间的不一致 | `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/app/canvas/components/toolbar/AddNodePanel.tsx`, `apps/web/src/app/canvas/components/chat/ChatInput.tsx`, `apps/web/src/app/canvas/components/menus/NodeContextMenu.tsx` | `apps/web/e2e/canvas-minimap.spec.ts`, `apps/web/e2e/canvas-quick-add-node-search.spec.ts`, `apps/web/e2e/project-canvas-isolation.spec.ts`, `apps/web/e2e/core-workflow-smoke.spec.ts`, `apps/web/e2e/node-delete-persistence.spec.ts` |

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

2026-07-13 fresh 视频证据：
- 当前主仓 fresh server 的 `POST /api/ai/provider-smoke/run` 以显式 `RUN_VIDEO_SMOKE` 授权发起 1 秒、540P、无音频 Vidu 请求，52 秒后返回 `passed` 和最终 MP4 URL。它证明 DashScope/Vidu 的“提交 -> 轮询 -> 最终 `videoUrl` 回收”真实链路，不再只停在任务提交；这不是生产队列整链，队列级真实长任务、批量任务与失败归因仍保留为 Batch A 缺口。
- 当前 DashScope 账户还实测可用 `happyhorse-1.1-i2v`：赵珩三视图驱动的 3 秒任务已 `SUCCEEDED` 并下载 MP4。该模型需要 `first_frame` 与 `media.type=first_frame` 联合输入；task 查询单次网络失败现会自动重试，避免已完成任务被误报失败。DashScope 当前账户不含可用图像模型，不能把它计为角色一致性生图通路。

2026-07-16 R2V 前端接入证据：
- `VideoGenInput.referenceImageUrls` 已接入 Vidu payload；有角色参考时仅提交 `mode=r2v + referenceImageUrls`，不混入 `imageUrl`，无参考时保持原有 I2V 合同。
- 稳定 `requestId` 的 Vidu SSE 传输中断会在浏览器端自动恢复一次；服务端同时合并同 id 的 in-flight 提交与六小时完成缓存，避免断线重连或重复点击造成双份任务。Next 重启后若 taskId 尚未记录，仍按结果未知处理，不能盲重发。
- Shot 生产队列与通用工作流均会从已绑定角色资产按 `front -> side -> back` 取最多 7 张可读图；本地 `blob:` 仅在存在匹配 `assetId` 时桥接为 provider 可读数据。
- 浏览器回归已在 API 拦截下通过：`full-pipeline.spec.ts`（右键工作流 -> R2V SSE -> 本地视频资产回写，12.9s）与 `production-run-queue.spec.ts`（角色参考队列五步交付，10.1s）。这两项不消耗 Provider 额度；真实生产 R2V 已由同批 DashScope receipts 与最终交付包另行证明。
- 若用户已配置角色参考图但全部未恢复或桥接失败，当前会在请求 Vidu 前显式阻断并在 `Workflow Run` 中给出恢复/重传提示；部分可读时保留 Shot 卡片警告并只提交可读参考，避免无提示回退 I2V。
- 部分 R2V 参考图的 `mode / configured / used / skipped / reason` 现已写入 `productionRunPlan.videoReferenceAudit`；队列复核任务显示短摘要，完整原因进入 handoff report。`production-run-project-package-roundtrip.spec.ts` 已覆盖“队列 -> 项目包 JSON -> 新项目恢复 -> 剪映包再导出”的浏览器审计路径，mock 模式下无 Provider 消耗。
- 批量 R2V replacement 仅在 `STARCANVAS_VIDEO_REFERENCE_MODE=1 + STARCANVAS_ALLOW_REFERENCE_REPLACEMENT=1 + STARCANVAS_ALLOW_PAID_VIDEO_BATCH=1` 时运行；每次实际替换会先归档旧视频/receipt 至 `artifacts/.../archives/video-replacement-*` 并写 `rollback-index.json`。dry-run 不创建 archive、不调用 Provider。
- 同日《太子替我背黑锅》完成受控真实交付：Copse 单张 `1024x1024` Gate 1 在 canonical `3000` 上仍于约 134 秒返回 `524`，后续图片调用已停止；Vidu 则完成 `shot-05` 两次 R2V，第二次三时点 QA 确认“匕首击锅 + 火花”动作、角色参考和竖幅均可用。旧版自动归档，8 段 R2V 被本地重建为 24.71 秒 v2 母版，`artifacts/太子替我背黑锅-delivery-package-r2v-v2.zip` 已通过 ZIP 完整性检查。`run-story-video-batch.mjs` 同时修复单镜重跑覆盖 batch summary 的审计缺口，9 个 Node 回归通过。

2026-07-13 fresh Top 5 入口证据：
- `apps/web/e2e/add-node-reference-video-entry.spec.ts` 在 fresh 浏览器跑通 `添加节点 -> 视频 -> 参考视频分析 -> 统一入口 -> 逆向分镜 / 结构拆解` 两条分流，`1 passed (1.0m)`。Add Node 入口专项验证已完成；后续真实上传、分析与产物回写属于 Top 6/生产链，不再重复作为入口缺口。

2026-07-13 fresh Top 6 派生证据：
- `apps/web/e2e/remix-analysis-derivation.spec.ts` 在 fresh 浏览器跑通结构拆解节点的三类右键操作：派生提示词/参考分镜，以及创建生产队列，`3 passed (1.3m)`。它验证的是可编辑的下游对象与队列桥接；真视频生成/成片交付仍归 Batch A 真实生产缺口。

| 排名 | 剩余缺口 | 当前级别 | 为什么优先 | 完成标准 | 主要代码锚点 | 主要测试锚点 |
|------|----------|----------|------------|----------|--------------|--------------|
| 1 | Auto Agent 一句话创作到完整项目结构闭环（本轮已补真生图失败退路） | `roundtrip verified`（文本/结构） + `real provider integrated`（图片） | 这是最接近用户“说一句话就开始创作”的核心体验，因此保留榜首，便于后续继续补真实 provider 长链证据 | 已达成：输入创意 -> 导演三问澄清（风格 / 故事功能 / 情绪）-> 刷新恢复 -> 生成带导演约束的分镜 prompt，并把 `directorBrief` 写进 storyboard 节点元数据 -> 继续生产 -> 导出剪映兼容包；同时已补 `Auto Agent -> 制作圣经骨架` 真实文本 provider smoke + 真实 UI smoke，且 2026-07-06 已在当前主仓运行中的 `http://127.0.0.1:3125 -> copse.top/v1` 上实跑通过。图片侧新增硬证据：同日最小 `provider-smoke image` 已在约 `67.1s` 返回成功，`autoAgentService.real.test.ts` 的 Auto Agent 真实生图分支也已在约 `210.9s` 跑通，说明当前 `copse.top -> gpt-image-2` 路径是“高延迟但可用”，不再只是理论接通。新增收口：Auto Agent 生图分支已复用共享 `aspectRatio -> supported size` 解析，修掉非浏览器环境 `data:image` 持久化悬挂，并补上“生成成功后自动回写画布节点 + 资产库”的 UI 硬证据；本轮继续把上游 `524` 收口进共享 retryable timeout 语义，并在真实生图失败时自动退化成 `概念图待重试 Prompt` 节点，避免主链空手失败。新增浏览器证据已证明这个 fallback prompt 会保留原始 model/画幅偏好，并可右键“运行当前节点”补出 `ai-generated-image + assetId` 结果节点；2026-07-07 又在 fresh `http://127.0.0.1:3172` 上跑通 `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`：最小英文 smoke prompt 的真实 UI 自动回写链 `1 passed / 1.6m`，同机 image `provider-smoke/run` 返回 `ok:true`；同日真实 `制作圣经` smoke 也再次 `1 passed / 1.4m`，并额外证明 `ProjectBiblePanel` 已出现 `角色 2 / 场景 1 / 林雾 / 周祁` 结构条目，`视觉` tab 的全局 `stylePrompt` 可继续编辑并真实写回 `projectVisualBible/compositeSettings`，同一批真实 shot 已能直接进入 `Shot Planning -> create queue`，且 `ProductionRunQueuePanel` 会在当前 provider 合同下把首条阻塞原因、修复提示、设置入口以及可达的设置面板显式露出，而不是沉默失败。2026-07-08 再补 3 条同机硬证据：1) 给定 DashScope 会话 Key后，同一条真实 UI smoke 已证明 `create queue -> 打开设置 -> 保存` 会把队列摘要收口到 `0 阻塞`，把开始按钮恢复成可点击的 `一键开始生产`，且点击后会真实进入 `生产任务执行中 / 运行中`，并出现共享 `BatchProgressBar` 的 `🖼️ 准备中... / 生成中...`；2) `Project Bible -> 角色卡 -> 三视图入口` 已可从真实生成出的 `林雾` 角色项直接打开，而 seeded `project-bible-character-view.spec.ts` 现已继续证明“三视图生成 -> 回写引用 shot.characterIdentities -> 跨新页恢复仍可见”；3) 同一条 seeded 浏览器链现又继续证明：恢复后的三视图 `front/side/backViewAssetId` 可直接进入 `Shot Planning -> create queue`，让 `production-preflight-summary` 收口到 `0 阻塞`，并可把队列真实推进到 `运行中`，随后首张分镜图会真实回写到 `shot.generatedImageAssetId/generatedImageNodeId`、对应 `ai-generated-image` 节点和资产库，说明这批资产不只“可见”，而且已被下游生产预检与执行入口真正消费；同时 `apps/web/src/app/canvas/utils/imageGeneration.ts` 已在 `startrails_use_mock=true` 时前端短路返回 mock 图片，恢复链 / 桥接链不再误打真实 `/api/ai/generate-image`。与此同时，恢复后的 `front/side/backViewAssetId` 也已被 `Auto Agent`、`productionPreflight` 与 `productionPreflightFix` 统一视作有效角色锚点，不再因 URL 尚未 hydrate 就误报“缺少参考图/角色锚点”。同日默认 dedicated real image smoke 也再次 `1 passed / 1.9m`，并已把 `queue image writeback` 长测独立到 `STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE=1`，不再混进默认 real image 回归。当前剩余观察点已从“是否能通”收窄为“真实 UI 长链的等待预算与长期波动”，以及长中文创意 prompt 仍可能因外部 provider `524` 退化到可重试 prompt；图片分支暂仍不宣称 `roundtrip verified` | `apps/web/src/app/canvas/components/chat/ChatPanel.tsx`, `apps/web/src/app/canvas/utils/autoAgentService.ts`, `apps/web/src/app/canvas/utils/imageGeneration.ts`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/lib/ai/normalizeGenerationError.ts`, `apps/web/src/app/api/ai/generate-image/route.ts`, `apps/web/src/app/canvas/components/panels/ProjectBiblePanel.tsx`, `apps/web/src/app/canvas/components/canvas/CharacterViewModal.tsx`, `apps/web/src/app/canvas/hooks/useCanvasPersistence.ts`, `apps/web/src/lib/storyboard/productionPreflight.ts`, `apps/web/src/lib/storyboard/productionPreflightFix.ts`, `apps/web/src/features/production/ShotPlanningPanel.tsx` | `apps/web/e2e/auto-agent-clarification.spec.ts`, `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/chat-clarification-resume.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/e2e/character-view-modal.spec.ts`, `apps/web/src/app/canvas/hooks/useCanvasPersistence.test.ts`, `apps/web/src/app/canvas/utils/autoAgentService.test.ts`, `apps/web/src/app/canvas/utils/autoAgentService.real.test.ts`, `apps/web/src/app/canvas/utils/imageGeneration.test.ts`, `apps/web/src/lib/ai/normalizeGenerationError.test.ts`, `apps/web/src/lib/storyboard/productionPreflight.test.ts`, `apps/web/src/lib/storyboard/productionPreflightFix.test.ts` |
| 2 | 生产队列到最终交付物的统一闭环（本轮已补最终成片本地回收） | `roundtrip verified` | 这条链决定“能不能交付”，因此保留高位，便于继续补真实 provider 长任务与失败归因证据 | 已达成：生产队列可完成并导出最终交付包；并已修正 `先生成分镜图 -> 再生成视频` 时本地 blob 首帧图缺少 `assetId` 回写、导致队列“部分失败”的共享根因；本轮继续把真实视频生成结果统一回收到本地媒体资产层，自动回写 `assetId / persistence`，且恢复链已覆盖 `video-generation / video-result / talking-photo / video` 等生成型视频节点。2026-07-08 又补上同机真实专项证据：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 的 `real provider queue smoke writes first storyboard image back into shot node + asset library` 已在 `http://127.0.0.1:3172 -> copse.top/v1` 上 `1 passed / 1.2m`，证明 `Shot Planning -> create queue -> start` 后的首张真实分镜图现在会同时写回 `shot.generatedImageAssetId/generatedImageNodeId`、对应 `ai-generated-image` 节点和资产库，而不再只停在 node 层；随后 `apps/web/e2e/project-bible-character-view.spec.ts` 又继续证明这批恢复后再生产得到的 `shot.generatedImageAssetId/generatedImageNodeId` 与关联 `ai-generated-image` 节点可以继续进入项目包导出，不会在交接包里丢失。`production-run-queue.spec.ts` 的 5 条浏览器链、`run-queue-executor-bridge.spec.ts` 的 2 条桥接链、`production-run-jianying-export.spec.ts` 的导出链、`production-run-project-package-roundtrip.spec.ts` 的“项目包恢复后再次导出剪映 ZIP”长链，以及 `full-pipeline.spec.ts` 的视频节点 `blob + assetId + persistence` 证据都已验真。剩余观察点是真实 provider 的长任务、批量任务与失败归因 | `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`, `apps/web/src/app/canvas/hooks/useProductionRunExecutor.ts`, `apps/web/src/lib/storyboard/productionRunQueue.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.ts`, `apps/web/src/app/canvas/hooks/useCanvasPersistence.ts`, `apps/web/src/app/canvas/utils/videoGenerationService.ts`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/production-run-queue.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/e2e/auto-agent-creative-production-handoff.spec.ts`, `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`, `apps/web/e2e/project-bible-character-view.spec.ts`, `apps/web/src/app/canvas/utils/videoGenerationService.test.ts`, `apps/web/src/app/canvas/hooks/useCanvasPersistence.test.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.test.ts` |
| 3 | Shot Planning Board -> 大批量真实生产 -> 导出交付（本轮已补 bridge 真执行） | `roundtrip verified` | 这是“从规划到生产”的主链路，因此需要明确它现在真实闭环到了哪一步 | 已达成：从规划板标记 ready 镜头 -> 生成执行队列 -> 通过 source shot 回查复用共享生产链，桥接后默认生成 `分镜图 -> 视频 -> 配音 -> 字幕` 多步任务 -> 跑通执行与导出剪映兼容交接包；`shot-planning-run-queue-bridge.spec.ts` 已是 `3 passed (4.0m)`，`run-queue-executor-bridge.spec.ts` 已是 `2 passed (2.2m)`。剩余观察点是真实 provider 的批量长任务、最终成片文件回收与失败归因 | `apps/web/src/features/production/ShotPlanningPanel.tsx`, `apps/web/src/features/production/shotPlanningRunQueueAdapter.ts`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts` | `apps/web/e2e/shot-planning-board.spec.ts`, `apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/src/app/canvas/utils/jianyingDraftExport.extract.test.ts` |
| 4 | Provider smoke 从分项试跑提升到“可正式开工判定”（本轮已收口主表达） | `roundtrip verified` | 现在不只知道某个 provider 能不能跑，还能在设置页直接看到“可正式开工 / 项阻塞 / 项注意” | 已达成：设置页可根据 health + smoke 给出正式开工判定，并覆盖 ready / blocked / 显式授权 smoke / 产物导回画布等主场景；剩余观察点是更多真实 provider 组合与长期任务成本证明 | `apps/web/src/lib/ai/providerSmoke.ts`, `apps/web/src/lib/ai/providerSmokeResult.ts`, `apps/web/src/lib/ai/provider-health-summary.ts`, `apps/web/src/lib/ai/taskReadiness.ts`, `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx` | `apps/web/e2e/provider-health-summary.spec.ts`, `apps/web/src/lib/ai/provider-health-summary.test.ts`, `apps/web/src/lib/ai/taskReadiness.test.ts` |
| 5 | 参考视频逆向分镜与爆款结构拆解统一入口（本轮已收口主入口） | `roundtrip verified` | 参考视频现在已有单一主入口，用户不再需要先猜“该点逆向分镜还是结构拆解” | 已达成：空画布与主工作流都可从“导入参考视频 / 参考视频分析”进入统一入口，再分流到分镜草稿或结构拆解；2026-07-13 已 fresh 跑通统一入口、剧本导入、调色入口的 `create-flow.spec.ts` `4/4`。剩余观察点是 Add Node 入口专项验证 | `apps/web/src/app/canvas/components/canvas/EmptyCanvasGuide.tsx`, `apps/web/src/app/canvas/components/panels/ReferenceVideoEntryPanel.tsx`, `apps/web/src/features/reverse-storyboard/ReverseStoryboardPanel.tsx`, `apps/web/src/app/canvas/components/panels/VideoRemixPanel.tsx`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/create-flow.spec.ts`, `apps/web/e2e/demo-screenshots.spec.ts` |
| 6 | 爆款结构拆解结果继续进入真实生产链（本轮已延伸到交付层） | `roundtrip verified`（局部） | 结构拆解不再只停在“分析资产”，而是能直接派生出可继续生产、并可导出交接物的下游对象 | 已达成：`remix-analysis` 节点可一键派生复刻提示词、参考分镜节点、生产队列；生产队列完成后还能直接导出 `分镜表.csv`，且来源类型/时间码已进入交接物。剩余观察点是把这条链再延长到真视频生成/成片交付 | `apps/web/src/app/canvas/components/menus/NodeContextMenu.tsx`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.ts`, `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts`, `apps/web/src/lib/storyboard/storyboardExportFormats.ts` | `apps/web/e2e/remix-analysis-derivation.spec.ts`, `apps/web/src/app/canvas/utils/remixAnalysisArtifacts.test.ts` |
| 7 | 本地图片/媒体到 provider 可访问 URL 的通用桥接层 | `roundtrip verified`（局部） | reverse-prompt 主链已通，`image-to-video` 上游图片桥接已通，手动 `generate-video-clip` 首帧图路径已补桥接，shot 右键“重绘本镜头”也已收口到统一持久化/回写链；本轮继续把 `reverse-prompt / talking-photo / focus-edit / upscale` 的上游取图统一收口到 `selectFirstCanvasImageSource`，避免 stale blob preview 抢走 `generatedImageUrl` | 本地图片、视频、音频等素材都能稳定进入需要远程 URL / base64 输入的 provider，不靠单点特判；当前新增浏览器证据已证明 `upscale / focus-edit / talking-photo` 在图片输入上都会优先吃 provider 可读图，且 `talking-photo` 上传音频路径也已验证会把本地音频资产桥接成 `data:audio/...` | `apps/web/src/app/canvas/utils/providerMediaDataUrl.ts`, `apps/web/src/app/canvas/utils/reversePromptNodeAction.ts`, `apps/web/src/app/canvas/utils/videoSourceImage.ts`, `apps/web/src/app/canvas/utils/talkingPhotoService.ts`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/lib/assets/`, `apps/web/src/lib/storyboard/createShotImageArtifacts.ts` | `apps/web/e2e/uploaded-image-reverse-prompt.spec.ts`, `apps/web/e2e/upscale-provider-media-bridge.spec.ts`, `apps/web/e2e/focus-edit-provider-media-bridge.spec.ts`, `apps/web/e2e/talking-photo-provider-media-bridge.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/src/app/canvas/utils/providerMediaDataUrl.test.ts`, `apps/web/src/app/canvas/utils/videoSourceImage.test.ts`, `apps/web/src/app/canvas/utils/talkingPhotoService.test.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.test.ts` |
| 8 | 剪映/交接包之外的结构化导出入口补齐 | `roundtrip verified`（局部） | 结构化导出入口已接到主 toolbar，下拉可直接导出剧本 / 分镜表 / 角色表，且浏览器级下载已验真 | 已达成：用户可发现、可操作、可拿到真实文件；剩余缺口是 PDF/打印层更强交付，以及导出物再导回工作流的恢复链 | `apps/web/src/lib/storyboard/storyboardExportFormats.ts`, `apps/web/src/app/canvas/components/toolbar/ExportDropdown.tsx`, `apps/web/src/app/canvas/StarCanvas.tsx` | `apps/web/e2e/structured-export-downloads.spec.ts`, `apps/web/src/lib/storyboard/storyboardExportFormats.test.ts` |
| 9 | 剪映导出能力边界写实并扩展到 PDF / Excel / 音频字幕视频交付层 | `roundtrip verified`（JSON/ZIP + 单/双片段 MP4） | 当前最容易被误说成“导出完成”；实际已完成 JSON/ZIP 和单/双片段浏览器 MP4，仍未完成所有交付形态 | 文档和 UI 都明确边界；如继续扩展，优先补 PDF/Excel、音频、字幕合成 | `apps/web/src/app/canvas/components/panels/ExportPreflightPanel.tsx`, `apps/web/src/app/canvas/utils/jianyingDraftExport.ts`, `apps/web/src/app/canvas/utils/videoCompositionBrowser.ts`, `apps/web/src/app/canvas/components/nodes/WorkflowNode.tsx` | `apps/web/e2e/jianying-export.spec.ts`, `apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/browser-video-composition.spec.ts`, `apps/web/src/app/canvas/utils/videoCompositionPlan.test.ts` |
| 10 | 画布大组件耦合与帮助文案/真实入口一致性治理 | `roundtrip verified`（局部） | 这不是最显眼的功能缺口，但它是反复误判和 UI 体验割裂的来源之一 | 已继续收口：quick-add 搜索入口 6 条浏览器证据已恢复，并确认首页 -> 进入编辑器、Dashboard -> 新建项目 -> 进入画布、文本节点保存后刷新恢复，以及右键删除 -> 刷新仍为空画布均可达；文本/分镜节点右键菜单高度也已按真实操作项修正，低位菜单可滚入并点击删除。同时把旧 E2E 从动作型 pane 鼠标事件 / 持续型 `addInitScript` 清库，收口到共享 `gotoCanvas` + 原生事件触发 + 单次清库。剩余工作仍是帮助文案、入口名称、真实可执行能力一致，以及逐步把 `StarCanvas.tsx` 巨型耦合拆小 | `apps/web/src/app/canvas/StarCanvas.tsx`, `apps/web/src/app/canvas/components/toolbar/AddNodePanel.tsx`, `apps/web/src/app/canvas/components/chat/ChatInput.tsx`, `apps/web/src/app/canvas/components/menus/NodeContextMenu.tsx`, `apps/web/e2e/canvas-quick-add-node-search.spec.ts`, `apps/web/e2e/core-workflow-smoke.spec.ts` | `apps/web/e2e/canvas-minimap.spec.ts`, `apps/web/e2e/canvas-quick-add-node-search.spec.ts`, `apps/web/e2e/core-workflow-smoke.spec.ts`, `apps/web/e2e/node-delete-persistence.spec.ts` |

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

## 9. 主仓、工作树与历史碎片边界（2026-07-11）

- 唯一运行时事实源：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`。
- `02_WORKTREES/skill-workbench-kernel` 是独立 kernel/profile 实验线，不直接并入当前个人发布候选。
- Quick Add、Poster Editor、Shot Parameter Panel 等历史 feature 分支的实现已在当前工作树中，不再重复迁移。
- `docs/capability-map-and-lovart-gap`、`docs/shot-planning-board-followups`、`docs/starcanvas-ux-benchmark` 保留为历史调研/截图证据；当前能力结论仍以本文和 `error-ledger.md` 为准。
- `.serena/` 与 `apps/web/src/graphify-out/` 为本地工具状态/索引缓存，不是产品源码，已加入 ignore，未删除本地文件。
- 旧 Codex 副本中的 Preview Draft Transaction 已按当前主仓架构迁回；状态单测、布局单测与 production E2E 均通过，详见 `EL-074`。
