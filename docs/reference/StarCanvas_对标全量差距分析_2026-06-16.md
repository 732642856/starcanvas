# StarCanvas 对标全量差距分析报告

> 日期：2026-06-16
> 范围：基于最新代码地毯扫描 + TapNow / 小云雀 2.0 / ArcReel / Moyin Creator / Kitsu 全量功能对标
> 原则：逐功能对照，标注"已有/部分/缺失"，给出可复用代码路径

---

## 一、StarCanvas 当前全量盘点

### 1.1 代码规模
| 指标 | 数值 |
|------|------|
| TypeScript 源文件 | 230+ |
| 节点类型 | 19 种 |
| 面板组件 | 22 个 |
| Canvas 工具组件 | 15 个 |
| API 路由 | 22 个 |
| Zustand stores | 7 个 |
| 自定义 hooks | 11 个 |
| 单元测试 | 52 个文件 (547 pass) |
| e2e 测试 | 11 个文件 (13/16 pass) |
| lib 模块 | 15 个目录 |

### 1.2 节点类型清单
```
AgentNode, AngleControlPanel, AudioWaveform, BatchProgressBar,
BgmPanel, CinemaLabPanel, ContentNode, ContinuityReportNode,
ImageNode, NodeRunStatusIndicator, PoseEditor, ShotNode,
SketchNode, StoryboardGridNode, TransitionPicker, VideoNode,
VoicePanel, WorkflowNode
```

### 1.3 面板清单（按功能域）

**创作层 (Creation):**
- ScriptImportPanel — 剧本导入 (PDF/DOCX/TXT)
- ContentNode — 富文本写作
- AddNodePanel — 节点创建入口
- EmotionCurvePanel — 情感曲线

**Bible 体系:**
- CharacterBiblePanel, SceneBiblePanel, ProjectBiblePanel
- VisualStyleBiblePanel, StyleLibraryPanel (30+ 风格 / 7 分类)
- CharacterViewPanel + CharacterViewModal (角色三视图)

**影视参数:**
- CinematicParamPanel, ParamControlPanel
- ColorGradePanel, PanoramaPanel (720°, react-pannellum)
- Camera control (via API)

**分镜:**
- ShotNode, StoryboardGridNode
- ShotListTable, StoryboardShotEditorPanel
- ChainGeneratePanel

**资产:**
- AssetLibraryPanel, CharacterAssetLibraryPanel
- BackgroundRemoverPanel, PoseReferenceEditor
- DraggableAngleControl

**导出:**
- ExportPreflightPanel, ExportDropdown
- jianyingDraftExport (剪映草稿)
- StoryboardExportFormats (PDF/JSON/CSV)
- ProjectPackageManifest

**工作流/Agent:**
- WorkflowNode, WorkflowRunPanel, WorkflowRunNodeRow
- WorkflowTemplatesDialog
- CrewAgentPanel
- ProductionRunQueuePanel

**交互:**
- ChatPanel + ChatInput + AgentModeSwitcher
- AssetPreviewPopover + ChatAttachmentPreview + SlashCommandMenu
- CanvasContextMenu, NodeContextMenu, EdgeContextMenu
- ImageHoverToolbar, SelectionToolbar, BibleDropdown

**基础设施:**
- EmptyCanvasGuide, FocusEditPanel, BatchActionPanel
- CanvasDiagnosticsPanel, StoryboardBatchProgressOverlay
- CanvasDropOverlay

### 1.4 API 路由清单
```
/ai/health                — 健康检查
/ai/chat + /chat/stream   — AI 对话 (SSE)
/ai/config                — AI 配置
/ai/bible-director        — Bible 导演 Agent
/ai/camera-control        — 运镜控制
/ai/crew/run              — Crew Agent 运行
/ai/focus-edit            — 焦点编辑
/ai/generate-image + -ideogram  — 图像生成
/ai/generate-character-view      — 角色视图生成
/ai/generate-moodboard           — 情绪板
/ai/generate-panorama            — 全景生成
/ai/generate-poster              — 海报
/ai/generate-video + -vidu       — 视频生成
/ai/generate-with-pose           — 姿态生图
/ai/remix-analysis               — 混音分析
/ai/reverse-prompt               — 反向提示词
/ai/talking-photo                — 开口说话
/ai/tts                          — 语音合成
/ai/upscale                      — 超分辨率
```

