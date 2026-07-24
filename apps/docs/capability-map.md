# StarCanvas 能力全景图 & Lovart 对标分析

> 基于 `main` @ `9d5d7ae` 地毯式扫描。
> 扫描范围：全仓 200+ 源文件，22 个 API 路由，18 种节点类型，22 个面板组件，51 个工具库。

---

## 一、能力矩阵（完整版）

### 🟢 已实现且功能完整

| 能力 | 位置 | 说明 |
|------|------|------|
| 文生图 | `/api/ai/generate-image/` | 多模型支持，重试机制，多模态 |
| 图生视频 (I2V) | `/api/ai/generate-video/`, `/api/ai/generate-video-vidu/` | SSE 流式 + 阿里 Vidu 轮询 |
| 角色三视图 | `/api/ai/generate-character-view/` + `CharacterViewModal.tsx` + `CharacterViewPanel.tsx` | 前/侧/背面，SSE 流式 |
| 骨骼生图 | `/api/ai/generate-with-pose/` + `PoseReferenceEditor.tsx` | 骨骼姿态参考驱动 |
| 局部重绘 | `/api/ai/focus-edit/` + `FocusEditPanel.tsx` | 图+遮罩+指令→编辑 |
| 全景场景图 | `/api/ai/generate-panorama/` + `PanoramaPanel.tsx` | 720°/360° 场景图 |
| 海报提示词 | `/api/ai/generate-poster/` | 可见入口已收敛为提示词节点；真实海报生成闭环待接入 |
| 图片反推提示词 | `/api/ai/reverse-prompt/` | 图→prompt |
| 放大方案记录 | `/api/ai/upscale/` | 可记录参数；服务端超分仍为 Stub，待接入 Real-ESRGAN |
| 数字人口播需求记录 | `/api/ai/talking-photo/` | 可见生成入口已隐藏；服务部署后再恢复 |
| 情绪板/参考图 | `/api/ai/generate-moodboard/` | 8 张参考图 SSE 流式 |
| TTS 配音 | `/api/ai/tts/` + `VoicePanel.tsx` | VoxCPM2, SSE 流式 |
| 参考视频逆向分镜 | `features/reverse-storyboard/` | 上传参考视频，抽取关键帧并生成可导入分镜草稿 |
| 相机运动 | `/api/ai/camera-control/` | 推拉摇移跟方案生成 |
| 7 Agent 剧组 | `/api/ai/crew/run/` + `CrewAgentPanel.tsx` | 导演/分镜师/摄影师/美术/编剧/声音/灯光 |
| 分镜文本解析 | `storyboardParser.ts` | AI输出→结构化分镜数据 |
| AI 剧本生成 | `features/ai-script/` | 规则引擎 + AI 增强 |
| Bible 导演 | `/api/ai/bible-director/` + `bible-director-agent.ts` | Bible 增强分镜生成 |
| AI Chat (SSE) | `/api/ai/chat/`, `/api/ai/chat/stream/` | 流式对话 + 多模型切换 |
| Provider 管理 | `/api/ai/config/`, `provider-registry.ts` | Multi-Provider + BYOK |
| 多 Agent 编排 | `lib/agents/orchestrator.ts` | 顺序执行 + Context 管理 |
| 自动 Agent | `autoAgentService.ts` | 意图检测→动作执行 |
| 斜杠命令 | `lib/slashCommands/` | 文本/分镜/助手三类命令 |
| AI 用量追踪 | `features/canvas/usage/` | 成本预估 + 用量 Store |

### 🟢 已实现的交互/UI 能力

