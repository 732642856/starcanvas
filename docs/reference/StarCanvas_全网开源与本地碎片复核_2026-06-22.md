# StarCanvas 全网开源与本地碎片复核

> 日期：2026-06-22  
> 目的：回应“先全网检索、再地毯式探索本地碎片、优先复用可用开源代码”的工作要求。  
> 原则：MIT / Apache / BSD 可优先集成；AGPL / GPL 只做产品和架构参考，不直接复制代码。

## 1. 本轮已检索/复核的外部开源方向

| 项目 | 许可证判断 | 核心能力 | 对 StarCanvas 的价值 | 处理建议 |
|---|---:|---|---|---|
| PenShot | MIT | 剧本解析、多 Agent 分镜、模型就绪 Prompt、多级记忆、Chroma 检索、SDK/REST/MCP | 与“剧本到镜头级生视频 Prompt”和连续性追溯高度重合 | 优先研究 `src/penshot` 的输出 schema、任务状态、记忆结构；可直接集成 Python SDK 或移植数据结构 |
| ai-short-drama / AIDrama Studio | MIT | 小说/剧本到短剧：角色、场景、分镜、视频、配音、Remotion、BullMQ 队列 | 对“端到端短剧生产流水线”最直接 | 深读 Next API、Prisma schema、BullMQ worker、Remotion 编辑器；可复用架构/部分代码，需逐文件确认许可证头 |
| ComfyUI_frontend | GPL/Comfy 生态，谨慎 | Queue/History sidebar、节点库、搜索、键盘快捷键、mask editor、分组/折叠 | 适合对标节点式工作台 UX、队列和历史面板 | 不直接复制；参考交互和测试结构，StarCanvas 自研实现 |
| Moyin Creator | AGPL-3.0 | 剧本→角色→场景→导演→Seedance 2.0，多模态引用，参数约束，批量队列 | 功能清单非常贴近“AI 影视生产级工具” | 不复制代码；提炼功能矩阵：多镜头合并、@Image/@Video/@Audio 引用、Seedance 约束校验 |
| ArcReel | AGPL-3.0 | 小说→剧本→角色/线索→分镜→视频→剪映；多供应商、成本预估、版本回滚、队列 | 对多供应商、生图/生视频后端、费用追踪最有价值 | 不复制代码；参考 provider 协议、项目级供应商选择、费用估算、版本回滚 |
| xyflow | MIT | React Flow 基础库和高级节点图能力 | StarCanvas 已基于它，仍可继续吸收 examples | 优先复用官方 API；重点看 subflow/group、selection、node toolbar |
| tldraw | Apache-2.0 / 商业条款需逐项确认 | 高质量画布、形状 store、协作、历史、嵌入、schema 迁移 | 对白板/画布稳定性和 schema 迁移有参考价值 | 不整体迁移；研究 store/schema/history 的设计 |
| Excalidraw | MIT | 手绘、协作、导入导出、场景数据 | 对草图节点、手绘资产、导出格式有价值 | 可借鉴数据结构与导出逻辑，避免整体 UI 迁移 |

## 2. 本地 StarCanvas 相关碎片目录

| 路径 | 类型 | 本轮判断 |
|---|---|---|
| `/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas` | 当前主干 | 后续实现默认目标。已有大量未提交改动，不能回滚。 |
| `/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_开发版/starcanvas` | 开发版副本 | 有早期 `packages/canvas`、`DrawNode`、若干 UI 原型；多数已被主干吸收，但仍需按文件差异复核。 |
| `/Users/wuyongnaren/Projects/StarCanvas/02_ARCHIVE_历史版本/V1-tx_star-canvas` | 历史版 | 主要保留 monorepo 初始结构和 provider/shared/canvas 包。 |
| `/Users/wuyongnaren/Projects/StarCanvas/02_ARCHIVE_历史版本/V0-old_creative-canvas` | 更早历史版 | 有 billing/provider/canvas 早期包和启动脚本，可参考但价值低于主干/Codex21。 |
| `/Users/wuyongnaren/Documents/Codex/2026-06-18/new-chat-4/work/starcanvas-active` | Codex 工作副本 | 和主干高度重叠，是此前多次实现来源之一。 |
| `/Users/wuyongnaren/Documents/Codex/2026-06-21/starcanvas-https-github-com-732642856-starcanvas/work/starcanvas` | Codex 工作副本 | 包含大量主干同源文件，也有 `characterAstrologyService.ts`、`instrumentation-client.ts` 等碎片。 |
| `/Users/wuyongnaren/Desktop/星轨画布文件库/star-canvas-files` | 桌面碎片 | 保留 `HistoryPanel`、`VideoAnalysisPreview`、执行计划、视频元数据、mock analyzer 原型。 |
| `/Users/wuyongnaren/Projects/StarCanvas/03_REFERENCES_参考资料/open-source-bug-testing-lab` | 外部参考库 | 已含 excalidraw、tldraw、xyflow、comfyui-frontend、ai-short-drama、penshot、moyin-creator、arcreel 等，应作为后续对标的第一入口。 |