### 1.5 lib 模块清单
```
agents/              — Film crew agents (orchestrator)
ai/                  — AI client, providers, prompt tools
assets/              — localImageStore
cinematic/           — cinematic rules, prompt analyzer
dev/                 — whyDidYouRender
documents/           — textDocumentImport
images/              — objectUrlRegistry, prepareReferenceImage
jianying/            — 剪映草稿导出
memory/              — supermemory
scheduler/           — DAG scheduler
services/            — characterViewService
slashCommands/       — slash command executor
storage/             — sanitizePersistedCanvas
storyboard/          — 13 个 storyboard 工具模块
styles/              — styleLibrary
```

---

## 二、对标产品全量功能对比

### 2.1 TapNow (tapnow.ai)

> 2025 年上线，全球首个"专业影视流程工具化"AI 视觉创作平台。
> 闭源商业产品，采用订阅+点数模式。

| 功能 | TapNow 能力 | StarCanvas 状态 | 差距 |
|------|-----------|----------------|------|
| **TapFlow 画布** | 节点式可视化流程，拖拽"文本→图像→视频→音频"节点 | ✅ 已有 React Flow 画布 + 19 种节点 | 相当 |
| **多模型中枢** | 15+ 模型任意切换 (Veo3/Sora2/Kling/MJ/Flux/Gemini...) | ✅ 22 个 API 路由覆盖多供应商 | 相当 |
| **一键拉片** | 上传参考视频→AI 反向拆解→可编辑分镜表+提示词 | ❌ 完全缺失 | **P0 差距** |
| **高保真一致性** | Banana 模型驱动跨镜头"零变脸" | ⚠️ CharacterBible 体系 + 角色三视图，但未到"零变脸"级别 | 部分 |
| **电商极速套图** | 2min 出 20 张主图+详情页 | ❌ N/A (非目标场景) | 不适用 |
| **社区模板 (TapTV)** | 百万级商业案例，一键克隆再创作 | ❌ 完全缺失 | **P0 差距** |
| **音画同步** | 自动配音/配乐，48kHz 商用版权曲库 | ⚠️ TTS API + BgmPanel，但无自动配乐 | 部分 |
| **专业级镜头控制** | 8 种摄影机 (ARRI/RED/Sony) + 10 种镜头 + 光圈/焦距模拟 | ⚠️ CinematicParamPanel + camera-control API，无摄影机/镜头库 | 部分 |
| **多角度镜头控制** | 3D 立方体拖动设置旋转/俯仰/缩放 | ⚠️ DraggableAngleControl，但无 3D 立方体交互 | 部分 |
| **影棚级灯光控制** | 全局亮度/色温/主光位置/轮廓光 | ⚠️ CinematicParamPanel 有参数，无交互式灯光面板 | 部分 |
| **视频对象替换** | 替换视频主角，保留光照/运动/构图 | ❌ 完全缺失 | **P1 差距** |
| **局部重绘** | 选中区域精确重绘 | ⚠️ FocusEditPanel + focus-edit API，功能相近 | 部分 |
| **多模型调度** | 按需跨模型调用取长补短 | ✅ provider-registry + multi-vendor API | 相当 |

### 2.2 小云雀短剧 Agent 2.0

> 字节跳动旗下，首个搭载 Seedance 2.0 的短剧 Agent。2026-03 上线 1.0，2026-06 全量 2.0。

