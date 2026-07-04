# 星轨画布错误账本

更新时间：2026-07-04
适用范围：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`

## 使用规则

1. 开工前先读本文件，再跑对应能力的现状验证。
2. 发现“像功能 bug”的问题时，先查这里是否已有环境/测试陷阱。
3. 同类问题复发时，优先补防复发测试、脚本或文档，不只修当次现象。

## EL-001 结构拆解节点右键菜单入口被条件短路

- 日期：2026-07-04
- 症状：`remix-analysis` 节点右键菜单里看不到“生成提示词 / 参考分镜 / 加入生产队列”。
- 根因：`NodeContextMenu.tsx` 外层分组条件没包含 `isRemixAnalysisNode`，内层菜单项虽然存在，但永远进不来。
- 处理：把 `isRemixAnalysisNode` 加进外层显示条件。
- 防复发：`apps/web/e2e/remix-analysis-derivation.spec.ts`

## EL-002 右键菜单高度不足导致结构拆解动作被裁掉

- 日期：2026-07-04
- 症状：菜单存在，但底部动作在小视口里不可见。
- 根因：菜单高度估算按普通节点处理，`remix-analysis` 分支更长。
- 处理：给菜单加 `max-h-[calc(100vh-20px)] overflow-y-auto`，并单独提高 `remix-analysis` 预估高度。
- 防复发：`apps/web/e2e/remix-analysis-derivation.spec.ts`

## EL-003 React Flow DOM 数量不能代表节点总数

- 日期：2026-07-04
- 症状：E2E 按 `.react-flow__node` 数量断言时，偶发“少一个节点”。
- 根因：`StarCanvas.tsx` 开了 `onlyRenderVisibleElements`，离屏节点不会进入 DOM。
- 处理：不要拿 DOM 节点总数当真相源；改用 `__starcanvasE2E` bridge 或可见文案/面板证据。
- 防复发：`apps/web/e2e/remix-analysis-derivation.spec.ts`

## EL-004 React Flow 右键在 prod E2E 下不稳定

- 日期：2026-07-04
- 症状：`locator.click({ button: "right" })` 在 prod 环境偶发拉不起菜单。
- 根因：React Flow 节点包裹层与浏览器事件路径组合下，原生右键事件不总能稳定冒泡到目标逻辑。
- 处理：在 E2E 里优先用 `dispatchEvent("contextmenu", { ... })` 主动发原生事件。
- 防复发：`apps/web/e2e/remix-analysis-derivation.spec.ts`

## EL-005 共享 dev/prod 进程会制造假阴性

- 日期：2026-07-04
- 症状：同一条 E2E 在一个端口白屏、换 fresh 端口后恢复正常。
- 根因：旧 `next start` 进程仍持有过期 build manifest；`.next` 被新构建覆盖后，HTML 引用旧 hash，静态 chunk 返回 500。
- 处理：浏览器级验收优先使用 fresh 端口的新进程；白屏时先检查 `_next/static/chunks/*.js` 是否 500，再怀疑产品代码。
- 防复发：验收前先做 `curl` / 最小浏览器探针；必要时重启 prod server。

## EL-006 CLI / 冒烟验证会被冷启动假阻塞误导

- 日期：2026-07-04
- 症状：服务刚启动时，`provider-smoke` CLI 可能误判 `/api/ai/config` 超时。
- 根因：冷启动窗口里 API 已可用，但 CLI 预热等待不够稳。
- 处理：遇到首次假阻塞时，直接核对 `/api/ai/config` 与 `/api/ai/health`，必要时重试。
- 防复发：后续补 CLI 预热与重试策略。

## EL-007 文件漂移 / 外部覆盖真实存在

- 日期：2026-07-04
- 症状：刚写过的 spec 或文档再次读取时消失、回退或换成旧内容。
- 根因：当前机器上存在多副本、多窗口、多自动化写入源；并非单一 worktree 稳态。
- 处理：关键文件改动后立刻做 `stat`、`git diff -- path`，必要时做 hash 复核。
- 防复发：只以主仓当前工作树为事实源；`Documents/星轨画布/*.md` 只当工作记忆，不当能力事实源。

## EL-008 结构拆解直接建队列时缺少可执行 shot 节点

- 日期：2026-07-04
- 症状：`remix-analysis` 右键“加入生产队列”后，队列面板能打开，但一键开始生产会直接“部分失败”。
- 根因：队列创建时只写入了 `productionQueue`；即使后面补插了 `storyboardNodes`，若 `nodesRef.current` 还没同步，执行器也会立刻抛 `找不到 shotId=... 对应的画布节点`。
- 处理：建队列前同步补入参考分镜节点，并立刻更新 `nodesRef.current` / `edgesRef.current`。
- 防复发：`apps/web/e2e/remix-analysis-derivation.spec.ts`

## EL-009 上传音频驱动数字人时，本地 blob 音频未桥接

- 日期：2026-07-04
- 症状：数字人节点接本地上传/TTS 音频时，前端可能把 `blob:` 音频 URL 直接发到 `/api/ai/talking-photo`，上游 provider 端无法直接消费。
- 根因：`requestTalkingPhoto` 默认只桥接图片；音频只有在显式传入 `audioUrlToBase64Fn` 时才会转 base64，而 `useWorkflowRunner` 之前没传音频资产标识。
- 处理：给 `requestTalkingPhoto` 增加默认音频桥接，并在 `useWorkflowRunner` 补传 `audioAssetId`。
- 防复发：`apps/web/src/app/canvas/utils/talkingPhotoService.test.ts`

## EL-010 手动首帧图生视频路径绕过了本地图片桥接

- 日期：2026-07-04
- 症状：shot 节点手动执行 `generate-video-clip` 时，如果首帧图只有本地 blob URL，视频请求会直接拿到不可读图片地址。
- 根因：`StarCanvas.tsx` 这条手动路径直接拼 `imageUrl`，没走已存在的 `resolveProviderReadableVideoSourceImage`。
- 处理：手动视频路径改为复用同一 helper；`videoSourceImage` 同时补认 `shot.generatedImageAssetId`。
- 防复发：`apps/web/src/app/canvas/utils/videoSourceImage.test.ts`