## 3. 已确认的功能漏项/不足

1. **真实端到端 AI 影片流水线还不完整**：已有分镜、预检、队列雏形，但距离 ai-short-drama / ArcReel 的“剧本→角色→场景→分镜→生图→生视频→配音→合成/剪映”仍缺统一项目级流水线。
2. **多供应商生视频能力不足**：StarCanvas 当前真实链路主要偏 Vidu/已有封装，Seedance/Kling/Runway/Sora/Veo 等仍需统一 provider 协议和能力约束。
3. **费用预估/配额/生成前成本门禁不足**：ArcReel/Moyin 都强调成本和参数限制；StarCanvas 只有部分用量追踪，缺镜头级预估与批量投产预算。
4. **角色/场景/道具资产的跨镜头引用还不够硬**：已做角色锚点预检，但缺“项目资产图 → 每镜头引用包 → 模型 payload”的强约束链路。
5. **队列与历史面板仍偏轻**：ComfyUI/ArcReel 都有 Queue/History/版本回滚；StarCanvas 有运行历史但未形成生产级投产台。
6. **视频合成/成片链路仍需加深**：已有剪映导出和部分视频合成工具，但未达到 Remotion/FFmpeg/剪映草稿多出口的完整生产能力。
7. **自动修复草案仍是确定性启发式**：已能补草案，但还未接模型增强、项目 Bible、角色/场景资产库上下文。
8. **紫微/命理角色设计碎片未纳入主线**：历史报告指出主干缺实现；Codex21 出现 `characterAstrologyService.ts`，需复核是否可迁移。

## 4. 可复用优先级

### P0：下一步必须优先

1. **自动重算预检闭环**：草案应用后重新计算该镜头状态，阻塞项从队列/导出预检中消失或降级。
2. **ai-short-drama / PenShot 输出 schema 对接研究**：把“剧本→标准分镜 Prompt”做成明确 adapter，而不是继续手写零散 prompt。
3. **多供应商能力约束表**：借鉴 Moyin/ArcReel，把 Seedance/Vidu/Kling/Veo/Sora 的输入限制、时长、参考图/视频/音频数量、费用字段统一成 `VideoProviderCapability`。
   - 2026-06-22 已新增 `apps/web/src/lib/ai/video-provider-capabilities.ts`：先覆盖 Vidu/Seedance/Kling/Runway/OpenAI Sora/LTX/mock 的 dry-run 合同，并加入 `evidenceLevel` 区分官方文档、本地实现、开源参考和待复核供应商；真实 API 接线前必须继续核验各厂商官方参数。

### P1：紧随其后

4. **生产队列增强**：参考 ComfyUI/ArcReel，加入等待/运行/失败/重试/跳过/历史/版本快照的统一面板。
5. **项目资产引用包**：把角色、场景、道具、参考帧打包进每个 shot 的 generation payload。
6. **成本预估与预算门禁**：生成前提示预计费用、失败重试成本、批量队列总成本。

### P2：后续补齐

7. **Remotion/FFmpeg/剪映三出口**：导出视频预览、可复现合成脚本、剪映项目包。
8. **角色命理服务复核迁移**：检查 Codex21 `characterAstrologyService.ts` 和历史设计，决定是否进入角色 Bible。
9. **画布 schema 迁移/历史稳定性**：参考 tldraw/Excalidraw，补版本迁移和损坏恢复。

## 5. 后续工作约束

- 每个新功能动手前，先查 `03_REFERENCES_参考资料/open-source-bug-testing-lab` 是否已有可复用实现。
- MIT/Apache/BSD 项目优先读源码；AGPL/GPL 项目只做交互和架构参考。
- 每次涉及 StarCanvas 现有能力，先查主干、开发版、Codex18、Codex21、桌面碎片是否已有实现。
- 不再只做 UI 表面：所有新增能力至少要有数据结构、预检/错误状态、测试或可验证路径。