| 功能 | 小云雀 2.0 能力 | StarCanvas 状态 | 差距 |
|------|----------------|----------------|------|
| **100+ 影视级画风** | 真人/韩漫/3D 等 100+ 风格 + 自定义 | ✅ StyleLibraryPanel (30+ 风格 / 7 分类) | **需扩充至 100+** |
| **720° 全景** | 单角度场景图→完整 720° 全景，自由截取角度 | ✅ PanoramaPanel (react-pannellum, 812 行) | 已完成 ✓ |
| **角色三视图锁定** | 角色形象设计→锁定参照→分镜引用 | ✅ CharacterViewModal + CharacterViewPanel | 已完成 ✓ |
| **参数化面板** | 独立光影/镜头/画风参数面板 | ✅ ParamControlPanel + CinematicParamPanel | 已完成 ✓ |
| **@ 资产调用** | 分镜中 @ 引用角色/场景资产 | ✅ AssetPreviewPopover + ChatPanel mention | 已完成 ✓ |
| **剪映打通** | 直接导出剪映草稿 | ✅ jianyingDraftExport | 已完成 ✓ |
| **资产创作画布** | 节点式资产编辑：人物妆造/场景布光/镜头调度 | ⚠️ 有画布但非专门的资产设计工作流 | **P1 差距** |
| **光影控制面板** | 方位/亮度/质感/色温 → 预设打光 | ⚠️ CinematicParamPanel 有参数，无交互式布光 | 部分 |
| **镜头控制面板** | 水平角度/垂直角度/景别 → 机位参考图 | ⚠️ camera-control API + DraggableAngleControl | 部分 |
| **资产联动** | 改一个角色→全局同步，版本管理 | ⚠️ CharacterAssetLibrary 有基础，但无全局自动同步 | 部分 |
| **首尾帧参考** | 严格控制画面起止帧 | ❌ 缺失 | **P1 差距** |
| **片段续播** | 基于前一段视频继续生成 | ❌ 缺失 | P2 差距 |
| **字幕擦除** | 一键去除画面字幕 | ❌ 缺失 | P2 差距 |
| **画面截取** | 一键截取视频任意帧 | ❌ 缺失 | P2 差距 |
| **AI 生剧本** | 一句话→100 集剧本+人物小传+分镜 | ❌ 缺失 | **P1 差距** |
| **跳过剧本** | 从角色/场景开始创作（非流程化） | ❌ 缺失 | P2 差距 |
| **智能剧本解析** | 上传→自动提取人物/场景/情节 | ⚠️ ScriptImportPanel 有基础解析，但无 AI 提取 | 部分 |
| **多剧集生产** | 99 集 200 分钟，资产自动同步 | ❌ 完全缺失 | **P0 差距** |
| **团队协作** | 分镜师→导演审批→修改→全局同步 | ❌ 完全缺失 | P2 差距 |
| **创作激励计划** | 雀光大赏/出海逐浪 | ❌ N/A (开源项目) | 不适用 |

### 2.3 ArcReel (开源 AGPL-3.0)

> 2.5k stars，AI Agent 驱动视频生成工作台。小说→角色→剧本→分镜→视频。

| 功能 | ArcReel 能力 | StarCanvas 状态 | 差距 |
|------|-------------|----------------|------|
| **多 Agent 编排** | Claude Agent SDK + SessionManager + sandbox | ✅ film-crew-agents + orchestrator | 相当 |
| **小说→角色→剧本→分镜→视频** | 全链路 Agent 自动化 | ✅ 12 步管线 + workflow templates | 相当 |
| **跨镜头一致性** | 角色/场景一致性保障 | ⚠️ CharacterBible 体系，未到生产级 | 部分 |
| **多供应商** | Kling/Veo/Nano Banana/Grok/Seedance/OpenAI/Vidu | ✅ 22 API routes 覆盖多数供应商 | 相当 |
| **API Key 管理** | 完整生命周期管理 | ⚠️ provider-config 有基础 | 部分 |
| **Docker 部署** | 多阶段 Dockerfile + compose | ❌ 缺失 | P2 差距 |
| **JWT 认证** | 登录/中间件/令牌 | ❌ 缺失 | P2 差距 |
| **多语言** | 中/英/越南语 | ❌ 仅中文 | P2 差距 |
| **沙箱 Agent** | Agent 安全隔离 | ❌ 缺失 | P2 差距 |

### 2.4 Moyin Creator (开源 AGPL-3.0)

> Electron 30 + React 18 + Zustand，AI 影视生产级工具。

| 功能 | Moyin Creator 能力 | StarCanvas 状态 | 差距 |
|------|-------------------|----------------|------|
| **六层身份锚点** | 角色一致性深度绑定 | ⚠️ identity-anchors 类型定义有，但未完全实现 | 部分 |
| **运镜控制网格** | 可视化运镜调度 | ⚠️ DraggableAngleControl + camera API | 部分 |
| **Electron 桌面端** | 原生桌面应用 | ❌ Web only | P3 (可选) |
| **批量视频生产** | 规模化产出 | ⚠️ ProductionRunQueuePanel 有框架 | 部分 |

### 2.5 Kitsu (开源 AGPL-3.0)

> 动画/VFX/游戏制作跟踪平台。可作为管理层对标。

| 功能 | Kitsu 能力 | StarCanvas 状态 | 差距 |
|------|-----------|----------------|------|
| **制作跟踪** | 任务分配/进度/审阅/批准 | ❌ 完全缺失 | P2 差距 |
| **资产管理** | 统一资产数据库/版本/血缘 | ⚠️ AssetLibrary + characterAssetLibrary，无版本/血缘 | 部分 |
| **协作工作流** | 多角色权限/评论/通知 | ❌ 完全缺失 | P2 差距 |
| **实时同步** | WebSocket 实时通知 | ❌ 缺失 | P3 |