| 能力 | 位置 | 说明 |
|------|------|------|
| 节点式工作流画布 | `StarCanvas.tsx` | React Flow v12, 拖拽/缩放/连接 |
| 快速节点搜索 | `QuickAddNodeSearch.tsx` | ComfyUI 风格双击搜索 |
| 画布持久化 | `useCanvasPersistence.ts` + `canvasIndexedDB.ts` | IndexedDB + supermemory |
| 项目管理 | `useProjectStore.ts` | Dashboard CRUD, IndexedDB |
| 项目隔离 | `project-canvas-isolation` | projectId 级 canvas 隔离 |
| 工作流快照 | `useCanvasSnapshotStore.ts` | 30 快照/4MB 上限 |
| 版本历史 | `NodeHistoryPanel.tsx` + `VersionComparePanel.tsx` | 节点历史对比 |
| 撤销/重做 | StarCanvas hooks | React Flow 集成 |
| 上下文菜单 | `CanvasContextMenu.tsx` + `NodeContextMenu.tsx` + `EdgeContextMenu.tsx` | 右键三菜单 |
| 批量操作 | `BatchActionPanel.tsx` | 多节点批量编辑 |
| 链式生成 | `ChainGeneratePanel.tsx` | 尾帧→下镜头首帧 |
| 角色 Bible | `CharacterBiblePanel.tsx` + `characterIdentitySummary.ts` | 角色身份管理 |
| 场景 Bible | `SceneBiblePanel.tsx` | 场景管理 |
| 项目 Bible | `ProjectBiblePanel.tsx` | 项目级世界设定 |
| 风格库 | `StyleLibraryPanel.tsx` | 100+ 影视画风 / 7 分类 |
| 镜头库 | `features/shot-library/` | 预设镜头参数 |
| 镜头参数面板 | `ShotParameterPanel.tsx` (PR #15) | 标题/景别/运镜/时长/描述 |
| 镜头列表 | `ShotListTable.tsx` | 表格/网格双视图 |
| 镜头编辑器 | `StoryboardShotEditorPanel.tsx` | 分镜镜头详情编辑 |
| 颜色分级 | `ColorGradePanel.tsx` | 调色控制 |
| 影视参数 | `CinematicParamPanel.tsx` | 影视级参数面板 |
| 情绪曲线 | `EmotionCurvePanel.tsx` | 情绪曲线可视化 |
| 视觉风格 Bible | `VisualStyleBiblePanel.tsx` | 视觉风格设定 |
| 材质库 | `AssetLibraryPanel.tsx` | 素材分类/预览/拖拽 |
| 角色素材库 | `CharacterAssetLibraryPanel.tsx` | 角色素材管理 |
| 背景移除 | `BackgroundRemoverPanel.tsx` | AI 去背景 |
| Chat 面板 | `ChatPanel.tsx` + `ChatInput.tsx` | 右侧对话面板 |
| 姿态编辑器 | `PoseEditor.tsx` + `DraggableAngleControl.tsx` | 角色姿态/角度控制 |
| 文件上传 | `FileUploadPanel.tsx` | 拖拽上传 |
| 导出入口 | `ExportDropdown.tsx` + `ExportPreflightPanel.tsx` | 导出预检 |
| 剪映草稿导出 | `jianyingDraftExport.ts` | JSON+ZIP |
| 分镜 PDF 导出 | `storyboardPdfExport.ts` | PDF 导出 |
| 字幕格式化 | `subtitleFormatter.ts` | SRT/VTT |
| 视频合成 | `storyboardVideoComposition.ts` + `videoCompositionBrowser.ts` | FFmpeg 脚本 + 浏览器端 |
| 时间轴面板 | `TimelinePanel.tsx` | 视频/音频/字幕多轨 |
| DAG 调度器 | `dagScheduler.ts` | CPM 关键路径拓扑排序 |
| 连续性检查 | `continuityGuard.ts` | 六维检查（角色/场景/动作/风格/时间/道具） |
| 演示截图采集 | `demo-screenshots.spec.ts` | rc3 截图集 |
| e2e 测试 | 25 个 Playwright e2e | 核心流程覆盖 |
| 单元测试 | 692 个 | 零回归 |

### 🟡 部分实现 / 待增强

| 能力 | 现状 | 待做 |
|------|------|------|
| Inpainting Mask 绘制 | `FocusEditPanel.tsx` 有基础 mask，但体验粗糙 | 集成 `react-canvas-masker` |
| 海报编辑 | API 生成能力强，后期编辑弱 | 集成 `react-design-editor` |
| 视频生成 | 图生视频已支持，非图生视频待完善 | 增强 Vidu 集成 |
| 放大方案记录 | 当前作为参数/提示词节点使用；Upscale API 仍为 stub 状态 | 接入 Real-ESRGAN 后再恢复“一键高清放大”入口 |
| 多人协作 | 无 | 后续考虑 |
| 素材库搜索 | 手动分类，无全文搜索 | 添加搜索过滤 |
| AI 脚本→分镜 | 有基础转换 | 增强 AI 驱动 |
| 分镜网格预览 | `StoryboardGridNode.tsx` | 增强交互 |

### 🔴 完全缺失（Lovart 对标）

| 能力 | Lovart | 星轨画布 |
|------|--------|----------|
| 图中文字独立编辑 | 文字分层，独立可编辑 | ❌ |
| 可视化搜索参考 | 实时检索全网设计参考 | ❌ |
| 品牌一致性引擎 | 跨设计格式自动风格保持 | ⚠️ 有 UI 但无自动引擎 |
| 点选精准编辑 | 点击图中元素直接替换 | ⚠️ 有 FocusEdit 但非点选 |
| Logo/VI 生成 | 全套品牌物料 | ❌（不在影视路径上） |

---

## 二、可直接复用的开源项目

### P0 — 立即集成

| 项目 | 用途 | 许可证 | 集成方式 |
|------|------|--------|----------|
| **react-canvas-masker** | Inpainting mask 绘制 | MIT | `npm install` |
| **react-design-editor** | 海报/设计编辑器 | MIT (1700★) | `npm install` |

### P1 — 后端引擎

| 项目 | 用途 | 许可证 | 部署方式 |
|------|------|--------|----------|
| **IOPaint** | Inpainting 后端引擎 | Apache 2.0 (20K★) | Docker |
| **flux-kontext-inpaint** | Inpainting 参考实现 | MIT | 代码参考 |

### P2 — 功能参考

| 项目 | 用途 | 许可证 |
|------|------|--------|
| **fabritor-web** | 海报编辑器参考 | MIT (600★) |
| **OpenPencil** | AI 设计编辑器 (Vue, 非 React) | MIT (4.7K★) |

---

## 三、Lovart 能力补齐路线

```
Phase 1: Inpainting 体验升级
  ├─ 集成 react-canvas-masker → 替代 FocusEditPanel 自绘 mask
  ├─ 对接 IOPaint Docker → 增强后端 inpainting 引擎
  └─ 验收：选中镜头 → 涂抹区域 → 输入指令 → 区域重绘

Phase 2: 设计编辑能力
  ├─ 集成 react-design-editor → 海报/物料后期编辑
  ├─ 与现有 generate-poster API 对接
  └─ 验收：生成海报 → 编辑文字/图层/颜色 → 导出

Phase 3: 智能辅助
  ├─ 视觉参考检索 → Agent 搜图 → 拖入画布
  ├─ 风格一致性引擎 → shot 间自动风格传递
  └─ 验收：画布内搜索 → 参考图拖入 → 风格自动对齐
```

---

## 四、API 路由全景（22 个）

```
generate-image       - 文生图/图编辑
generate-image-ideogram - Ideogram 4 JSON 生图
generate-video       - 图生视频 (SSE)
generate-video-vidu  - 阿里 Vidu 视频
generate-character-view  - 角色三视图 (SSE)
generate-moodboard   - 情绪板 8 图 (SSE)
generate-poster      - 海报提示词/海报生成待闭环
generate-panorama    - 720° 全景场景
generate-with-pose   - 骨骼生图
focus-edit           - 局部重绘
reverse-prompt       - 图片反推提示词
upscale              - 放大方案记录 (service stub)
talking-photo        - 数字人口播需求记录 (service not_ready)
remix-analysis       - 参考视频结构分析
camera-control       - 相机运动方案
bible-director       - Bible 导演增强
crew/run             - 7 Agent 剧组 (SSE)
tts                  - 文本转语音 (SSE)
chat                 - 非流式对话
chat/stream          - SSE 流式对话
config               - Provider 配置
health               - 连接测试
```

---

## 五、面板组件全景（22 个）

```
画布层 (5):
  AssetLibraryPanel, CharacterAssetLibraryPanel, FocusEditPanel,
  PoseReferenceEditor, BackgroundRemoverPanel

属性/编辑层 (12):
  CharacterBiblePanel, SceneBiblePanel, ProjectBiblePanel,
  VisualStyleBiblePanel, CinematicParamPanel, ColorGradePanel,
  ShotParameterPanel, StoryboardShotEditorPanel, ShotListTable,
  StyleLibraryPanel, EmotionCurvePanel, PanoramaPanel

工具层 (5):
  ProductionRunQueuePanel, CrewAgentPanel, BatchActionPanel,
  CanvasDiagnosticsPanel, NodeHistoryPanel
```

---

## 六、立即行动建议

```bash
# 1. 切换到 feat/shot-parameter-panel 继续
git checkout feat/shot-parameter-panel
git stash pop

# 2. 或开一个新的 inpainting 升级分支
git checkout main
git checkout -b feat/upgrade-inpainting
npm install react-canvas-masker
```

**推荐先做完 Shot 参数面板（PR #15），再开 Inpainting 升级。**
