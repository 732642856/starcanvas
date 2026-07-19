# 星轨画布全盘审计与 Provider 可用性收口

## 目标
确认唯一主仓、归档/候选副本、API key 存储与调用链；修复 GPT 图生图失败的本地路由问题（若存在），并形成可执行接入方案。

## 阶段
- [x] 读取错误账本，发现本机 StarCanvas 副本。
- [x] 建立副本/工作树证据表，判定权威源。
- [x] 审计 Provider 配置、密钥边界、图生图 route 与 UI。
- [x] 对照官方 OpenAI 图像编辑和 ComfyUI API 资料，确定最小改造。
- [x] 实施可验证修复并跑定向测试；更新能力图、错误账本、进度。
- [x] 重新扫描本机 Skill / worktree / 历史副本；研究 AI 视频白模预演与导演提示词，并接入 I2V 单镜头编译层。
- [x] 将白模建议持久化进生产 brief，并纳入队列预检 warning。
- [x] 将白模计划写入项目交付 manifest，确保导出后仍可由后续 ControlNet worker 消费。
- [x] 将连续动作拆镜建议写入 brief、队列预检与交付 manifest，避免单镜头 I2V 把多节拍动作误交给模型。
- [x] 迁入已验收 workbench-kernel，并完成本机 LocalSkillRegistry、Crew metadata 选择、受限正文与审计链。
- [x] AgentNode 主 runner 已迁移到显式 `film.crew.orchestrator` SkillRuntime；保留 history、usage、状态与 WorkflowRunEvent 审计。
- [x] 完成 Inky / Twine / Dialogic 一手资料筛选，形成叙事图、状态条件、时间事件、局部重演与可追溯实施参考。
- [x] 新增画布问题中心：聚合 production preflight 与 queue blocked actions，去重、排序、可点击定位并复用修复草案。
- [x] 完成《太子替我背黑锅》免费预生产：8 镜头、24 秒、连续性规则、白模需求、英文提示词与交付验收已写入 artifacts。
- [x] 《太子替我背黑锅》Vidu 批次已完成：8 段 R2V 已收口为 24.71 秒 v2 成片和完整 ZIP；shot 05 历史裁切已替换，临时单声线旁白仍未收口。
- [ ] 《太子替我背黑锅》图片生产仍被 Copse `524` 阻塞：Gate 1 单角色、单参考图、`1024x1024` 也失败；未取得稳定 image Provider/reference workflow 前，不恢复批量请求。
- [x] Gate 1 runner 已准备并真实执行：单赵珩参考图、`1024x1024`、`retryAttempts: 1` 仍在约 136 秒后收到 Copse `524`；日志确认仅 `upstream attempt 1 / 1`，无关键帧、无重试。Gate 2/3/4 继续冻结。
- [x] 普通画布图片路由已收口 `524` 自动重试风险：`524` 代表上游结果未知，不能无 idempotency key 重复提交可能已计费的图片任务；保留 `429/500/502/503/504` 的既有短暂错误重试，并有 Node 回归测试。
- [x] production queue 与客户端错误归一化也已收口 `524`：不再受 Provider `retryable: true` 影响而自动重发；队列失败会明确提示结果/计费未知，只有用户主动选择重试才会再次提交。
- [x] Vidu 已接入本机 `requestId -> taskId` 六小时复用：同一 production/workflow 运行的 SSE 中断重试继续轮询既有视频任务，不重复创建付费任务；服务重启前提下有效。
- [x] Vidu 浏览器 SSE 恢复：稳定 `requestId` 的传输中断自动重连一次，明确 Provider 错误/无 id/第二次中断不重发；浏览器已验真同 id 重连与视频资产回写。
- [x] Vidu 并发提交去重：同一 `requestId` 的首个 task 创建期间由 in-flight Promise 合并，避免两个 SSE/点击同时产生双份付费任务；成功后继续走六小时 task cache，失败不缓存。
- [x] Auto Agent 图片 524 结果未知路径：真实模式 E2E 断言仅请求一次、提示先核对资产/账单、保留手动待重试 Prompt；修复了该用例此前误走 mock 的假证据。
- [x] 主创作链浏览器验收：一句创意到导演分镜、导演分镜到生产队列/剪映交接、生产完成到项目包恢复及剪映 ZIP 均以 mock 路径独立通过；项目包 E2E 改为只断言可扩展 manifest 的稳定契约字段。
- [x] keyframe runner 允许显式点名补生成已 `video_completed` 的镜头；默认批量仍只取待处理镜头。支持受限的低成本 `1024x1024` 测试尺寸。
- [x] keyframe runner 增加显式 detached 付费模式：`STARCANVAS_DETACH_PAID_IMAGE_RUN=1`，用于规避短生命周期前台宿主丢失同步图片结果。
- [ ] `shot-01` 纯文生图诊断已在单次、`1024x1024`、无参考图条件下提交，但前台 runner 终止前未保存结果；已标记结果/计费未知，禁止自动重试。需在 Copse 账号用量页确认后才可决定是否替换请求。
- [x] 已生成脱敏 Copse `524` 支持工单材料：不含 Key，要求确认计费、编辑合同、异步轮询/keepalive 与替代 endpoint。见 `artifacts/太子替我背黑锅-copse-524-escalation.md`。
- [x] 本机 ComfyUI 文生图 fallback 已接入：仅 loopback + 显式本机环境变量可调用，`comfyui-local` 直接走 local route；当前明确拒绝参考图输入，未实现 ControlNet/IP-Adapter 双角色一致性。
- [x] 本机 ComfyUI 已安装并曾完成启动/API 验证：官方 `v0.3.10`、`.venv-v0310`、CPU、`127.0.0.1:8188`；当前服务未运行，真实 `models/checkpoints` 仅有占位文件，StarCanvas 保持禁用。见 `artifacts/comfyui-local-install-record.md`。
- [x] 2026-07-16 完成本机/远端/运行态/Skill/交付物事实审计；见 `docs/reference/runtime-source-of-truth-2026-07-16.md`。
- [x] 修复真实生产 scripts 默认端口漂移：统一到 `scripts/local-api-base.mjs`，有 Node 回归。
- [x] 《太子替我背黑锅》技术声音交付已审计：推荐 R2V narrated 母版、独立 SRT、逐镜头音频 stem 与 ZIP 均可用；新增 `delivery/audio/voice-replacement-map.json` 固化角色、台词、入点、时长与拟音层，供剪映替换。
- [x] 剪映音频导出 adapter 现保留 Canvas `startOffsetSeconds`；角色级 stem 可按 voice replacement map 的时间表进入剪映，不再被导出器强制叠到 `0s`。
- [x] 剪映音频导出兼容恢复项目的 `timelineStartTimeSeconds`；旧项目包恢复后仍可按原角色配音时间线重新导出。
- [x] 生产队列 TTS 节点继承源镜头时间轴；优先显式时间，再回退累计 `subtitleTimeline` 或按 production briefs 计算累计入点；新配音节点写入 `startOffsetSeconds` 与 `timelineStartTimeSeconds`，避免导出回到 `0s`。
- [ ] 继续：选定可用图片生产路径后，以单张目标尺寸低成本验证；声音的角色级配音、拟音和配乐属于创作质量升级，不能把当前临时单旁白误报为完成。

## 约束
- 主仓：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`。
- 不覆盖或回退既有未提交改动；密钥不写入仓库、日志或交付物。
- 真实付费调用仅按用户已有显式授权执行。