---

## 三、旧副本文件碎片排查

### 3.1 多副本差异分析
| 副本 | 路径 | 与 main 差异 |
|------|------|-------------|
| 01_MAIN_主干 | `~/Projects/StarCanvas/01_MAIN_主干/starcanvas` | **源仓库**，1fc9e90，最新 |
| 01_MAIN_开发版 | `~/Projects/StarCanvas/01_MAIN_开发版/starcanvas` | **落后 main** 大量文件，旧提交 b747129 |
| WorkBuddy 副本 | `~/WorkBuddy/2026-06-09-08-25-17/starcanvas` | 另一次会话的克隆，状态不确定 |
| 02_ARCHIVE | `~/Projects/StarCanvas/02_ARCHIVE_历史版本/` | V0 (old_creative-canvas) + V1 (tx_star-canvas)，历史参考 |
| 03_REFERENCES | `~/Projects/StarCanvas/03_REFERENCES_参考资料/` | open-source-lab (13 个项目) + 可复用分析报告 |
| Desktop Audit | `~/Desktop/StarCanvas Audit Round2 2026-05-23/` | Round2 审计数据 (JSON) |

### 3.2 开发版独有文件（已确认落后，非碎片）
开发版比主干少 50+ 文件（全部 API 路由、Canvas 组件、Chat 组件等），是**旧版本**。主干所有文件包含开发版全部内容。

### 3.3 建议清理
| 目录 | 大小 | 建议 |
|------|------|------|
| 01_MAIN_开发版 | ~1.6GB (含 node_modules) | 删除或归档到 02_ARCHIVE |
| WorkBuddy 副本 | ~1.6GB (含 node_modules) | 删除（临时会话克隆） |
| 02_ARCHIVE V0/V1 | ~500MB | 保留作为历史参考 |
| 03_REFERENCES 13 个 clone | ~2GB | 精简：保留 arcreel/comfyui-frontend/excalidraw/moyin-creator/tldraw/xyflow/huobao-drama-ai/ai-short-drama，删除其余 |

---

## 四、可复用开源代码清单

### 4.1 可直接 npm install 的包 (MIT)

| 包名 | 用途 | 集成位置 | 已集成? |
|------|------|---------|---------|
| `rgb-curve` | 曲线/色彩分级编辑器 | ColorGradePanel 增强 | ❌ 未集成 |
| `@xzdarcy/react-timeline-editor` | 时间线编辑器 | TimelinePanel | ✅ 已集成 |
| `leva` | 零配置参数面板 | CinemaLabPanel / ParamControlPanel | ❌ 未集成 |
| `chonky` | React 文件浏览器 | AssetLibraryPanel 增强 | ❌ 未集成 |

### 4.2 可复制代码的参考项目 (MIT)

| 来源 | 文件 | 用途 |
|------|------|------|
| Excalidraw | `shortcuts.ts` + `shortcut.ts` | 跨平台快捷键映射系统 |
| Excalidraw | action 注册模式 | 节点操作注册 |
| xyflow | XYDrag.ts autoPan | 拖拽优化参考 (已内置) |

### 4.3 可借鉴架构的项目 (GPL/AGPL — 不可复制代码)

| 来源 | 模块 | 借鉴方向 |
|------|------|---------|
| ComfyUI Frontend | fuseUtil.ts + nodeSearchService.ts | 高级搜索+过滤系统 |
| ComfyUI Frontend | queueStore.ts (不可变数据+单次飞航合并) | 队列管理优化 |
| ComfyUI Frontend | commandStore.ts | 命令注册/执行框架 |
| ArcReel | ClaudeAgentSDK + SessionManager | Agent 架构参考 |
| Moyin Creator | 六层身份锚点 | 角色一致性深度绑定 |
| Storyboard-Copilot | nodeRegistry 集中管理 | 节点注册架构 |

### 4.4 03_REFERENCES 已 clone 项目价值评估

