# 管理层对标调研：MAM / Production Tracking 开源参考

> 日期：2026-06-16
> 背景：LibreTV 实为视频聚合播放平台，不适合作为影视资产管理（MAM）对标。需重新调研。

---

## 调研结论摘要

**最强对标：Kitsu（cgwire/kitsu）**
- AGPL-3.0，Vue.js + Python，300+ 动画/VFX 工作室使用
- 提供完整的 production tracking：项目管理、任务分配、进度追踪、交付管理
- 8,884 次提交，活跃维护（最后更新 2026-06-15）

**MAM 参考：Nebula Broadcast**
- GPL-3.0，TypeScript，307⭐
- 媒体资产管理 + 广播自动化，元数据管理、转码、搜索
- 与 StarCanvas 同为 TypeScript 栈

**API 优先参考：WrangleBot**
- GPL-3.0，NodeJS + TypeScript
- REST API + NodeJS SDK，Ingest/Transcode/Metadata 功能全面

---

## 详细对比

### 1. Kitsu — 动画/VFX 协作平台（🏆 管理对标首选）

| 维度 | 详情 |
|------|------|
| **仓库** | github.com/cgwire/kitsu |
| **许可证** | AGPL-3.0（仅可借鉴设计思路） |
| **Stars** | ~400+（300+ 工作室使用） |
| **技术栈** | Vue.js + Python (Flask) + PostgreSQL |
| **维护状态** | 非常活跃，2026-06-15 最近提交 |
| **核心能力** | 项目管理、Shot/Asset 跟踪、任务分配、时间线、审核流程、播放器 |

**StarCanvas 可借鉴：**
- 项目/镜头/资产三级管理模型
- 任务状态机（Todo → WIP → Done → Retake）
- 审核标注与协作流程
- 基于时间线的进度可视化

### 2. Nebula Broadcast — MAM + 广播自动化

| 维度 | 详情 |
|------|------|
| **仓库** | github.com/nebulabroadcast/nebula |
| **许可证** | GPL-3.0 |
| **Stars** | 307 |
| **技术栈** | TypeScript（主）+ Python（Worker） |
| **维护状态** | 活跃，2026-06-13 最近提交 |
| **核心能力** | 媒体摄取、元数据管理、转码、搜索、播放列表 |

**StarCanvas 可借鉴：**
- 媒体资产录入与元数据自动提取流程
- 资产搜索与过滤 UI 设计
- Worker 节点分布式转码架构
- 桌面客户端（Firefly）与 Web 服务的通信模型

### 3. WrangleBot — MAM 平台引擎

| 维度 | 详情 |
|------|------|
| **仓库** | github.com/AxelRothe/wranglebot |
| **许可证** | GPL-3.0 |
| **Stars** | 小规模（单贡献者） |
| **技术栈** | NodeJS + TypeScript |
| **维护状态** | 低活跃，最后 2025-01 |
| **核心能力** | Ingest/Copy/Verify（xxHash）、Metadata Editor、Transcode（ProRes/H264/DNxHD）、REST API、NodeJS SDK |

**StarCanvas 可借鉴：**
- 链式 API 设计（JavaScript SDK）
- 文件校验与元数据提取流水线
- 缩略图自动生成策略

### 4. OpenMAM — Cinegy 开源版

| 维度 | 详情 |
|------|------|
| **仓库** | 未找到公开 GitHub 仓库 |
| **许可证** | 不明 |
| **规模** | 企业级，BBC 等使用 |
| **状态** | 缺少透明开源仓库，不适合对标 |

### 5. 其他小规模参考

| 项目 | Stars | 特点 | 建议 |
|------|-------|------|------|
| production-tracker (mhrjdv) | 1 | AI 影视制作编排层 | 太小，仅参考理念 |
| film-breakdown-assistant (ggvfx) | 6 | 剧本拆解自动化 | 剧本→调度桥接参考 |
| aivideo-production-skills (RandomNest) | 11 | 门控式 AI 管线、成本治理 | AI 成本控制参考 |

---

## StarCanvas 管理层建设路线建议

基于以上调研，StarCanvas 管理层可分三期建设：

### 第一期：资产库（对标 Nebula + WrangleBot）
- 媒体文件注册与索引（MD5/SHA 校验）
- 元数据自动提取（分辨率、时长、编码格式）
- 搜索与过滤 UI
- 缩略图自动生成

### 第二期：项目制片（对标 Kitsu）
- 项目→镜头→资产三级结构
- 任务分配与状态流转
- 进度看板 / 甘特图
- 审核标注流程

### 第三期：智能管线
- AI 辅助元数据标注
- 自动化转码/导出队列
- 成本统计与治理
- Webhook 集成外部工具

---

## 注意事项

1. Kitsu/Nebula/WrangleBot 均为 GPL/AGPL 传染性许可证，**不得直接复制代码**，只能借鉴架构设计思路。
2. StarCanvas 当前运行时资产入口以 `ProjectBiblePanel` 角色页和 `AssetLibraryPanel` 为主；`CharacterAssetLibraryPanel` 属历史并行 UI，不宜再作为现役入口判断依据。
3. 优先建设"可见的"功能（搜索、过滤、看板），让开源社区能直观看到管理层价值。