| 项目 | 大小 | 价值 | 建议 |
|------|------|------|------|
| comfyui-frontend | ~200MB | ⭐⭐⭐ 搜索/队列/命令/快捷键 | 保留 |
| xyflow | ~100MB | ⭐⭐ React Flow 参考 | 保留 |
| excalidraw | ~150MB | ⭐⭐⭐ 快捷键/action/协作 | 保留 |
| tldraw | ~200MB | ⭐⭐ 无限画布参考 | 保留 |
| arcreel | ~100MB | ⭐⭐⭐ 多 Agent 架构 | 保留 |
| moyin-creator | ~100MB | ⭐⭐ 参数面板/运镜 | 保留 |
| huobao-drama-ai | ~50MB | ⭐⭐ AI 短剧参考 | 保留 |
| ai-short-drama | ~50MB | ⭐⭐ 多 Agent 管线 | 保留 |
| playwright | ~200MB | ⭐ e2e 参考 | 可删 |
| argos | ~50MB | ⭐ 视觉回归 | 可删 |
| msw | ~50MB | ⭐ API mock | 可删 |
| penshot | ~50MB | ⭐ 截图工具 | 可删 |
| chrome-devtools-mcp | ~50MB | ⭐ 浏览器工具 | 可删 |

---

## 五、P0 级差距（核心缺失，必须补齐）

### P0-1: 一键拉片 / 参考视频反向拆解
> 对标：TapNow "上传竞品 TVC → 秒级生成可编辑分镜表 + 提示词"

**当前状态：** StarCanvas 完全没有此功能。
**实现方案：**
- 新增 API: `/api/ai/reverse-storyboard` — 上传视频→AI 分析→输出分镜表
- 新增 Panel: `ReverseStoryboardPanel`
- 复用：video-analysis-recognizer、storyboardParser
- 可复用代码：ComfyUI 的 video 处理管线参考

### P0-2: 社区模板 / 工作流市场
> 对标：TapNow TapTV "百万级商业案例，一键克隆"

**当前状态：** WorkflowTemplatesDialog 只有硬编码模板，无可浏览/可克隆/可分享的模板市场。
**实现方案：**
- 新增 Store: `useTemplateMarketStore`
- 新增 Panel: `TemplateMarketPanel` — 浏览/预览/克隆/评价
- 后端：JSON 模板存储 + 搜索
- 第一期：内置 10-20 个高质量模板

### P0-3: 多剧集生产管理
> 对标：小云雀 "99 集 200 分钟，资产自动同步，全局联动"

**当前状态：** useProjectStore 管理单项目，无剧集/季/集层级概念。
**实现方案：**
- 扩展 useProjectStore: project → season → episode 层级
- 新增 EpisodeManagerPanel: 剧集列表、拖拽排序、批量操作
- 资产跨剧集复用：从 CharacterAssetLibrary 扩展到全局资产库
- 关键能力：改一个角色 → 该角色在所有剧集中的形象同步

### P0-4: 风格库扩充至 100+
> 对标：小云雀 "100+ 影视级画风 + 自定义风格"

**当前状态：** StyleLibraryPanel 有 30+ 风格 / 7 分类。
**实现方案：**
- 从 awesome-seedance (CC BY 4.0) 批量导入新增风格
- 从开源社区收集更多风格 preset
- 增加自定义风格保存/分享功能

---

## 六、P1 级差距（重要增强）

### P1-1: AI 自动化剧本生成
> 对标：小云雀 "一句话→100 集剧本+人物小传+分镜"

**当前状态：** 无此功能。
**实现方案：**
- 新增 API: `/api/ai/auto-script` — 输入一句话创意→输出完整剧本
- 新增 Panel: `AutoScriptPanel`
- 集成：bible-director-agent 自动生成角色/场景设定

### P1-2: 首尾帧参考 + 片段续播
> 对标：小云雀 "首尾帧严格控制 + 基于前段继续生成"

**当前状态：** 无此功能。
**实现方案：**
- 扩展 generate-video API: 接受 startFrame/endFrame 参数
- 新增 `continueVideoGeneration` 功能

### P1-3: 交互式灯光控制面板
> 对标：TapNow "影棚级灯光控制：全局亮度/色温/主光位置/轮廓光"

**当前状态：** CinematicParamPanel 有参数，无交互式可视化面板。
**实现方案：**
- 新增 `LightingControlPanel`: 3D 灯光可视化 + 拖拽调光
- 可参考 TapNow 的 3D 灯光交互设计

### P1-4: 摄影机/镜头库
> 对标：TapNow "8 种摄影机 (ARRI/RED/Sony) + 10 种镜头 + 光圈/焦距模拟"

**当前状态：** camera-control API 有基础，无预设摄影机/镜头库。
**实现方案：**
- 新增 `CameraLensLibrary`: 预设摄影机参数 + 镜头特性
- 集成到 CinematicParamPanel 或独立面板

### P1-5: 集成 leva 参数面板
> 来源：可复用代码分析报告 (2026-06-10)

**当前状态：** 参数面板均为手写。
**实现方案：** `npm install leva`，替换 ParamControlPanel 中的参数控件。预估 0.5 天。

### P1-6: 集成 rgb-curve 色彩分级
> 来源：可复用代码分析报告 (2026-06-10)

**当前状态：** ColorGradePanel 已有但可能是手写。
**实现方案：** `npm install rgb-curve`，增强 ColorGradePanel。预估 0.5 天。

---

## 七、P2 级差距（后续完善）

### P2-1: 视频对象替换
> 对标：TapNow "替换视频主角，保留光照/运动/构图"

### P2-2: 协作功能
> 对标：小云雀 "分镜师→导演审批→修改→全局同步" / Kitsu 多角色权限

### P2-3: 资产版本管理
> 对标：Kitsu "统一资产数据库 + 版本 + 血缘"

### P2-4: Docker 部署 + JWT 认证
> 对标：ArcReel 基础设施

### P2-5: 多语言支持
> 对标：ArcReel 中/英/越南语

### P2-6: 高级搜索系统（集成 ComfyUI FuseSearch 模式）
> 来源：可复用代码分析报告

---

## 八、优先级执行路线图

```
Phase 1 (本周 P0): ─────────────────────────────────────
├── [P0-4] 风格库扩充至 100+           → 0.5天
├── [P1-5] 集成 leva 参数面板          → 0.5天
├── [P1-6] 集成 rgb-curve 色彩分级     → 0.5天
└── 提交 + 测试验证                      → 0.5天

Phase 2 (下周 P0/P1): ─────────────────────────────────
├── [P0-1] 一键拉片 / 参考视频反向拆解  → 3天
├── [P1-1] AI 自动化剧本生成            → 2天
└── [P1-4] 摄影机/镜头库                → 1天

Phase 3 (P0 核心): ────────────────────────────────────
├── [P0-3] 多剧集生产管理               → 5天
└── [P0-2] 社区模板市场                  → 3天

Phase 4 (P1 增强): ────────────────────────────────────
├── [P1-2] 首尾帧参考 + 续播            → 2天
├── [P1-3] 交互式灯光控制面板           → 3天
└── 资产创作画布增强                     → 3天

Phase 5 (P2 基础设施): ────────────────────────────────
├── Docker + JWT + 多语言               → 5天
├── 协作功能 + 资产版本管理             → 8天
└── 视频对象替换                        → 5天
```

---

## 九、可直接复用的代码行动清单

| 行动 | 来源 | 方式 | 节省工时 |
|------|------|------|---------|
| 安装 `leva` 替换参数控件 | npm MIT | `pnpm add leva` | ~2天 → 0.5天 |
| 安装 `rgb-curve` 增强调色 | npm MIT | `pnpm add rgb-curve` | ~1天 → 0.5天 |
| 复制 Excalidraw 快捷键系统 | Excalidraw MIT | 复制 shortcut.ts | ~1天 → 0.5天 |
| 借鉴 ComfyUI FuseSearch 模式 | GPL-3.0 参考 | 自行实现搜索 | ~2天 |
| 从 awesome-seedance 导入风格 | CC BY 4.0 | 直接引用 | ~1天 → 0.5天 |

**合计可节省：约 4 天开发工时。**

---

## 十、副本清理建议

一楠，你之前问的几个旧副本 (~6GB)，我的建议：

| 操作 | 路径 | 说明 |
|------|------|------|
| **删除** | `01_MAIN_开发版/starcanvas` | 比 main 落后 50+ 个文件，所有代码已在 main |
| **删除** | `WorkBuddy/.../starcanvas` | 临时会话克隆，GitHub 已有最新 |
| **精简** | `03_REFERENCES/open-source-bug-testing-lab/` | 删 playwright/argos/msw/penshot/chrome-devtools-mcp (~500MB) |
| **保留** | `02_ARCHIVE_历史版本/` | V0/V1 历史版本，作为项目演进记录 |
| **保留** | `03_REFERENCES/` 核心项目 | arcreel/comfyui-frontend/excalidraw/moyin-creator/tldraw/xyflow/huobao-drama-ai/ai-short-drama |

预计可释放约 **3-4 GB** 空间，同时保留全部有价值的参考代码。
