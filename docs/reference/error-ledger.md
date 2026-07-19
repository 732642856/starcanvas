# 星轨画布错误账本

更新时间：2026-07-11
适用范围：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`

## 使用规则

1. 开工前先读本文件，再跑对应能力的现状验证。
2. 发现“像功能 bug”的问题时，先查这里是否已有环境/测试陷阱。
3. 同类问题复发时，优先补防复发测试、脚本或文档，不只修当次现象。

## EL-032 项目包恢复后再次执行视频工作流仍可能读到旧远程图

- 日期：2026-07-10
- 症状：项目包导入后，图片节点的 `imageUrl/resultUrl` 已恢复为本地 blob，但再次运行 `image-result -> video-generation` 时，请求仍带旧 `generatedImageUrl` 远程地址。
- 根因：项目包 import 只覆盖了 `imageUrl/assetUrl/resultUrl`，漏掉同一节点上的 `generatedImageUrl`；视频工作流取源图时可能优先读到旧字段。
- 处理：包内资产恢复时同步覆盖 `generatedImageUrl`，并把恢复资产标记为 `indexeddb`，让 reload 后继续走本地资产库 hydrate。
- 防复发：`apps/web/src/app/canvas/utils/projectPackageImport.test.ts`、`apps/web/e2e/project-package-roundtrip.spec.ts`

## EL-034 项目包资产不能只覆盖图片 bytes

- 日期：2026-07-10
- 症状：项目包恢复链路若只验证图片，音频旁白、视频素材、镜头配音的 IDB-only bytes 可能仍缺失，跨设备恢复后无法继续消费。
- 根因：历史测试重点在 image asset；media asset 虽有本地存储，但缺少项目包 manifest 覆盖测试。
- 处理：项目包导出复用 `providerMediaDataUrl.blobToDataUrl`，并补 `video-asset / audioAssetId / voiceAudioAssetId` 导出测试；导入测试补 `video/audio` 包内资产 URL 恢复断言。
- 防复发：`apps/web/src/app/canvas/utils/projectPackageExport.test.ts`、`apps/web/src/app/canvas/utils/projectPackageImport.test.ts`

## EL-035 项目包恢复视频素材后必须验证能再次进入抽帧/分析链

- 日期：2026-07-10
- 症状：只验证项目包里有 video bytes，不等于用户导入后能继续抽帧、分析、再编辑。
- 根因：导入/导出测试只覆盖数据形状；缺少浏览器里真实 `HTMLVideoElement + canvas` 抽帧和本地像素分析的再消费证据。
- 处理：新增项目包 roundtrip E2E：导入 packaged `uploaded-video`，确认恢复为 blob URL，再运行 `video-sample-frames -> video-analyze`。
- 防复发：`apps/web/e2e/project-package-roundtrip.spec.ts`

## EL-036 项目包恢复音频后必须验证能进入交接包

- 日期：2026-07-10
- 症状：音频 bytes 能导入恢复，不等于用户能把恢复后的音频交给剪映/后期继续使用。
- 根因：之前只验证音频 URL/assetId 数据形状，缺少 ZIP 交接包消费证据。
- 处理：新增项目包 roundtrip E2E：导入 packaged `tts-audio`，确认 `audioUrl` hydrate 为 blob，再导出剪映兼容 ZIP，验证 `JianYingCompatible/audios/roundtrip-audio.mp3` 存在且有 bytes。
- 防复发：`apps/web/e2e/project-package-roundtrip.spec.ts`

## EL-037 剪映 ZIP 不能只验文件存在，还要验 draft JSON 引用一致

- 日期：2026-07-10
- 症状：ZIP 内有 `videos/*.mp4` / `audios/*.mp3`，但 `draft_content.json` 可能引用不存在的 materialId 或路径，后期导入/手动核对会断链。
- 根因：旧测试只检查 ZIP entry 存在，没验证 `materials.*.path` 和 `tracks[].segments[].materialId`。
- 处理：补剪映兼容包合同测试：draft JSON 的 video/audio material path 与 ZIP 文件 basename 一致，且 tracks 中 segment 引用的 materialId 都存在。
- 防复发：`apps/web/src/app/canvas/utils/jianyingDraftExport.package.test.ts`

## EL-038 剪映 ZIP 同名素材会覆盖或错指

- 日期：2026-07-10
- 症状：多个视频/音频节点使用相同 `fileName` 时，ZIP entry 可能同 path 冲突，`draft_content.json` 也可能指向同一个 basename，后期交接时素材错位。
- 根因：兼容包导出直接使用节点原始 `fileName`，没有按 ZIP 目录生成唯一安全文件名。
- 处理：在 `buildJianyingCompatiblePackage` 内为 video/audio 分别生成唯一安全文件名，ZIP entry 和 `draft_content.json` 共用同一批 fileName。
- 防复发：`apps/web/src/app/canvas/utils/jianyingDraftExport.package.test.ts`

## EL-039 剪映 ZIP 文件名需要跨平台安全化

- 日期：2026-07-10
- 症状：素材文件名含 Windows 非法字符、尾部点/空格、无扩展名、URL 编码中文名或保留名（如 `CON`）时，ZIP 可生成但后期解压/导入可能失败或路径不一致。
- 根因：兼容包导出只做同名去重，未统一处理跨平台文件名边界。
- 处理：`buildJianyingCompatiblePackage` 的文件名分配增加非法字符替换、尾部点/空格清理、扩展名补齐、URL decode、Windows 保留名规避。
- 防复发：`apps/web/src/app/canvas/utils/jianyingDraftExport.package.test.ts`

## EL-040 导出预检必须提前提示交接包文件名风险

- 日期：2026-07-10
- 症状：交接包导出器会自动修正非法/重复文件名，但用户在预检面板看不到原因，容易误以为下载后文件名变化是 bug。
- 根因：`runExportPreflightCheck` 只区分素材是否缺失，没有把“会自动改名”的非阻塞风险反馈给 UI。
- 处理：`ExportAssetCheck` 增加 `warningReason`；预检扫描同名素材、非法字符、尾部点/空格、缺扩展名、Windows 保留名；UI 显示黄色“注意”。
- 防复发：`apps/web/src/app/canvas/components/panels/exportPreflightCheck.test.ts`

## EL-041 preflight warning 必须有浏览器证据

- 日期：2026-07-10
- 症状：纯函数能返回 `warningReason`，但 UI 可能没把非阻塞风险展示出来，用户仍然要下载后才发现文件名被改。
- 根因：preflight 规则和面板渲染此前缺少同一条浏览器验证。
- 处理：新增 E2E，种入非法/保留名素材，打开剪映 ZIP 预检，验证面板显示黄色“注意”和对应素材标题。
- 防复发：`apps/web/e2e/production-run-jianying-export.spec.ts`

## EL-063 preflight warning 必须和实际导出产物一致

- 日期：2026-07-10
- 症状：UI 提示会自动修正文件名，但如果 ZIP 产物和 `draft_content.json` 未按同一规则修正，用户仍会在后期交接时断链。
- 根因：warning UI 和 ZIP 内容此前没有同一条浏览器闭环。
- 处理：扩展 E2E：看到“注意”后继续导出 ZIP，验证 `videos/same_name.mp4`、`audios/CON_.mp3` 存在，且 `draft_content.json` material path 指向同名文件。
- 防复发：`apps/web/e2e/production-run-jianying-export.spec.ts`
- 防复发：`apps/web/e2e/production-run-jianying-export.spec.ts`

## EL-033 项目包导入 E2E 点上传过早会被空画布起点屏吞掉

- 日期：2026-07-10
- 症状：E2E 点击 `toolbar-file-upload` 后等不到“文件上传”，表面像项目包导入坏了。
- 根因：空项目进入 Canvas 后存在新起点屏和初始化状态，单次点击上传入口不稳定。
- 处理：E2E 增加 `openFileUploadPanel()`，先确认 `__starcanvasE2E` bridge 就绪，再点击上传；若 5 秒内未出现面板，重试一次。
- 防复发：`apps/web/e2e/project-package-roundtrip.spec.ts`

## EL-030 dry-run 绿灯不能覆盖最近一次真实 smoke 失败

- 日期：2026-07-06
- 症状：设置面板 `provider-smoke` dry-run 全绿，但用户上一轮真实生图已经超时失败；随后生产队列 / Auto Agent 仍继续允许试跑，造成重复误判和重复烧测。
- 根因：readiness 之前只看 `providerHealthSummary + providerSmoke(dry-run)`，没把最近一次真实 smoke 结果持久化并并入正式开工判定。
- 处理：把最新真实 smoke 结果持久化到 `startrails_provider_real_smoke_results`，并接入 `taskReadiness`、`ProductionRunQueuePanel`、`AutoAgent` 前置校验。
- 防复发：`apps/web/e2e/provider-health-summary.spec.ts`、`apps/web/e2e/production-run-queue.spec.ts`、`apps/web/src/lib/ai/taskReadiness.test.ts`、`apps/web/src/app/canvas/utils/autoAgentService.test.ts`

## EL-031 设置面板“保存”不能再用裸文本按钮选择器

- 日期：2026-07-06
- 症状：从生产队列打开模型设置后，E2E 点 `getByRole("button", { name: "保存" })` 会误命中顶部“工作流模板（保存/加载）”按钮，随后被设置面板 overlay 拦截，表面像保存按钮点不动。
- 根因：运行时同屏存在多个 accessible name 含“保存”的按钮；裸文本 selector 会先拿到错误目标。
- 处理：给设置面板保存按钮补 `data-testid="provider-settings-save"`，相关 E2E 全改走 testid。
- 防复发：`apps/web/src/app/canvas/components/panels/SettingsPanel.tsx`、`apps/web/e2e/provider-health-summary.spec.ts`、`apps/web/e2e/production-run-queue.spec.ts`

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

## EL-011 右键“重绘本镜头”绕过了生图持久化与 shot/image 节点同步

- 日期：2026-07-05
- 症状：shot 节点右键执行“重绘本镜头”后，生成结果没稳定回写到 `shot.generatedImageUrl` / `generatedImageAssetId`，已有右侧图片节点也可能与镜头预览脱节。
- 根因：`StarCanvas.tsx` 这条路径直接 `fetch("/api/ai/generate-image")`，既没复用 `generateImageFromPrompt` 的图片持久化，也把结果写到了顶层 `data.imageUrl`，而不是 shot 字段。
- 处理：改为复用 `generateImageFromPrompt` + `createShotImageNode`，并通过 `createShotImageArtifacts` 同步 shot 字段、右侧图片节点与 lineage edge。
- 防复发：`apps/web/src/lib/storyboard/createShotImageArtifacts.test.ts`

## EL-012 E2E 里同名按钮会被空画布引导/面板动作撞到

- 日期：2026-07-05
- 症状：Playwright 用 `getByRole("button", { name: "生成分镜" })` 一类全局选择器时，可能同时命中 chat 澄清按钮和空画布引导按钮，触发 strict mode violation。
- 根因：页面上真实存在多个同文案 CTA；E2E 断言没把查询范围收口到 `chat-panel` 或对应面板容器。
- 处理：相关用例改为先定位面板容器，再在容器内查按钮。
- 防复发：`apps/web/e2e/auto-agent-clarification.spec.ts`
## EL-013 E2E preflight 探针打错路径，冷启动被误判成服务挂掉
- 日期：2026-07-05
- 症状：复用固定 `STARCANVAS_E2E_BASE_URL` 时，dev server 明明在起，E2E 仍反复报 `"E2E preflight failed: ... is not ready (fetch failed)"`，导致重复试跑和误判业务回归。
- 根因：`apps/web/e2e/utils.ts` 之前拿 `/` 做 preflight，首页编译又慢又重；同时只给 2 次、5s 级别探测，Next dev 冷启动窗口很容易被直接判死。
- 处理：探针统一改打轻量 `/api/ai/config`，并把冷启动错误重试扩成共享策略；`remix-analysis-derivation.spec.ts` 同步收口到 `gotoCanvas`。
- 防复发：`apps/web/e2e/utils.preflight.test.ts`
## EL-014 生产队列先生成分镜图再生视频时，blob 首帧图缺少可桥接资产标识
- 日期：2026-07-05
- 症状：`production-run-jianying-export.spec.ts` 这类 `生成分镜图 -> 生成视频` 队列，在图片任务已成功后仍可能落成“生产队列部分失败”。
- 根因：`StarCanvas.tsx` 的 `generate-storyboard-image` 队列路径只把 `generateImageFromPrompt` 的结果写回了顶层 `data.imageUrl / generatedImageUrl`，没同步 `shot.generatedImageAssetId / generatedImageUrl`；而 `generate-video-clip` 真实读取首帧时，需要这些字段把本地 blob 图桥接成 provider 可读输入。
- 处理：队列生图路径改复用 `createShotImageArtifacts`，统一回写 shot 字段、顶层预览字段与图片节点关系。
- 防复发：`apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.test.ts`
## EL-015 Quick Add 搜索的 E2E 不能依赖动作型 pane 鼠标事件
- 日期：2026-07-05
- 症状：`canvas-quick-add-node-search.spec.ts` 用 Playwright 的 `locator.dblclick()` / `locator.click()` 打 `.react-flow__pane` 时，会在元素可见稳定的情况下仍超时，误判成 quick-add 面板打不开或单击行为异常。
- 根因：产品侧实际监听的是 wrapper / pane 上的原生鼠标事件；动作型 `click()` / `dblclick()` 在 React Flow pane 上不够稳，容易卡在浏览器动作重试，而不是把事件可靠送到监听器。
- 处理：spec 改为统一走 `gotoCanvas`，并用 `dispatchEvent("dblclick", ...)` / `dispatchEvent("click", ...)` 直接触发原生事件。
- 防复发：`apps/web/e2e/canvas-quick-add-node-search.spec.ts`
## EL-016 跨页 E2E 不能在 `beforeEach` 里用持久化 `addInitScript` 反复清 storage
- 日期：2026-07-05
- 症状：`core-workflow-smoke.spec.ts` 这类 Dashboard -> Canvas 跨页链路里，测试明明先创建了项目，却会在“应跳转到 canvas”前卡回 Dashboard，像是项目创建失败。
- 根因：`page.addInitScript(...)` 会在后续每次新文档加载前都执行；测试如果把清库逻辑放进去，Dashboard 跳到 Canvas 时会再次清掉刚写入的项目元数据，等于测试自己打断主路径。
- 处理：这类 smoke 改成在测试开始时只清一次同源 storage（如 `page.goto("/")` 后 `clearBrowserStorageEvaluate(page)`），不要把清库逻辑绑定到整个页面生命周期；如果要验证 reload / 二次进入，同一 `browserContext` 下新开 page，别在原 page 上再次 `goto`。
- 防复发：`apps/web/e2e/core-workflow-smoke.spec.ts`
## EL-017 Auto Agent 在 Ask 模式拿到真实动作时，E2E 需显式点一次“执行 N 个操作”
- 日期：2026-07-05
- 症状：真实 provider 已返回 `extract-production-assets` 这类可执行动作，但 UI smoke 一直等不到 Project Bible 节点，表面像 provider 或画布回写挂了。
- 根因：`AgentModeSwitcher` 默认是 `ask`；这时 Auto Agent 不会自动落地动作，而是先在聊天消息里显示“执行 N 个操作”确认按钮。mock 澄清路径会绕过这个点，真 provider 直出动作时才会暴露。
- 处理：真实 UI smoke 要么先切 `max`，要么像真实用户一样点击“执行 N 个操作”。
- 防复发：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`

## EL-018 Auto Agent 真实生图不能把“直连 smoke 通过”当成“主链已稳”

- 日期：2026-07-05
- 症状：`/api/ai/provider-smoke/run` 的最小图片 smoke 已真实通过，但 Auto Agent 的真实图片 smoke 仍会卡死或最终拿到上游 `524`。
- 根因：这里叠了三层以前没被同时看见的差异：
  1. Auto Agent 之前忽略 `aspectRatio`，没给 `size` 时会偷偷退回 `1792x1024`，比最小 smoke 更重。
  2. Auto Agent 真实 prompt 比 provider smoke 的极简 prompt 更长、更复杂；即使把尺寸归一到 `1024x1024`，当前 `copse.top -> gpt-image-2` 路径仍可能超时。
  3. Node real smoke 不是浏览器，`data:image` 结果若硬走 `indexedDB` 持久化会挂成 pending promise，制造“像 provider 卡死”的假象。
- 处理：
  1. `apps/web/src/app/canvas/utils/autoAgentService.ts` 改为复用共享 `resolveImageGenerationSize(...)`，把 `aspectRatio` 收口到 provider 支持尺寸。
  2. `apps/web/src/app/canvas/utils/imageGeneration.ts` 在非浏览器环境下跳过本地资产持久化，直接返回 `data:image`。
  3. 真实结论按两层汇报：`direct provider image smoke = passed`；`Auto Agent real image smoke = upstream 524, not roundtrip verified`。
- 防复发：`apps/web/src/app/canvas/utils/autoAgentService.real.test.ts`, `apps/web/src/app/canvas/utils/autoAgentService.test.ts`, `apps/web/src/app/canvas/utils/imageGeneration.test.ts`, `docs/reference/current-capability-map.md`

## EL-019 长链 smoke 不要把两个持久化闭环绑成一条超长用例
- 日期：2026-07-05
- 症状：`core-workflow-smoke.spec.ts` 里“保存 -> 刷新恢复；删除 -> 刷新消失”绑在同一条用例时，会在删除阶段附近超时，看起来像整条保存恢复主链也不稳定。
- 根因：这类 smoke 前半段已覆盖 `Dashboard -> Canvas -> 添加文本 -> 自动保存 -> 刷新恢复`，后半段再叠一轮删除与再次刷新，会把两个不同目标的持久化证据混成一条长链，导致后半段的耗时或波动掩盖前半段其实已经通过的事实。
- 处理：先把“保存项目 -> 刷新 -> 唯一文本仍存在”收口成独立硬证据；删除持久化另开更短、更聚焦的用例补。
- 防复发：`apps/web/e2e/core-workflow-smoke.spec.ts`

## EL-020 生产队列失败恢复 E2E 不能把“任务失败”当成“队列已停”
- 日期：2026-07-05
- 症状：`production-run-queue.spec.ts` 里一旦看到某个任务变成“失败”，立刻去点“重试/跳过”，会在 locator click 上超时，表面像按钮没渲染或失败恢复坏了。
- 根因：队列允许“部分失败但仍继续执行剩余任务”；而 `ProductionRunQueuePanel` 只会在 `!isRunning` 时显示失败任务的 `retry/skip` 按钮。所以“任务已失败”不等于“整个队列已停止、按钮已可点”。这次失败现场里，`#3 PQ镜头 3 · 生成视频` 仍在执行，按钮按设计就不会出现。
- 处理：spec 改为先等待队列重新回到非运行态（`start` 按钮重新出现），再断言失败任务上的 `retry/skip` 按钮可见，并滚入视口后点击。
- 防复发：`apps/web/e2e/production-run-queue.spec.ts`

## EL-021 生产队列生图回写 E2E 不要依赖旧图片节点标题
- 日期：2026-07-05
- 症状：失败恢复链里，首镜头生图任务重试后已经显示“完成”，但 E2E 仍断言画布里不存在 `ai-generated-image / PQ镜头 1 图`，像是回写丢了。
- 根因：生产队列现在复用了共享 `createShotImageArtifacts` / `createShotImageNode` 回写链，图片节点标题已统一为 `镜头 01 图片` 这类命名；旧 spec 还在盯历史标题 `PQ镜头 1 图`，属于断言漂移，不是产品回写缺失。
- 处理：改为通过 `__starcanvasE2E.getNodeData(shotNodeId)?.shot.generatedImageNodeId` 查真实回写结果，再确认对应节点存在且 `nodeKind === "ai-generated-image"`。
- 防复发：`apps/web/e2e/production-run-queue.spec.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.ts`, `apps/web/src/lib/storyboard/createShotImageNode.ts`

## EL-022 桥接队列 E2E 若不显式开 mock，会被视频 readiness 新规则拦停
- 日期：2026-07-05
- 症状：`run-queue-executor-bridge.spec.ts` 里，桥接出来的 `production-run-queue-start` 按钮始终 disabled，文案提示“未指定视频模型；真实图生视频默认走 Vidu，需要 DashScope 视频 provider”。
- 根因：桥接 spec 之前只 mock 了图片/TTS，但没像 `production-run-queue.spec.ts` 一样显式写入 `startrails_use_mock`；新 readiness 规则会把视频 provider 缺失视为阻塞项。
- 处理：seed 阶段同步写入 `startrails_use_mock = true`，并补 `/api/ai/generate-video-vidu` mock 兜底，避免误走真实 provider 前提。
- 防复发：`apps/web/e2e/run-queue-executor-bridge.spec.ts`

## EL-023 桥接队列 E2E 的 shot seed 不能再用旧扁平结构
- 日期：2026-07-05
- 症状：桥接首测进入运行后，最终掉进 Canvas Error Boundary，错误是 `"Shot node data is required"`。
- 根因：当前生产队列图片回写统一走 `createShotImageArtifacts`，要求 shot 节点带 `data.shot`；而旧 bridge spec 只种了顶层 `title / prompt / description`，没有内层 `shot` 对象，属于测试种子形状过期。
- 处理：把 bridge spec 的 seed 升到当前 shot 节点形状，补 `nodeKind: "shot"` 与 `data.shot.{id,order,title,shotType,cameraMovement,duration,description,visualPrompt,dialogue,sourceStoryboardNodeId,status}`。
- 防复发：`apps/web/e2e/run-queue-executor-bridge.spec.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.ts`

## EL-024 项目级生产队列导出链的 shot seed 还要补 `referenceImageUrl / voiceIntent`
- 日期：2026-07-05
- 症状：`production-run-jianying-export.spec.ts` 这类项目级长链里，队列启动后只剩 `1/12 可执行任务`，面板底部出现“补参考帧 / 补声音意图”，后续视频/配音/字幕任务长期停在等待。
- 根因：项目级 seed 走当前 `productionPreflight` / `ShotProductionBrief` 路径时，会真实检查 `shot.referenceImageUrl` 与 `shot.cinematicShot.voiceIntent` / `shot.voiceConfig.instruct`；只给 `visualPrompt + dialogue` 不再够用。
- 处理：给这类 seed 的每个 shot 补 `referenceImageUrl` 和 `voiceIntent`，让投产预检回到 `100/100, 0 复核, 0 阻塞`。
- 防复发：`apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/src/lib/storyboard/productionPreflight.ts`, `apps/web/src/lib/storyboard/shotProductionBrief.ts`

## EL-025 项目级 12-step 生产交付 E2E 不能沿用 90s 级预算
- 日期：2026-07-05
- 症状：`production-run-jianying-export.spec.ts` 这类“项目 restore -> 12-step 生产队列 -> 导出交付物”长链，在浏览器热/冷状态混合下，90s 级 test budget 很容易把真实仍在推进的队列误判成挂死。
- 根因：这类用例叠了两段耗时：项目级 restore/init + 12-step 队列执行 + 下载/解包校验；队列探针显示在预检清零后，15s 采样点已推进到 `5/12 完成`，说明主链在前进，但默认预算过紧。
- 处理：把项目级导出长链的 `test.setTimeout` 和队列完成等待预算提高到更接近真实运行时间的量级，不要沿用短 smoke 的 90s / 45s 假设。
- 防复发：`apps/web/e2e/production-run-jianying-export.spec.ts`, `apps/web/e2e/production-run-project-package-roundtrip.spec.ts`

## EL-026 项目包 roundtrip E2E 不要重复证明“生产队列已完成”
- 日期：2026-07-06
- 症状：`production-run-project-package-roundtrip.spec.ts` 早期版本把 `已完成交付物 -> 导出项目包 -> 新项目恢复 -> 再导出剪映` 和 `12-step 生产队列执行` 绑成一条超长链，导致排错时真假问题缠在一起，任何一段波动都会把整条链拖红。
- 根因：生产队列执行本身已经有 `production-run-queue.spec.ts` 5 条浏览器证据与 `run-queue-executor-bridge.spec.ts` 2 条桥接证据；roundtrip spec 再重复跑队列，只会增加时长和噪声，不增加新的交付层覆盖。
- 处理：把 roundtrip spec 改成直接 seed `video-result / tts-audio / subtitle-srt` 已完成交付物，只验证“导出项目包 -> 新项目恢复 -> 再导出剪映 ZIP”。
- 防复发：`apps/web/e2e/production-run-project-package-roundtrip.spec.ts`

## EL-027 项目包导入成功后，文件上传弹层不会自动关闭
- 日期：2026-07-06
- 症状：roundtrip E2E 在导入项目包后，画布节点其实已经恢复，但继续点顶部 `export-dropdown-toggle` 会一直被 `<div class="fixed inset-0 z-50 ...">` 拦截，表面像导出入口坏了。
- 根因：`FileUploadPanel` 在项目包导入完成后保留成功态，默认不会自动 `onClose`；后续任何顶部按钮都会被这个 modal overlay 挡住。
- 处理：E2E 在确认导入完成后，显式点击上传弹层右上角关闭按钮，再继续导出链。
- 防复发：`apps/web/e2e/production-run-project-package-roundtrip.spec.ts`, `apps/web/src/app/canvas/components/panels/FileUploadPanel.tsx`

## EL-028 项目包 roundtrip + 剪映再导出属于 3-4 分钟级长链，不是 120s smoke
- 日期：2026-07-06
- 症状：即使去掉重复队列执行，`production-run-project-package-roundtrip.spec.ts` 仍会在 `120_000` 预算下假死，先后表现成“上传按钮点击时报 page closed”“导出按钮点击时报 page closed”，看起来像不同功能点轮流坏。
- 根因：这条链仍然叠了多段真实浏览器重操作：项目包下载、文件 chooser 导入、画布恢复、上传 modal 关闭、剪映 ZIP 再导出；在本机 Next dev 模式下，真实耗时接近 `3.8m`，远超 smoke 预算。
- 处理：把 roundtrip spec 的 `test.setTimeout` 提回 `300_000` 量级，并把它视为长链验收，不再按短 smoke 预期判定。
- 防复发：`apps/web/e2e/production-run-project-package-roundtrip.spec.ts`

## EL-029 Shot Planning → Run Queue bridge E2E 的 shot seed 也不能再用旧扁平结构
- 日期：2026-07-06
- 症状：`shot-planning-run-queue-bridge.spec.ts` 第 2 条“runs bridged queue and exports Jianying handoff package”里，点击启动后长时间停在 `"生产队列运行中"`，`45s` 内等不到 `"已完成"`。
- 根因：这份 bridge spec 的 shot 节点仍是旧扁平 shape，只有 `data.title / prompt / image`；当前 `generate-storyboard-image` 回写链已统一要求 `nodeKind: "shot"` 与 `data.shot.{...}`，否则桥接出来的任务无法稳定完成。
- 处理：把 spec 的 shot seed 升到当前结构，补 `nodeKind: "shot"`、`sourceStoryboardNodeId`、`data.shot.{id,order,title,shotType,cameraMovement,duration,description,visualPrompt,dialogue,status}`；复跑后整套 `3 passed (3.4m)`。
- 防复发：`apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/src/lib/storyboard/createShotImageArtifacts.ts`

## EL-030 Shot Planning 创建执行队列不能只看 planning board，必须回查 source shot 节点
- 日期：2026-07-06
- 症状：Shot Planning 面板里把镜头标成 ready 后，“创建执行队列”长期只生成 `generate-storyboard-image` 单任务；`shot-planning-run-queue-bridge.spec.ts`、`run-queue-executor-bridge.spec.ts` 这类 bridge 证据也会继续把任务数写死成 2，而不是完整生产链。
- 根因：`shotPlanningRunQueueAdapter.ts` 之前只拿 `ShotPlanningBoard` 的轻量 item 数据，完全不知道源 shot 节点里的 `visualPrompt / dialogue / voiceIntent / warnings`，因此无法复用 `buildShotProductionBrief -> buildProjectPackageManifest -> buildProductionRunQueue` 这套共享规则，只能退回硬编码的单一 `generate-storyboard-image`。
- 处理：创建执行队列时额外传入原始 `sourceNodes`；adapter 对有 `data.shot` 的 ready item 直接回查源节点，复用共享 brief / manifest / queue builder 生成完整 `image -> video -> voice -> subtitle -> review` 链；没有源 shot 的旧节点才回落单图任务。相关浏览器证据已更新为 `shot-planning-run-queue-bridge.spec.ts` `3 passed (4.0m)`、`run-queue-executor-bridge.spec.ts` `2 passed (2.2m)`。
- 防复发：`apps/web/src/features/production/shotPlanningRunQueueAdapter.ts`, `apps/web/src/features/production/useShotPlanningRunQueueStore.ts`, `apps/web/src/features/production/ShotPlanningPanel.tsx`, `apps/web/e2e/shot-planning-run-queue-bridge.spec.ts`, `apps/web/e2e/run-queue-executor-bridge.spec.ts`

## EL-031 上游取图不能再手搓 `imageUrl/resultUrl` 顺序，否则 stale blob preview 会抢走 provider 可读图
- 日期：2026-07-06
- 症状：`reverse-prompt / talking-photo / focus-edit / upscale` 这几条共享执行入口之前各自手搓上游取图，只看 `imageUrl / resultUrl / assetUrl / thumbnailUrl`；一旦节点同时带 `blob:` 预览和 `generatedImageUrl`，就可能先吃到失效 blob，而不是 provider 可读图。
- 根因：这些入口没有复用 `videoSourceImage.ts` 里的共享选择规则，不认识“优先 `generatedImageUrl`，其次 `shot.generatedImageUrl / referenceImageUrl`，最后才是 blob preview”这套顺序，也不会顺手复用 `generatedImageAssetId / sourceImageAssetId`。
- 处理：在 `useWorkflowRunner.ts` 里把 `reverse-prompt / talking-photo / focus-edit / upscale` 的上游取图统一改成复用 `selectFirstCanvasImageSource` 与 `selectVideoSourceImageUrl`；新增 `upscale-provider-media-bridge.spec.ts`、`focus-edit-provider-media-bridge.spec.ts`、`talking-photo-provider-media-bridge.spec.ts`，专门验证 stale blob 预览存在时仍优先命中 `generatedImageUrl`。
- 防复发：`apps/web/src/app/canvas/utils/videoSourceImage.ts`, `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`, `apps/web/src/app/canvas/utils/videoSourceImage.test.ts`, `apps/web/e2e/upscale-provider-media-bridge.spec.ts`, `apps/web/e2e/focus-edit-provider-media-bridge.spec.ts`, `apps/web/e2e/talking-photo-provider-media-bridge.spec.ts`

## EL-032 不能用 localStorage seed `blob:` 音频来证明 talking-photo 上传音频桥接
- 日期：2026-07-06
- 症状：`talking-photo-provider-media-bridge.spec.ts` 早期版本把上传音频节点直接 seed 成 `audioUrl = "blob:..."`，结果运行后一直报“数字人缺少口播台词，请在节点或上游文本节点输入文案。”，看起来像运行时没识别上传音频。
- 根因：这不是产品逻辑先坏，而是测试种子先被 `sanitizePersistedCanvas.ts` 清洗掉了；`audioUrl` 属于 runtime URL，写入 localStorage 的 persisted canvas 时会被剥离，恢复后节点自然读不到音频输入。
- 处理：保留可恢复的音频节点与 `audioAssetId`，进页后再通过 `__starcanvasE2E.getNodeData(...)` 把 `audioUrl` 改回 runtime `blob:`，同时往 `startrail-media-assets` IndexedDB 填入同 id 的本地音频资产，再验证请求体里的 `audio` 已转成 `data:audio/...`。
- 防复发：`apps/web/e2e/talking-photo-provider-media-bridge.spec.ts`, `apps/web/src/lib/storage/sanitizePersistedCanvas.ts`
## EL-032 Auto Agent 生图不能只停在聊天气泡，必须自动回写画布与资产库
- 日期：2026-07-06
- 症状：`auto-agent-clarification.spec.ts` 之前最多只能证明“图片已生成”的聊天文案出现；真实产物仍停在消息气泡里，用户还得手点一次“添加到画布”，资产库也没有同步写入，导致这条链反复被误判成“差一点就能正式用”。
- 根因：`ChatPanel` 的 Auto Agent `onImageGenerated` 只更新 `message.generatedImage`，没有复用现成 `onAddImageToCanvas` 落画布链；同时 `StarCanvas.handleAddImageFromChat` 之前只创建图片节点，不会给这条路径补 `addAsset(...)`。
- 处理：Auto Agent 生图成功后立即复用现有 `onAddImageToCanvas` 路径自动落图；`GeneratedImage/ChatAttachment` 透传 `assetId`；`handleAddImageFromChat` 同步写入图片资产项。E2E 断言也从“只看气泡文案”升级为“聊天成功 + `__starcanvasE2E` 里出现 `ai-generated-image` 节点和 `chat-generated` 资产”，并继续覆盖“新开页恢复后再次触发 `reverse-prompt`”与“从素材库重新回画布后再次触发 `reverse-prompt`”。
- 防复发：`apps/web/src/app/canvas/components/chat/ChatPanel.tsx` `apps/web/src/app/canvas/hooks/useChatAttachments.ts` `apps/web/src/app/canvas/utils/autoAgentService.ts` `apps/web/src/app/canvas/StarCanvas.tsx` `apps/web/e2e/auto-agent-clarification.spec.ts` `apps/web/src/app/canvas/utils/autoAgentService.test.ts`

## EL-033 Vidu 浏览器链 E2E 的 provider seed 不能再用通用 `e2e.invalid` baseUrl
- 日期：2026-07-06
- 症状：`full-pipeline.spec.ts` 里右键运行 `video-generation` 后，`/api/ai/generate-video-vidu` 根本不会发出，请求数一直是 `0`；画布上实际出现的是“Vidu 视频模型当前只支持 DashScope / 百炼专用路由。”阻塞，而不是视频执行态。
- 根因：当前 `viduGenerateVideo()` 会先走 `resolveRuntimeProviderTaskContract("video", ...)`；这条判断依赖 runtime provider 能被识别成 `dashscope`。旧 spec 的 `/api/ai/config` 仍返回 `baseUrl = https://e2e.invalid/v1`，会把 usage provider 推断成通用 host，前置 dry-run 直接拦下，导致后面的 `/api/ai/generate-video-vidu` mock 永远打不到。
- 处理：把这条 spec 的 mocked `baseUrl` 改成 host 恰好为 `dashscope` 的值，再继续验证 Vidu SSE 与后续本地成片回收链。
- 防复发：`apps/web/e2e/full-pipeline.spec.ts` `apps/web/src/app/canvas/utils/videoGenerationService.ts` `apps/web/src/lib/ai/providerTaskRouting.ts`

## EL-034 生成视频只写回 `assetId` 还不够，恢复链也必须认识 `video-generation`
- 日期：2026-07-06
- 症状：即使视频生成结果已经成功回写了 `assetId / persistence`，刷新或项目恢复后，`video-generation` 这类节点仍可能丢失最终成片，只剩空壳元数据，看起来像“保存过但没真正回收”。
- 根因：`hydrateCanvasMediaNodes()` 之前只把 `uploaded-video` 当作可从 `localMediaStore` 恢复的视频节点；`video-generation / video-result / talking-photo / video` 虽然也会写 `assetId`，但恢复阶段不会 hydrate，localStorage 里又会剥掉旧 `blob:` URL，于是结果视频照样丢。
- 处理：把 IndexedDB 视频恢复逻辑扩展到所有生成型视频节点；同时补 `videoGenerationService.test.ts` 证明远程视频结果会先持久化为本地媒体资产，再补 `useCanvasPersistence.test.ts` 和 `full-pipeline.spec.ts` 证明节点可拿到 `blob + assetId + persistence`。
- 防复发：`apps/web/src/app/canvas/utils/videoGenerationService.ts` `apps/web/src/app/canvas/hooks/useCanvasPersistence.ts` `apps/web/src/app/canvas/utils/videoGenerationService.test.ts` `apps/web/src/app/canvas/hooks/useCanvasPersistence.test.ts` `apps/web/e2e/full-pipeline.spec.ts`

## EL-035 Auto Agent 真生图遇到 `524` 不能只留一条失败气泡
- 日期：2026-07-06
- 症状：Auto Agent 真实生图链碰到上游 `524` 时，之前只会把异常文本塞回聊天消息；用户既拿不到图片，也拿不到可继续迭代的画布产物，主链等于原地断掉。
- 根因：这条链有两个共享缺口同时存在：一是图片 route / client 对 `524` 归类不够准，既没明确标成 provider timeout，也没进入统一 retryable 语义；二是 Auto Agent 失败分支完全没给画布退路，`ask` 模式下更不会自动落任何节点。
- 处理：把 `524` 收口进共享 retryable 集合与 `PROVIDER_TIMEOUT` 归类；Auto Agent 的 `generate-image` 分支若遇 retryable 错误，自动退化成 `概念图待重试 Prompt` 节点，并在聊天里明确说明“真实生图暂时失败，但画布里已有可重试 prompt”。同时给 `imageGeneration.test.ts`、`normalizeGenerationError.test.ts`、`autoAgentService.test.ts` 和 `auto-agent-clarification.spec.ts` 补回归证据。
- 防复发：`apps/web/src/app/api/ai/generate-image/route.ts` `apps/web/src/lib/ai/normalizeGenerationError.ts` `apps/web/src/app/canvas/utils/imageGeneration.ts` `apps/web/src/app/canvas/utils/autoAgentService.ts` `apps/web/src/app/canvas/components/chat/ChatPanel.tsx` `apps/web/e2e/auto-agent-clarification.spec.ts`

## EL-036 `拆成制作圣经` 不能只停在 storyboard 文本任务，用户显式选择也应推进首批 shot
- 日期：2026-07-06
- 症状：`auto-agent-clarification.spec.ts` 新增“`拆成制作圣经` -> Shot Planning -> 创建执行队列”链路后，15 秒内 `shot` 节点数始终是 `0`；Project Bible 面板能打开，但永远桥不到 `Shot Planning`。
- 根因：旧链路只创建了 `分镜拆解任务` storyboard 节点，再附带 `run_node` 建议；但 `runNode(storyboard)` 当前只会把 AI 输出写回文本节点，不会自动拆成 `shot`。同时，即便用户在澄清按钮上做了显式选择，`run_node` 之前也仍被 `allowAIAutoRun` 当成未授权。结果是：Project Bible 路径既没有立即落地首批 shot，也没有把“用户已明确同意”传进 `run_node` 执行层。
- 处理：两层一起收口。其一，`buildProductionAssetBibleActions()` 直接复用现有 `parseStoryboardTextToShots() + generate_storyboard`，让 `分镜拆解任务` 在同一批 action 中就落出首批 shot；其二，`ChatPanel` 的“执行”/“澄清选项”路径改为向 `StarCanvas.applyChatActions()` 透传一次性 `allowRunNodeExecution`，把用户显式点击视为当前批次 `run_node` 的授权，不等于打开全局自动执行。新增 E2E 已覆盖“`拆成制作圣经` -> 首批 shot -> Shot Planning -> 创建执行队列”。
- 防复发：`apps/web/src/app/canvas/utils/autoAgentService.ts` `apps/web/src/app/canvas/utils/autoAgentService.test.ts` `apps/web/src/app/canvas/components/chat/ChatPanel.tsx` `apps/web/src/app/canvas/StarCanvas.tsx` `apps/web/e2e/auto-agent-clarification.spec.ts`

## EL-037 已有 Next dev server 时，真实 E2E 必须固定 `STARCANVAS_E2E_BASE_URL`
- 症状：真实 provider UI smoke 首次直接跑默认 Playwright 配置时，会再尝试启动一套 `next dev`，随后报 `"Another next dev server is already running."`，把环境冲突误判成业务失败。
- 根因：当前主仓经常常驻一个已配好 provider 的 dev server；若不显式传 `STARCANVAS_E2E_BASE_URL`，`playwright.config.ts` 会走默认 `webServer` 分支而不是复用现有实例。
- 处理：先探活现有 server 的 `/api/ai/config`，确认 `baseUrl/defaultModel/hasApiKey` 正确，再用固定 `STARCANVAS_E2E_BASE_URL=http://127.0.0.1:<port>` 复用它执行。2026-07-06 已据此跑通 `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`。
- 防复发：`apps/web/playwright.config.ts` `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` `docs/reference/current-capability-map.md`

## EL-038 `概念图待重试 Prompt` 不能只清 deferred 标记，必须补出真正的结果节点
- 日期：2026-07-06
- 症状：`auto-agent-real-provider-project-bible.spec.ts` 合并前的 fallback rerun 浏览器用例里，Auto Agent 真生图 `524` 回退后的 `概念图待重试 Prompt` 右键点“运行当前节点”后，`/api/ai/generate-image` 的第 2 次请求确实发出了，Workflow Run 面板也显示成功，但 `__starcanvasE2E.getNodes()` 里始终只剩原 prompt 节点，没有新的 `ai-generated-image` 结果节点。
- 根因：之前只把 deferred prompt 识别成“可走 image 分支的节点”，却没有把它接进 image 分支里“创建/回写结果节点”的共享出口；这段出口原本只给 `image-generation` 节点使用。结果就是运行成功只会把 prompt 节点上的 `imageGenerationDeferred` 清掉，看起来像成功，实际没有产物。
- 处理：Auto Agent fallback prompt 额外保留 `preferredImageModel / preferredAspectRatio / preferredImageSize`；`useWorkflowRunner` 识别 `prompt + imageGenerationDeferred + autoAgentIntent=generate-image` 后，会复用原始生图偏好，并在成功时补出 `ai-generated-image` 节点与 creative edge，同时清掉 deferred/error 状态。浏览器级证据已并到 `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`，验证 `524 -> Prompt -> 运行当前节点 -> image node + assetId` 全链。
- 防复发：`apps/web/src/app/canvas/utils/autoAgentService.ts` `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts` `apps/web/src/app/canvas/components/canvas/types.ts` `apps/web/src/app/canvas/utils/autoAgentService.test.ts` `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`

## EL-039 真实 `image smoke` 不能写死 `30_000ms`，必须尊重 provider timeout
- 日期：2026-07-06
- 症状：当前 `http://127.0.0.1:3125 -> copse.top/v1` 上，最小 `/api/ai/provider-smoke/run` 图片 smoke 在修复前约 `32.7s` 就返回 `502` 与“AI 请求超时”，但同一 provider 在更长等待后其实能成功出图。
- 根因：`apps/web/src/app/api/ai/provider-smoke/run-core.ts` 的 image 分支之前把 `fetchWithTimeout(..., 30_000)` 写死，绕过了 provider 已配置的 `timeoutMs=180000`，于是 smoke 先被本地假超时截断，误报成 provider 不可用。
- 处理：改为复用 `config.timeoutMs`，并补单测 `real image smoke respects provider timeout overrides` 锁住合同。修复后，同日最小真实图片 smoke 已在约 `67.1s` 成功返回 `gpt-image-2` 结果。
- 防复发：`apps/web/src/app/api/ai/provider-smoke/run-core.ts` `apps/web/src/app/api/ai/provider-smoke/run-core.test.ts` `docs/reference/current-capability-map.md`

## EL-040 Auto Agent 真生图不能把聊天模型误传给图片链
- 日期：2026-07-07
- 症状：真实 UI 生图 smoke 在 fresh server 上首次运行时，聊天侧已进入生图路径，但 `/api/ai/generate-image` 直接收到 `gpt-5.5`，上游返回 `images endpoint requires an image model, got "gpt-5.5"`。
- 根因：`ChatPanel` 调 `processWithAutoAgent()` 时把当前聊天模型 `model` 误塞进了 `imageModel`；而这里的 `model` 默认是文本模型，不是独立图片模型配置。
- 处理：删掉这条误传，让 Auto Agent 生图分支回到既有 `defaultImageModel / settings imageModel` 选择链，不再让聊天模型污染图片请求。
- 防复发：`apps/web/src/app/canvas/components/chat/ChatPanel.tsx` `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`

## EL-041 真实 UI 生图 smoke 不能用长中文电影海报 prompt 充当稳定验收样本
- 日期：2026-07-07
- 症状：真实 UI 生图 smoke 早期用“1:1 电影感海报”中文长 prompt 时，`copse.top -> gpt-image-2` 多次落到 Cloudflare `524`，产品会按设计退化成 `概念图待重试 Prompt` 节点；这会把“provider 波动”误读成“自动回写链失效”。
- 根因：这条验收 spec 同时叠了中文 prompt 增强、较长描述、外部 provider 延迟与浏览器等待预算，样本本身不稳定，不适合做固定硬证据。
- 处理：复用已在 `provider-smoke` 跑通的最小英文图片 prompt 作为 UI smoke 输入。2026-07-07 在 fresh `http://127.0.0.1:3172` 上，`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 已 `1 passed (1.6m)`，同机 `POST /api/ai/provider-smoke/run` 的 image smoke 也返回 `ok:true`。
- 防复发：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` `apps/web/src/app/api/ai/provider-smoke/run-core.ts` `docs/reference/current-capability-map.md`

## EL-042 mock fallback E2E 不能把预期 502 记成真实控制台故障
- 日期：2026-07-07
- 症状：`概念图待重试 Prompt -> 运行当前节点` 的浏览器验收已经完成退化与补图闭环，但用例尾部仍因 `consoleErrors` 收到故意 mock 的 `HTTP 502: /api/ai/generate-image` 而失败，表面像产品回归。
- 根因：`collectConsoleErrors` 统一收集所有 `>=500` 响应；而该 fallback 用例第一跳本来就要模拟可重试 timeout，所以预期失败响应也被算进了异常噪声。
- 处理：不改共享 collector，只在这个 fallback 用例里排除该条明确预期的 `502 /api/ai/generate-image`；其余 console/page error 继续严格要求为空。
- 防复发：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts`

## EL-043 Project Bible“可继续编辑”验收点不能绑到 `shotCount=0` 的角色卡
- 日期：2026-07-07
- 症状：真实 `制作圣经` UI smoke 里，`林雾/周祁` 条目虽然已落进 `ProjectBiblePanel`，但把“继续编辑”证据绑到角色卡 `role` 保存后，断言仍失败，看起来像面板没法编辑。
- 根因：`handleApplyCharacterAssetPatch()` 只会把 patch 写回“已挂到 shot 的角色引用”；这次 real-provider 产物里的角色卡 `shotCount=0`，因此不适合拿它证明稳定编辑链。另一个噪声是角色卡排序会变化，别把首屏可见按钮绑死到某个名字。
- 处理：保留“角色/场景条目已落面板”的硬断言，但把“可继续编辑”切到稳定的 `视觉` tab：修改全局 `stylePrompt`，再用 `__starcanvasE2E` 直接验证 `projectVisualBible/compositeSettings` 已写回。
- 防复发：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` `apps/web/src/app/canvas/StarCanvas.tsx`

## EL-044 real-provider 生成队列不能照抄 mock 链路断言“立即可开跑”
- 日期：2026-07-07
- 症状：`Project Bible -> Shot Planning -> create queue` 的真实 UI smoke 里，队列面板已正常出现、任务已创建，但若沿用 mock spec 断言 `production-run-queue-start` 立刻可点，会失败，看起来像 queue 没接上。
- 根因：这条真实链默认会产出含视频任务的完整生产队列；而当前机上的 `Vidu / DashScope` 合同会在启动前就把视频模型阻塞显式暴露出来，所以正确 UI 是“队列已建成，但 start disabled + 展示首条阻塞原因 + 提供设置入口”。
- 处理：把该 real-provider 验收点改成验证 `production-preflight-summary`、disabled 的 `production-run-queue-start`、`production-provider-fix-hint`、`production-provider-open-settings` 和 `blocked-action` 列表，而不是强断言“立即可开跑”。
- 防复发：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`

## EL-045 real-provider 队列 smoke 不能把 task row 状态当作“开始执行”的最早硬证据
- 日期：2026-07-08
- 症状：在同一条 `Project Bible -> Shot Planning -> create queue -> 保存设置 -> 一键开始生产` 真实 UI smoke 里，`production-run-queue-status` 已进入 `运行中`，但若继续强断言 `production-run-queue-task` 在 `30s` 内出现 `准备中 / 运行中 / 已完成 / 部分失败`，浏览器仍会超时，看起来像首个任务根本没动。
- 根因：这条 smoke 的右侧主视图先稳定暴露的是 queue-level 运行态与共享 `BatchProgressBar`（`🖼️ 准备中... / 生成中...`）；task row 的细粒度状态不是这条真实链里最早、最稳的可见信号。把证据压到 task row，等于把验收绑到更深一层的 UI 时机。
- 处理：保留 `生产任务执行中` + `production-run-queue-status=运行中`，再把“首个任务真动了”的补充证据改成共享 `BatchProgressBar` 文案 `🖼️ 准备中...` 或 `🖼️ n/n 生成中...`，不再要求 task row 先变状态。
- 防复发：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` `apps/web/src/app/canvas/components/nodes/BatchProgressBar.tsx` `docs/reference/current-capability-map.md`

## EL-046 Real provider UI smoke 只 seed 任意 session key，会把 provider/key 失配误判成前端链路失败
- 日期：2026-07-08
- 症状：`auto-agent-real-provider-project-bible.spec.ts` 已看到 `0 阻塞 / 一键开始生产 / 生产任务执行中 / 🖼️ 准备中...`，但继续等“首张真实图片回写到 shot 节点 + 资产库”时超时，表面像生产队列或回写链断了。
- 根因：测试最初只 seed `startrails_session_api_key`，没 seed `startrails_provider_*` overrides。当前 health 摘要把“有任意 session key”视作 image ready，但真实 `/api/ai/generate-image` 仍按当前 provider/baseUrl 发请求；当 session key 与该 provider 不匹配时，首图阶段会真实爆 `INVALID_API_KEY`。这不是前端状态机 bug，而是测试前置条件失配。
- 处理：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 现已支持 `STARCANVAS_REAL_PROVIDER_OVERRIDE_BASE_URL / DEFAULT_MODEL / IMAGE_MODEL / VIDEO_MODEL / TIMEOUT_MS` 预置到浏览器 localStorage，并把“项目圣经链路里的首图回写断言”收口到显式开关 `STARCANVAS_REAL_PROVIDER_PROJECT_BIBLE_IMAGE_WRITEBACK_SMOKE=1`。
- 防复发：先用匹配的 provider/key 组合跑 `provider-smoke/run`，再开 `PROJECT_BIBLE_IMAGE_WRITEBACK_SMOKE`；不要再把“任意 session key”当成真实 image ready 证据。

## EL-047 不要把 `queue-start` 证据和 `image writeback` 证据硬塞进同一条默认 smoke
- 日期：2026-07-08
- 症状：同一条 `Project Bible -> create queue -> start -> 首图回写` 真实 UI smoke 反复拖成超长链，默认预算里既想证明“能开工”，又想证明“真实首图已回写”，结果一旦 provider 延迟升高，就会把强链路波动误读成主链失效。
- 根因：这两类证据的时延层级不同。`queue-start` 只需证明 `0 阻塞 / 一键开始生产 / 生产任务执行中 / 🖼️ 准备中...`；而 `image writeback` 在当前 `copse.top -> gpt-image-2` 路径下本来就是分钟级，适合放在 dedicated image smoke 中单独验，不适合默认绑进项目圣经基线 smoke。
- 处理：默认验收已拆成两条正交硬证据：1) `apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 的 `queue-start` 基线 smoke；2) 同文件 `real provider UI smoke can generate an image and auto-write it into canvas + asset library` 的 dedicated writeback smoke。组合长链保留为显式开关 `STARCANVAS_REAL_PROVIDER_PROJECT_BIBLE_IMAGE_WRITEBACK_SMOKE=1`。
- 防复发：先问“这次要证明的是开工能力，还是产物回写能力”。默认只跑最短能回答该问题的 smoke，不再把两个问题强绑到一条 E2E。

## EL-048 `queue image writeback` 也不能混进默认 real image smoke
- 日期：2026-07-08
- 症状：新补的 `real provider queue smoke writes first storyboard image back into shot node + asset library` 若挂在 `STARCANVAS_REAL_PROVIDER_AUTO_AGENT_IMAGE_UI_SMOKE=1` 下，会把默认 real image 回归从“短主链”重新拉回分钟级长测；一旦 server 冷启动或 provider 变慢，就会再次制造“默认 smoke 反复卡住”的错觉。
- 根因：这条 queue 证据本质上是在补“生产队列首图回写”专项，不是默认“真实生图自动回写”专项；两者共享部分根路径，但时延和前置条件不同。
- 处理：已把它单独挂到 `STARCANVAS_REAL_PROVIDER_QUEUE_IMAGE_UI_SMOKE=1`。默认 `REAL_PROVIDER_AUTO_AGENT_IMAGE_UI_SMOKE` 只跑 dedicated real image auto-writeback，不再顺带跑 queue 长测。
- 防复发：凡是超过默认 smoke 预算、且前置条件多于 1 层的 real E2E，都先独立 env 开关，再决定是否提升为默认回归。

## EL-049 首张分镜图真实回写卡点不在 provider，而在 image node 未自动同步资产库
- 日期：2026-07-08
- 症状：`real provider queue smoke writes first storyboard image back into shot node + asset library` 初次跑到 `360s` 超时前，`shotImageLinked=true`、`imageNodePresent=true`，唯独 `assetPresent=false`，表面像“回写链只成功了一半”。
- 根因：`createShotImageArtifacts()` 负责把结果写回 `shot.generatedImageAssetId/generatedImageNodeId` 并产出 image node，但它的几个调用点此前只更新 `nodes/edges`，没有复用既有 `handleSaveToAssetLibrary()` 路径，所以真实图片虽然已挂到画布和 shot 节点，却没自动进资产库。
- 处理：在 `apps/web/src/app/canvas/StarCanvas.tsx` 收口了共享 `syncImageNodeToAssetLibrary()`，并接到 3 条真链：`production queue generate-storyboard-image`、`handleGenerateShotImage()`、`handleRegenerateShot()`。2026-07-08 已据此重新跑通同机真实 queue smoke，`1 passed / 1.2m`。
- 防复发：凡是 `createShotImageArtifacts()` / `createShotImageNode()` 新增调用点，都要同步检查“node 写回”和“asset library 写回”是否一起成立，不再只盯 `assetId` 字段本身。

## EL-050 证据已成立后，不要再让清理步骤反过来打挂长测
- 日期：2026-07-08
- 症状：修完 `assetPresent` 后，queue writeback 长测仍失败，但失败点已变成尾部 `production-run-queue-abort`：首图真实回写证据已成立，测试却因 `abort` 按钮在当下视图里不可点而被误判成失败。
- 根因：这条 smoke 的硬标准是“首张分镜图是否已真实回写到 shot 节点 + image node + asset library”，不是“队列 UI 清理动作永远可点”。把 cleanup 动作绑进断言，会把已完成的证据再次拖回 UI 时机问题。
- 处理：去掉这条 smoke 尾部的强制 `abort` 点击，让用例在核心证据达成后直接结束。2026-07-08 fresh 重跑后通过。
- 防复发：长链 E2E 一律先定义唯一硬标准；一旦标准已满足，后续清理只能做 best-effort，不能再作为主断言。

## EL-051 恢复后再执行 E2E 不要用全局 `/成功/` 宽匹配
- 日期：2026-07-08
- 症状：`apps/web/e2e/project-package-roundtrip.spec.ts` 的“导入恢复后重跑 `image-result -> video-generation`”链路实际上已跑通，请求已发出、`Workflow Run` 已出现、节点也已回写 `assetId/resultUrl/persistence`，但用例仍因 `getByText(/成功/)` 报 strict mode violation 而假红。
- 根因：同一页面同时存在“项目包导入成功”与“Workflow Run 成功”两类成功态，全局宽匹配会命中多个元素；再叠加固定 `waitForTimeout(2000)`，就把本来已经成立的硬证据重新拖回易抖 UI 文案层。
- 处理：改为 `expect.poll(() => videoRequests.length).toBe(1)` 等待真实 rerun 请求发出，并删掉 `/成功/` 宽匹配；保留 `Workflow Run`、`1/1 完成` 与节点 `assetId/blob resultUrl/indexeddb persistence` 作为唯一硬证据。2026-07-08 fresh 重跑 `e2e/project-package-roundtrip.spec.ts`：`2 passed (4.5m)`。
- 防复发：恢复链 / 长链 E2E 只绑定唯一产物证据或唯一状态面板，不再使用“成功/完成/已保存”这类会与 toast、导入态、历史卡片串台的全局文案选择器。

## EL-052 Project Bible 角色卡 E2E 不要假设卡片顺序稳定
- 日期：2026-07-08
- 症状：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 在真实 `Project Bible` smoke 里尝试点 `.first()` 角色卡的“三视图入口”时，实际点开的是 `周祁`，随后对 `— 林雾` 的断言假红；改成按 `林雾` heading 过滤后，又因为角色卡在滚动区下半段，直接点击/滚动都超时。
- 根因：真实 provider 产出的角色项顺序不应被 E2E 视作合同；同时侧栏是滚动容器，底部角色卡必须先按具体 heading 锚定，再滚入可视区。
- 处理：改成先定位 `projectBiblePanel.getByRole(\"heading\", { name: \"林雾\" })`，再用 `xpath=ancestor::article[1]` 回到对应卡片，`scrollIntoViewIfNeeded()` 后再点 `project-bible-open-character-view`。2026-07-08 同机 real smoke 重新通过：`1 passed (1.5m)`。
- 防复发：Project Bible / Asset Library / Queue 这类列表型面板，凡是点具体条目，一律按稳定业务文本或 id 锚定，不再用 `.first()` / `.nth(0)` 假设排序。

## EL-053 角色三视图 `data:image` 结果不能只写 URL，必须同时落 `assetId` 并在恢复时 hydrate
- 日期：2026-07-08
- 症状：`Project Bible -> 角色卡 -> 三视图生成` 当次会话里能看到正/侧/背图，但一旦保存后刷新或新开页面再进同项目，这些图会消失，表面像“生成成功但恢复失败”。
- 根因：`apps/web/src/app/api/ai/generate-character-view/route.ts` 当前通过 `response_format: "b64_json"` 返回 `data:image/png;base64,...`；旧链路只把 `frontViewUrl/sideViewUrl/backViewUrl` 写进 `shot.characterIdentities`，没同步落 `frontViewAssetId/sideViewAssetId/backViewAssetId`。而 `sanitizePersistedCanvas` 会剥掉持久化里的 `data:image` / `blob:`，结果刷新后没有可恢复的本地资产锚点。
- 处理：在 `apps/web/src/app/canvas/StarCanvas.tsx` 的 `handleApplyCharacterAssetPatch()` 前收口 `persistCharacterViewPatch()`，把三视图 `data:image` 先持久化到本地资产层，再把 `objectUrl + assetId` 一起写回；同时在 `apps/web/src/app/canvas/hooks/useCanvasPersistence.ts` 为 `shot.characterIdentities[*].front/side/backViewAssetId` 补 hydration。新增单测 `apps/web/src/app/canvas/hooks/useCanvasPersistence.test.ts` 与浏览器回归 `apps/web/e2e/project-bible-character-view.spec.ts`，现已证明“三视图生成 -> 回写引用 shot.characterIdentities -> 跨新页恢复仍可见”。
- 防复发：凡是 provider 返回 `data:image` / `blob:` 的生成结果，只要要跨刷新保存，就不能只存 URL；必须同步落本地 `assetId`，并在 `hydrateCanvasMediaNodes()` 或同层共享恢复入口补回 object URL。

## EL-054 恢复后的角色参考图判定不能只认 URL，`frontViewAssetId` 也必须算有效锚点
- 日期：2026-07-08
- 症状：三视图恢复链已经把 `frontViewAssetId/sideViewAssetId/backViewAssetId` 存下来了，但 `validate-character-consistency` 这类检查若在 URL 尚未 hydrate 完成前运行，仍可能把角色误报成“缺少 参考图”。
- 根因：`apps/web/src/app/canvas/utils/autoAgentService.ts` 旧判定只接受 `referenceAssetId || frontViewUrl || avatarUrl`，没把已持久化但尚未恢复成 object URL 的 `frontViewAssetId` 视作有效参考锚点。
- 处理：把判定收口为 `referenceAssetId || frontViewAssetId || frontViewUrl || avatarUrl`，并补单测 `treats restored character frontViewAssetId as a valid reference anchor`。2026-07-08 `autoAgentService.test.ts` 已 fresh 通过 `18/18`。
- 防复发：凡是“本地资产已持久化、URL 由 hydration 补回”的字段，业务校验层都先认 `assetId`，再认运行时 URL，避免把恢复中的合法状态误判成缺失。

## EL-055 Production preflight / fix draft 也不能只认 URL，恢复后的三视图 `*ViewAssetId` 必须直通下游消费
- 日期：2026-07-08
- 症状：角色三视图恢复链已经能把 `front/side/backViewAssetId` 存活下来，但下游 `productionPreflight` 仍可能把镜头判成 `missing-character-anchor`，`productionPreflightFix` 也会继续注入“待确认”占位文案，表面像“恢复成功了，但生产预检还是不信”。
- 根因：`apps/web/src/lib/storyboard/productionPreflight.ts` 与 `apps/web/src/lib/storyboard/productionPreflightFix.ts` 旧逻辑都只认 `referenceAssetId` 或 `front/side/backViewUrl`，没把已持久化但尚未 hydrate 成 object URL 的 `front/side/backViewAssetId` 当作有效角色锚点。
- 处理：把两个共享消费层都收口到统一判定：`referenceAssetId || frontViewAssetId || sideViewAssetId || backViewAssetId || front/side/backViewUrl`。新增单测：
  - `apps/web/src/lib/storyboard/productionPreflight.test.ts` -> `treats restored character view asset ids as valid reference anchors`
  - `apps/web/src/lib/storyboard/productionPreflightFix.test.ts` -> `does not inject placeholder anchors when restored character view asset ids already exist`
  2026-07-08 fresh 结果：Node `14/14` 通过，`typecheck` 通过，`project-bible-character-view.spec.ts` 回归 `1 passed (1.0m)`。
- 防复发：凡是下游消费“角色参考锚点”的共享层，都先认持久化 `assetId`，再认运行时 URL；不要把“恢复可见”与“可进入生产预检/修复草案”拆成两套口径。

## EL-056 StarCanvas E2E 必须复用仓库标准 webpack dev server，不能临时切到裸 `next dev`
- 日期：2026-07-09
- 症状：同一条 `project-bible-character-view.spec.ts` 在逻辑已正确时，仍会随机掉进 `Canvas Error Boundary`，报 `"Failed to load chunk /_next/static/chunks/...TimelinePanel..."`，表面像 Add Node / Project Bible / 角色三视图链同时坏了。
- 根因：临时用裸 `next dev --hostname ... --port ...` 起的是 Turbopack 路径，而主仓平时回归走的是 `apps/web/package.json` 里的 `next dev --webpack`。两条 dev 路径的 chunk 行为不同，浏览器 cache + 动态面板加载会制造假红。
- 处理：回到仓库标准启动法：`PORT=3172 HOSTNAME=127.0.0.1 npx -y pnpm@10.33.0 --filter web dev`。切回 webpack 后，同一条浏览器回归恢复为 `1 passed (41.6s)`。
- 防复发：本仓 Playwright 一律固定 `BASE_URL` + 固定 `webpack dev`，不要为了省一步直接改成裸 `next dev`；否则长链 E2E 会把环境差异误报成产品回归。

## EL-057 `project-bible-character-view` 这条恢复链不能把“已完成交付”当唯一硬标准
- 日期：2026-07-09
- 症状：同一条 `project-bible-character-view.spec.ts` 已经证明“三视图生成 -> 写回 `shot.characterIdentities` -> 跨新页恢复 -> `Shot Planning -> create queue -> 0 阻塞`”，但若继续强断言 `production-run-queue-status=已完成`，用例会长期停在 `"生产队列运行中"`，表面像恢复链或预检消费仍未闭环。
- 根因：这条 seeded 恢复链一开始没有显式 mock `/api/ai/generate-image` 长任务完成态；当时 `apps/web/src/app/canvas/utils/imageGeneration.ts` 的 `generateImageFromPrompt()` 也不会因 `localStorage.startrails_use_mock=true` 自动短路 `/api/ai/generate-image`。因此这里真正被验证的是“恢复后能否再次进入生产执行入口”，不是“整条真实图片长任务是否必定在测试预算内完成”。
- 处理：先把这条 spec 的硬标准收口为：`production-preflight-summary=0 阻塞`、开始按钮可点击、点击后 `production-run-queue-status=运行中`。随后再在 `apps/web/src/app/canvas/utils/imageGeneration.ts` 为 `useMock` 加前端短路 mock 图返回，并补单测 `apps/web/src/app/canvas/utils/imageGeneration.test.ts` -> `short-circuits to a mock image when useMock preference is enabled`，确保恢复链 / 桥接链不会再误打真实 `/api/ai/generate-image`。同日又把 `apps/web/e2e/project-bible-character-view.spec.ts` 补强为轮询 `shot.generatedImageAssetId/generatedImageNodeId + ai-generated-image 节点 + 资产数增长`，fresh 结果 `1 passed (1.2m)`，证明“恢复后再次进入工作流执行”现在已不只到运行态，还能拿到首张分镜图回写证据。完成态证据继续由专门的真实队列 smoke / queue image writeback 长测承担，不再在这条恢复链里重复证明。
- 防复发：E2E 一条只守一个硬标准。恢复链验证“能恢复并再次进入工作流”；真实队列长任务验证“能完成并回写产物”。不要把两类证据重新绑回一条超长链。

## EL-058 项目包导出不能只带扁平节点字段，`shot.generatedImage*` 也必须进包
- 日期：2026-07-09
- 症状：`project-bible-character-view.spec.ts` 已经在运行时证明“恢复后 -> queue 首张分镜图已回写到 shot + image node + asset library”，但继续导出项目包时，导出的 JSON 里 `shot.generatedImageNodeId/generatedImageAssetId` 却是 `undefined`，表面像“画布里看得到，交接包里丢了”。
- 根因：`apps/web/src/app/canvas/utils/projectPackageExport.ts` 的 `buildProjectPackageCanvasNodes()` 只白名单导出一批扁平 `data.*` 字段，完全没把 `data.shot` 带进项目包；因此恢复链生成出的 `generatedImageNodeId/generatedImageAssetId` 在导出层被直接裁掉。
- 处理：给 `ProjectPackageCanvasNode.data` 补 `shot?: CanvasNodeData["shot"]`，并在返回 payload 时显式写入 `shot: data.shot`。新增单测 `apps/web/src/app/canvas/utils/projectPackageExport.test.ts` -> `keeps shot generated image linkage metadata for downstream restore/export flows`；同日浏览器回归 `apps/web/e2e/project-bible-character-view.spec.ts` 也已 fresh `1 passed (1.1m)`，证明恢复后首张图不只会回写运行时，还能继续进入 `导出项目包`。
- 防复发：凡是项目包导出需要支持“恢复后再消费”的链路，不能只导扁平字段；`shot` 这类结构化下游锚点必须进入包体，运行时 URL 继续交给 `sanitizePersistedCanvas` 清洗。

## EL-059 real provider `Project Bible` smoke 不能把“5 秒内没出现执行按钮”当成 direct 成功
- 日期：2026-07-09
- 症状：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 的 `real provider UI smoke can bootstrap a project bible from one sentence` 在 fresh 实跑时，会卡在 `project-bible-panel` 永远不出现；失败截图里其实已经出现了 `执行 1 个操作` 按钮，只是出现时机晚于旧 spec 的 5 秒探测窗口。
- 根因：旧 spec 先等 `拆成制作圣经` 25 秒，再只额外等 `执行 N 个操作` 5 秒；真实 provider 可能在更晚时刻才产出动作按钮，于是 spec 会把“按钮晚到”误判成“direct bootstrap 已开始”，随后直接去等 `project-bible-panel`，造成假红。
- 处理：把分支探测改成统一等待 `clarification / apply / project-bible-panel ready` 三选一，最长 120 秒；若先出现 `执行 N 个操作` 就点击，不再假设它一定在 5 秒内出现。2026-07-09 fresh 复跑：`STARCANVAS_REAL_PROVIDER_AUTO_AGENT_UI_SMOKE=1 ... --grep "real provider UI smoke can bootstrap a project bible from one sentence"` -> `1 passed (1.2m)`。
- 防复发：真实 provider 的 Chat / Auto Agent E2E，分支判定一律等“任一可接受终态”，不要把早到/晚到的单一按钮时机写死成合同。

## EL-060 queue 首图真实回写 smoke 需把“provider 契约阻塞”和“真实生成失败”分开看
- 日期：2026-07-09
- 症状：`apps/web/e2e/auto-agent-real-provider-project-bible.spec.ts` 的 `real provider queue smoke writes first storyboard image back into shot node + asset library` 在 2026-07-09 fresh 实跑里出现了三种不同失败：1) 无 `STARCANVAS_REAL_PROVIDER_SESSION_API_KEY` 时，保存设置后 `production-run-queue-start` 仍 disabled；2) 用阿里 key 时，图片任务报 `INVALID_API_KEY`；3) 用 `copse.top` key 时，队列能启动，但图片任务报 `fetch failed`，360 秒内始终没有 `shot.generatedImage* + ai-generated-image + asset library` 回写。
- 根因：这条 smoke 同时覆盖了 `图片生成 + 视频链路 provider 契约 + 生产队列编排 + 首图回写` 四层条件。当前实配下，`queue` 面板会因视频链路进入“1 复核”状态；即便强行用 session key 起跑，也不代表图片链和后续回写一定稳定，导致“可启动”和“已回写”不能再被当成同一个断言层级。
- 处理：先把这条 fresh 结果如实写回 `docs/QA_CHECKLIST.md`，当前口径改为 `fresh 失败（queue smoke 1 failed / 6.3m）`；同时保留同日已 fresh 通过的隔离证据：`Auto Agent bootstrap` `1 passed (1.2m)`、isolated real image smoke `1 passed (3.7m)`，据此把问题范围收窄到 `queue 编排 / provider 契约 / 首图回写` 复合链，而不是整条图片 provider 已死。
- 防复发：生产队列真实 smoke 一律先区分 3 层：`可启动`、`任务实际执行`、`产物回写落库`。不要因为前两层通过，就默认第三层也成立；也不要因为第三层失败，就反推前两层一定同样坏。
## EL-061 queue 首图真实回写遇到瞬时上游抖动时，必须带可追踪 requestId 且在队列层再退避一次
- 日期：2026-07-09
- 症状：同一条 `real provider queue smoke writes first storyboard image back into shot node + asset library` 在失败日志里多次只出现 `no-request-id upstream attempt ...`；一旦 route 内两次上游请求都被瞬时网络抖动打断，首图任务就直接失败，外层 queue 没有第二道缓冲。
- 根因：`apps/web/src/app/canvas/StarCanvas.tsx` 的 `generate-storyboard-image` 分支之前直接调用 `generateImageFromPrompt({ prompt, model, size })`，既没给请求级 `requestId`，也没复用现成 `retryWithBackoff()`。结果 dev log 难追踪，且队列对短时 provider / Cloudflare 抖动过于脆弱。
- 处理：给队列图任务补 `requestId = production-queue-image-${task.id}-${Date.now()}`，并在 queue 层包一层 `retryWithBackoff()`；重试期间把 `shotNode.data.generationStatus` 切到 `retrying`。2026-07-09 fresh 复跑同一条 real queue smoke：`1 passed (1.0m)`；同机 dev log 已出现 `production-queue-image-e2e-real-queue-shot-1:generate-storyboard-image-... upstream attempt 1 / 2`。
- 防复发：凡是生产队列里会真实打远端 provider 的任务，都必须满足两条：1) 请求级 `requestId` 可追踪；2) 编排层至少再兜一层退避重试，不能完全把成功率赌在 route 内部那一层。
## EL-062 `sessionApiKey` 不能再默认当成 text/image/chat 全局覆盖，只能按显式路由提示或 video 专用放行
- 日期：2026-07-09
- 症状：同一台机器上，单独为了 Vidu / DashScope 填的 `sessionApiKey` 会顺手污染 text/image/chat：图片链可能直接报 `INVALID_API_KEY`，健康摘要和开始按钮也会把“只填了一个裸 session key”误判成 text/image 已可用。
- 根因：此前 `getRuntimeProviderState()`、`useChatSSE`、`provider-health-summary` 都把 `sessionApiKey` 当成无条件全局覆盖；只要 storage 里有 key，就会覆盖 server-env key，哪怕用户根本没给 text/image 指定显式 `baseUrl` / provider route。
- 处理：新增 `apps/web/src/lib/ai/providerSessionScope.ts`，统一约束为：`video` 永远可用 session key；`text/image` 只有在存在显式 `apiBaseUrl` / local override 路由提示时才附带 session key。接线点已收口到 `client.ts`、`useChatSSE.ts`、`provider-health-summary.ts`、`ProductionRunQueuePanel.tsx`、`SettingsPanel.tsx`，并补 `providerSessionScope.test.ts` + `provider-health-summary.test.ts`。fresh 结果：Node `11 passed`、`typecheck` 通过、real queue smoke 仍 `1 passed (1.3m)`。
- 防复发：会话级 key 一律先问“这次有没有显式路由提示”；没有，就别把它当 text/image/chat 的全局覆盖。video 走专用路由例外，但也要显式写在 helper 里，别散落在各 caller。

## EL-064 `setNodes/setEdges` 旁路写入不能让同步 ref 继续漂移
- 日期：2026-07-10
- 症状：`StarCanvas.tsx` 已用 `nodesRef.current / edgesRef.current` 规避 React state 延迟，但仍有少数 UI 入口直接 `setNodes()` / `setEdges()`，后续审计会反复怀疑恢复、导入、导出或工作流读取旧节点。
- 根因：文件内已经有 `applyNodeUpdates()` / `applyEdgeUpdates()`，但历史叶子入口没有统一复用；版本快照恢复也只更新 React state，未同步 refs。
- 处理：快照恢复先同步 `nodesRef.current / edgesRef.current`；Crew Agent 结果、文档导入、Poster Editor 保存、参数面板、逆向分镜导入、Remix 导入、Shot Library、AI Script、Timeline、Panorama、资产库拖回、批量删除/复制统一改用 `applyNodeUpdates()` / `applyEdgeUpdates()`；视频导入改为从 `nodesRef.current` 直接生成 next nodes 后再 `setNodes(nextNodes)`；Remix 派生、合成 fallback、上传图片/文档、普通新增节点、复制/粘贴、聊天附件、分镜最终图、AI variant 结果等新增/派生入口也同步收口；快照恢复、模板加载、项目包导入、undo/redo、删边、React Flow 手动连线同步 refs，避免恢复/导出/撤销或后续执行读旧边；已有分镜过程节点隐藏时也改为先同步 `nodesRef.current` 再 `setNodes()`。
- 防复发：新增画布写入口优先复用 `applyNodeUpdates()` / `applyEdgeUpdates()`；必须裸写时，同一同步块内显式更新对应 ref。

## EL-065 当前能力矩阵不能把已通过测试的能力继续写成缺口

- 日期：2026-07-11
- 症状：`current-capability-map.md` 仍称项目包跨设备只能恢复结构和资产线索，导致后续再次把“素材 bytes 恢复”选为 P1；实际代码与测试已覆盖图片、视频、音频 bytes 的 manifest 导出、导入恢复和下游再消费。
- 根因：功能落地后只更新了错误账本和测试，未同步更新唯一选题事实源；“完成记录”和“剩余缺口”发生漂移。
- 处理：fresh 运行项目包导出/导入单测 `12/12` 后，更新能力矩阵；真实剩余风险收窄为大体积 data URL JSON 的包体积、内存和导出提示，不再重复实现 bytes 恢复。
- 防复发：选题前交叉检查能力矩阵、错误账本、代码与 fresh 测试；若测试已证明完成，先修事实源，再选下一项。

## EL-066 项目包恢复了媒体 bytes，也要防止超大 JSON 静默占满内存

- 日期：2026-07-11
- 症状：项目包为保证跨设备恢复会内联图片、视频、音频 data URL；大项目点击导出时没有体积提示，用户可能误以为卡死。
- 根因：导出链直接 `JSON.stringify -> Blob -> download`，没有对最终序列化 bytes 做最低成本预检。
- 处理：复用已生成的 JSON 字符串，以 `TextEncoder` 计算 UTF-8 bytes；超过 100 MiB 时显示实际 MiB、内存风险与取消入口，不增加依赖、不重复读取素材。
- 防复发：`apps/web/src/app/canvas/utils/projectPackageExport.test.ts` 固定边界行为；未来若改流式 ZIP，先保留同等体积/风险反馈。

## EL-067 Auto Agent 交付长链总 timeout 必须覆盖前置澄清和生产阶段

- 日期：2026-07-11
- 症状：`auto-agent-creative-production-handoff.spec.ts` 在 production build 下停在 `1/2 完成 / 生成视频执行中`，表面像生产队列再次卡死。
- 根因：测试总 timeout 仅 95 秒；trace 证明点击“开始生产”时已消耗约 90 秒，后续声明的 60 秒完成等待实际只剩约 5 秒，Playwright 先触发总 timeout。
- 处理：总 timeout 调整为 240 秒，保留队列完成等待和交付 ZIP 断言，不放宽业务成功标准。
- 防复发：长链总预算必须大于所有串行阶段预算；判断队列卡死前先比较 trace 中测试起点、开始生产点击和失败时间。

## EL-068 mock 前端短路后，E2E 不得继续把网络请求次数当成功标准

- 日期：2026-07-11
- 症状：Auto Agent 交付链已显示生产队列完成，但仍因 `imageRequests === 0` 失败。
- 根因：`startrails_use_mock=true` 已由 `imageGeneration.ts` 在浏览器端直接返回 mock 图，不再请求 `/api/ai/generate-image`；旧测试仍断言历史网络副作用。
- 处理：复用生产队列 E2E bridge 模式，改为验证 shot 的 `generatedImageNodeId` 指向存在的 `ai-generated-image` 节点；网络 route 仅保留非短路路径兜底。
- 防复发：用户价值链验收优先断言产物和可消费关联，不断言可被实现优化消除的中间请求次数。

## EL-069 测试已引用的共享 helper 不能只提交测试文件

- 日期：2026-07-11
- 症状：全量单测 955 项中唯一失败为 `ERR_MODULE_NOT_FOUND: src/lib/testing/playwrightBrowser.ts`。
- 根因：`playwrightBrowser.test.ts` 已进入仓库，但实现文件从未存在于 HEAD、远端分支、全机副本或 unreachable blob；Playwright config 仍内联读取 Chrome env。
- 处理：新增最小 `resolvePlaywrightChromeExecutablePath()`，使用 Node `fs.accessSync(X_OK)`；显式 env 优先，macOS 自动识别系统 Chrome；Playwright config 复用该 helper。
- 防复发：新增测试文件后必须跑全量测试；共享 helper 的测试、实现、调用方必须作为同一可验证批次存在。

## EL-070 P0/P1 矩阵断言必须跟共享 provider、mock、入口和文件名合同同步

- 日期：2026-07-11
- 症状：P0/P1 批次 38 条中 4 条失败，但页面实际分别表现为新 provider scope 生效、队列成功、资产已恢复、ZIP 已含视频。
- 根因：测试仍依赖旧合同：裸 session key、mock 模式下网络失败 route、唯一 title selector、固定 `video_1.mp4` 文件名。
- 处理：显式写入 provider base URL；失败恢复测试关闭前端 mock 短路；素材库入口用 role + first 定位；ZIP 按安全唯一 `.mp4` 条目数量和真实 bytes 验证。
- 防复发：E2E 优先断言用户产物/状态；共享合同变更时同步检索对应 storage key、selector 和文件名断言。

## EL-071 剪映导出不能把图片节点或 data URL payload 当成 MP4 文件

- 日期：2026-07-11
- 症状：Shot Planning 生成 3 个视频后，ZIP 出现 6 个 `.mp4`，其中 3 个文件名包含整段 SVG data URL。
- 根因：`extractVideoNodesFromCanvas()` 无 node kind 过滤，把 `ai-generated-image.imageUrl` 也当视频；`extractFileName()` 又尝试从 data URL 解析文件名。
- 处理：只提取真实视频 node kind；`data:/blob:` 文件名回退 `video_N.mp4`；补提取与 ZIP 单测。
- 防复发：导出素材类型由 node kind 决定，URL 字段只用于定位 bytes，不能反推媒体类型。
## 2026-07-10 — Production queue stopped after image/video (`2/4 完成执行中`)

- Symptom: `production-run-queue.spec.ts` main flow stalled at `2/4 完成执行中`; trace showed image and video requests completed, TTS module loaded, but voice/subtitle never completed.
- Root cause: `useProductionRunExecutor.updateTaskState()` synchronized `execStateRef.current` inside React `setState` updater. React batching let the executor loop read stale state immediately after a task completed, so the next same-shot task looked blocked by a still-running predecessor.
- Fix: compute next exec state from `execStateRef.current`, assign `execStateRef.current = next` synchronously, then call `setExecState(next)`.
- Test guard: `productionRunExecutorState.test.ts` now asserts voice work becomes runnable after image+video complete.
- E2E guard: `production-run-queue.spec.ts` main path uses one shot and explicit mock TTS backend, then verifies `4/4 完成`, video node, audio node, subtitle node, and generated image linkage.

## 2026-07-10 — Project package restored metadata but not inline asset bytes

- Symptom: project package roundtrip could preserve `assetId` / `generatedImageAssetId` linkage, but if the target machine did not have the original IndexedDB bytes, restored image nodes had metadata only and could not immediately feed downstream image/video flows.
- Root cause: export sanitized runtime URLs correctly, but did not provide a package-level asset manifest for safe `data:` bytes that already exist on nodes; import therefore had no bytes to restore.
- Fix: add `buildProjectPackageAssets()` and include `assets` in the exported project package. Import now reads `assets[]` by `assetId` and restores `imageUrl/resultUrl/assetUrl` plus `shot.generatedImageUrl`.
- Test guard: `projectPackageExport.test.ts` covers asset manifest export; `projectPackageImport.test.ts` covers restoring package bytes onto image and shot nodes.
### EL-072 生产队列 E2E 把内部自动重试误当用户手动重试

- 症状：队列长时间停在“生产队列运行中”；分镜桥接导出断言期望 3 个视频，实际 2 个。
- 根因：生图任务内置 `retryWithBackoff(maxRetries: 2)`，测试在第 2 次请求就挂起；另一用例只标记 2 个 shot 为 ready，却按 3 个导出物断言。
- 处理：首轮连续失败 3 次以穷尽内部重试，第 4 次才作为用户手动重试门闩；导出数量与 ready shot 数量对齐。
- 防复发：队列 E2E 必须同时考虑任务内部 retry 合同；导出断言从实际入队输入推导，不从原始素材总数推导。
- 补充：依赖失败任务保持 queued，不应断言为 failed；前置任务手动重试成功后，再启动队列验证依赖链继续。
### EL-074 “先预览”模式 UI 存在，但草稿节点事务实现遗留在旧 Codex 副本

- 严重程度：P1。
- 症状：`AgentModeSwitcher` 展示“先预览”，但主仓无 `DraftNodeWrapper`、`previewTransactions`、草稿确认/丢弃交互；当前只是不自动执行 action。
- 遗留位置：`/Users/wuyongnaren/Documents/Codex/2026-06-21/starcanvas-https-github-com-732642856-starcanvas/work/starcanvas`。
- 现成文件：`DraftNodeWrapper.tsx`、`chatPreviewState.ts`、`previewTransactionLifecycle*.ts`、`chat-preview-draft-nodes.spec.ts`，以及 `ChatPanel.tsx` / `StarCanvas.tsx` / `canvasStore.ts` 集成 diff。
- 处理：已迁移 Store 事务、草稿包装器、deferred lifecycle、批量节点布局与旧 E2E；Auto Agent 与普通 Chat `canvas-actions` 现共用 `applyAgentModeActions`。
- UI 收口：Preview 事务存在时，消息卡不再显示“执行 N 个操作”，避免重复创建；改显示草稿处理进度/已落地状态。
- 验证：状态单测 `17/17`，布局单测 `2/2`，production build 通过，`chat-preview-draft-nodes.spec.ts` `2/2` 通过。
- 状态：已修复（2026-07-11）。

### EL-075 Preview 历史实现迁移时的工具/环境误判

- 工具污染：直接读取旧文件时，输出压缩摘要被误写入测试文件；已删除污染文件，改用 base64 无损读取 + `apply_patch` 重建，并用 `rg '# squeez'` 复核无残留。
- 环境误判：webpack dev server `3181` 的 `/api/ai/config` 编译超时；改用 fresh production build + 固定 `3182`。
- 布局问题：旧 `NodeToolbar` 位置在当前顶栏/底栏/Chat 面板下被遮挡；改为顶部内收的紧凑图标控件。
- 批量重叠：两个无坐标 `create_node` 均落画布中心；迁移旧 `chatActionNodePlacement` 并在批量创建后调用现有 `fitViewToVisibleCanvas`。
- 命令错误：一次 `rg` 含 backtick 导致 shell 引号错误；一次定向 lint 向 `--filter web` 传了 repo 相对路径。均已用拆分 pattern / `apps/web` 相对路径复跑通过。
- 防复发：旧副本迁移固定步骤为“无损读取 -> 污染扫描 -> 纯状态单测 -> 当前布局 E2E -> production build”。

### EL-073 发布扫描 shell 命令引号不匹配

- 症状：`sh: -c: line 0: unexpected EOF while looking for matching quote`。
- 影响：扫描命令未执行；无文件写入、无代码影响。
- 处理：拆分复杂正则与 shell 引号，重跑后 secret scan / ignore verification / `git diff --check` 通过。
- 防复发：含单双引号的正则不再内联到一条长 shell；分命令或使用无引号冲突的 pattern。

### EL-076 App Router 根错误未进入 Sentry

- 严重程度：P1。
- 日期：2026-07-11。
- 症状：production build 持续提示缺少 `global-error`；`app/error.tsx` 只能处理局部分段错误，根布局渲染异常没有独立 Sentry 上报边界。
- 根因：当前主仓遗漏了旧 Codex 副本中的 `apps/web/src/app/global-error.tsx` 与合同测试。
- 处理：复用历史实现并对齐 Sentry 官方 Next.js 手动配置模式；根错误边界在 `useEffect` 中调用 `Sentry.captureException(error)`，同时渲染完整 `<html>/<body>`。
- 验证：合同测试 `1/1`、typecheck 通过、fresh production build `exit 0`；构建日志不再出现 `don't have a global error handler`。
- 防复发：保留 `global-error.test.ts` 静态合同测试；升级 Next.js/Sentry 后先核对官方 App Router 错误边界要求，再改文件约定。

### EL-077 Secret scan 长正则不能混用多层 shell 引号

- 日期：2026-07-11。
- 症状：首次工作树/历史 secret scan 报 `unexpected EOF while looking for matching quote`，扫描未执行。
- 根因：ERE 同时包含单双引号，又嵌入 shell 单引号变量，形成不闭合命令。
- 处理：改用无引号字符的等价候选正则，按“工作树、当前 tracked tree、全部 refs 历史”三层重跑；227 commits 扫描完成。
- 结果：当前 tracked tree 无候选；工作树和历史命中仅为 E2E 假 Key 测试夹具。
- 防复发：secret scan 正则不得直接混写单双引号；复杂模式使用脚本参数或拆成多个 `rg -e`。

### EL-078 Full unit / typecheck / lint 不得在当前 120 秒工具预算内并发

- 日期：2026-07-11。
- 症状：full unit 与 typecheck 并发时，unit `exit 0`，typecheck 被 120 秒限时终止；随后 full lint 单跑也因当前仓库规模超过 120 秒被外层终止，且没有输出 lint 诊断。
- 根因：把 CPU/IO 重任务并发运行，且把工具时限误当项目命令时限。
- 处理：typecheck 改为单独运行并 `exit 0`；本任务仅新增 docs，上一轮变更代码的定向 lint 已 `exit 0`，最近 fresh full lint 基线仍为 `0 errors / 79 warnings`。
- 防复发：full unit、typecheck、full lint 串行；full lint 使用可持续超过 120 秒的后台进程/CI，不能用外层超时推断 lint 失败。

### EL-079 Git staged-index 检查必须显式传入路径分隔符

- 日期：2026-07-12。
- 症状：`git diff --cached --quiet` 在当前 Git 版本报 `--quiet is only valid with a single pathname`，后续串联检查没有执行。
- 根因：该组合需要显式路径而不是省略 pathspec。
- 处理：改为 `git diff --cached --quiet -- .` 后重跑。
- 防复发：所有 staged diff 空检查固定使用 `git diff --cached --quiet -- .`。

### EL-080 浏览器合成实现存在但失败被吞掉，能力矩阵也过期

- 严重程度：P1。
- 日期：2026-07-12。
- 症状：主仓已有 `videoCompositionBrowser.ts`、`composition` 工作流节点和 `@ffmpeg/ffmpeg`，但能力矩阵仍称“真视频拼接未接入”；真实 WebM 运行后工作流曾显示成功却没有产物。
- 根因：`useWorkflowRunner.ts` 的 composition 分支在失败后写入 failed 状态再 `return ""`，外层执行器随即覆盖为 succeeded；单片段仍走 concat demuxer，且 FFmpeg exit code 未检查。初次加载诊断还错误尝试了不存在的 core-mt worker URL。两段 WebM 初次改为双重 1080p 转码后触发 wasm `Aborted()`。
- 处理：复用 ffmpeg.wasm 官方 UMD 默认 core 资产，移除无效 multi-thread worker 配置；单片段跳过 concat；多片段用标准 concat filter 统一时间轴、尺寸、帧率，并在无音频/字幕时直接写最终 MP4，避免第二次高分辨率转码；所有 FFmpeg exec 检查 exit code；失败向外抛出并显示“视频合成失败”；`WorkflowNode` 公开稳定的 MP4 下载入口。
- 验证：`apps/web/e2e/browser-video-composition.spec.ts` 以浏览器 `MediaRecorder` 生成真实一段及两段 WebM，验证 composition 节点产出 `video/mp4` Blob 并触发 `starcanvas-composition.mp4` 下载；`videoCompositionPlan.test.ts`、typecheck、定向 lint、fresh production build 通过。
- 防复发：能力矩阵必须区分“单/双片段已验证”与“音频/字幕待验证”；工作流分支不得以空成功值吞掉失败，E2E 必须验证用户可获得的交付物，而非仅检查运行状态。

### EL-081 音频与字幕同次浏览器合成的 wasm 资源中止

- 严重程度：P1。
- 日期：2026-07-12。
- 症状：真实 WebM + WAV、真实 WebM + subtitle 分别可下载 MP4；三者同次输入时最终 FFmpeg 转码返回 exit 1，诊断尾日志为 `Aborted()`，确认是 wasm 资源中止而非素材/节点连线缺失。
- 处理：增加受控 FFmpeg 日志尾部；复用 `buildFinalCompositionArgs` 分两阶段执行，先写 `subtitle_intermediate.mp4`，再把 WAV 混入最终 MP4，避免同一 filter graph 同时持有字幕与音频编码资源。
- 验证：真实 `WebM + WAV + subtitle -> MP4 下载` Playwright E2E 已通过；组合用例解除 `fixme`。
- 防复发：浏览器端新增组合滤镜时，先判断是否能复用已通过的单项阶段；复杂组合不得重新并入单次 wasm render。

### EL-082 大素材不应在浏览器 wasm 无保护启动

- 严重程度：P1。
- 日期：2026-07-12。
- 症状：长片段/大素材可绕过现有组合逻辑直接写入 wasm FS，失败成本高且易触发内存中止。
- 处理：`composeVideo` 在加载 FFmpeg core 前预取片段、汇总 `Blob.size`；总输入超过 64 MB 时给出可执行的剪映交接包出口。审计确认现有生产队列不执行已有素材合成，不能作为该错误的出口。
- 防复发：浏览器合成的上限必须在下载 wasm core 前检查；大素材交付走剪映兼容交接包，除非未来实现专用服务器端合成任务。

### EL-083 剪映预检与实际视频提取白名单不一致

- 严重程度：P1。
- 日期：2026-07-13。
- 症状：预检按 `nodeKind.includes("video")` 统计素材，实际 ZIP 仅导出五类真实视频节点；`video-analyze` 等分析节点可能获得假绿预检。
- 处理：导出器公开 `JIANYING_VIDEO_NODE_KINDS`，预检复用同一白名单。
- 验证：新增 `video-analyze` 回归，导出预检定向测试 `9/9` 通过。
- 防复发：预检判定必须复用实际导出选择器，不能靠名称模糊匹配。

### EL-084 旧 shot 配音在 ZIP 提取与预检间遗漏

- 严重程度：P2。
- 日期：2026-07-13。
- 症状：ZIP 提取支持 `shot.voiceAudioUrl`，预检未将其识别为音频资产。
- 处理：预检音频条件纳入 `shot.voiceAudioUrl`。
- 验证：新增旧 shot 配音回归，预检定向测试 `10/10` 通过。

### EL-085 空画布首屏不再直接显示专业工具栏，E2E 必须先走真实起点入口

- 日期：2026-07-13。
- 症状：`create-flow.spec.ts` 的“AI Script”和“调色”用例在空画布上一直等不到 `toolbar-ai-script`、`toolbar-color-grade`，4 条 smoke 中 2 条失败；截图显示的并非故障页，而是当前的起点引导卡。
- 根因：`EmptyCanvasGuide` 已把空画布主路径收口为“导入剧本 / 空白写作 / 导入参考视频 / 上传参考图”；专业工具栏只在画布产生节点后出现。旧 E2E 仍假设空画布直接暴露所有专业工具。
- 处理：剧本 smoke 改走 `empty-guide-import-script -> ScriptImportPanel -> shot library -> reload`；调色 smoke 先走 `empty-guide-create-text`，再打开专业调色工具。保留对节点持久化和面板开闭的用户产物断言。
- 验证：`apps/web/e2e/create-flow.spec.ts` `4 passed (52.1s)`。
- 防复发：空画布测试先断言引导卡可见，再从当前主入口进入；只有已有节点的画布才断言专业 toolbar。

### EL-086 低位节点菜单删除项不可达，E2E readiness 也过早

- 严重程度：P2。
- 日期：2026-07-13。
- 症状：分镜/文本节点在较低屏幕位置右键后，菜单底部“删除节点”落出可视区；独立删除持久化 E2E 还曾在 SSR 引导卡出现时首击，React 事件尚未可用，导致动作丢失。
- 根因：`NodeContextMenu` 对分镜/文本菜单沿用 420px 高度估算，实际操作项更高；共享 `waitForCanvasReady` 只等 React Flow DOM，未等 E2E 交互桥。
- 处理：分镜/文本菜单按 700px 估算并保留最大高度滚动；共享 readiness 增加 `__starcanvasE2E` 断言；新增右键删除 -> 保存 -> 刷新为空画布的独立浏览器链。
- 验证：fresh `http://127.0.0.1:3183` 下 `apps/web/e2e/node-delete-persistence.spec.ts` `1 passed (1.1m)`；定向 ESLint `0 errors`；`e2e/utils.preflight.test.ts` `5/5`。
- 防复发：任何可点击 UI 的 E2E 必须等待交互桥，不得仅以 SSR/容器可见判定 ready；菜单高度变化须以底部 destructive action 的可达性回归。

### EL-087 视频分析分流的图标关闭动作缺少语义锚点

- 严重程度：P2。
- 日期：2026-07-13。
- 症状：Add Node 的“参考视频分析”已能打开逆向分镜，但其图标关闭按钮没有 accessible name；结构拆解面板也缺少稳定根 `data-testid`，浏览器验收只能依赖脆弱文字或 CSS。
- 根因：两个动态面板分别使用图标按钮/portal，未把可操作语义和 E2E anchor 当作组件合同的一部分。
- 处理：逆向分镜与结构拆解关闭按钮补 `type`、`aria-label`、`title`；结构拆解面板增加 `video-remix-panel`，并登记到共享 selectors；新增 Add Node -> 统一入口 -> 两条分流的浏览器链。
- 验证：fresh `apps/web/e2e/add-node-reference-video-entry.spec.ts` `1 passed (1.0m)`；定向 ESLint `0 errors`。
- 防复发：icon-only command 必须有可访问名称和 tooltip；动态 panel 新增时同步定义稳定根标记并纳入 selector registry。

### EL-088 局部精修蒙版会泄漏进持久化快照

- 严重程度：P2。
- 日期：2026-07-13。
- 症状：fresh provider media bridge 运行时报告 `focusEditMaskDataUrl` 未经清洗；大 mask base64 会进入 canvas 快照。
- 根因：共享 sanitizer 未登记该字段，且 mask 没有 IndexedDB identity。
- 处理：mask 保存到既有图片资产层并写入 `focusEditMaskAssetId`；快照剥离 data URL，恢复时 hydrate。当前会话保留 data URL，避免 provider 请求在迁移瞬间失效。
- 验证：sanitize/hydrate 定向测试 `17/17`；`focus-edit-provider-media-bridge.spec.ts` fresh `1 passed (19.7s)`，最新运行无泄漏告警。
- 防复发：新增二进制/inline 字段必须同时定义 asset identity、sanitize 与 hydrate 回归。

### EL-089 剧本最小试跑的参考图生图上游 502

- 严重程度：P1（外部依赖）。
- 日期：2026-07-13。
- 症状：`太子替我背黑锅` 首个关键画面以宫女三视图作 reference 调用 `gpt-image-2`，原图与压缩至 425 KB 的 reference 各重试一次，均返回 `PROVIDER_BAD_GATEWAY / 502`。
- 根因：本地 `/api/ai/generate-image`、Provider config 与输入缩小均正常；失败来自 `copse.top` 图生图上游或其 reference payload 兼容性。
- 处理：停止继续重复生图/视频，避免无产物消耗；保留剧本、角色 reference 与镜头 prompt，待上游恢复后从镜头 1 重试。
- 防复发：真实试跑对同一 retryable 外部错误最多执行一次缩小输入重试；仍失败即进入明确 blocked 状态，不继续排队下游视频。

### EL-090 DashScope Vidu Key 被错误标为图像 Provider

- 严重程度：P1。
- 日期：2026-07-13。
- 症状：最小 `wan2.1-t2i` 道具生图请求带 `_providerOverrides.providerId=dashscope`，DashScope 原生接口返回 `Model not exist`；账户模型清单只有 Qwen 文本与 `happyhorse` 视频模型。响应的 `provider: default` 是 capability 标签误归因，不是 override 未生效。
- 根因：内置 DashScope 注册项把仅用于 Vidu 的 `DASHSCOPE_API_KEY` 静态声明为 image capability，并虚构 `wan2.1-t2i/i2i` 可用模型。
- 处理：DashScope 内置注册项改为 video/text，移除虚假图像模型；图像能力必须由用户显式 `AI_PROVIDER_*` 配置实际可用模型后再暴露。
- 防复发：Provider capability 必须与账户可见模型或显式配置一致；不能因同一厂商存在图像产品就假定当前 key 有图像模型权限。

### EL-091 HappyHorse 图生视频 payload 与任务回收差异

- 严重程度：P1。
- 日期：2026-07-13。
- 症状：`happyhorse-1.1-i2v` 对 Vidu 的 `input.media.type=image` 依次要求 `first_frame`、`input.media`、`input.media.type=first_frame`；字段兼容后任务真实成功，但 route 内轮询报 `fetch failed`。
- 根因：共享 Vidu task adapter只覆盖 `media.type=image`；HappyHorse 要同时提供 `input.first_frame` 和 `input.media:[{type:first_frame}]`。轮询失败未阻止 Provider 端任务完成，需可按 task ID 回收。
- 处理：adapter 增加 HappyHorse 分支及合同测试；真实任务 `SUCCEEDED` 后通过 task ID 回收并下载 `shot-05-zhaoheng-black-wok.mp4`。`waitForViduTaskResult` 现在会对单次 task 查询网络失败重试，连续 3 次失败才返回带 task ID 的可恢复错误。
- 防复发：视频模型 adapter 必须按模型族声明 input schema；任务提交成功后，即使轮询网络失败也要保留 task ID 与可恢复查询路径。

### EL-092 试跑产物解码命令引号错误

- 严重程度：P3（本地操作）。
- 日期：2026-07-13。
- 症状：首张场景图已返回 data URL，但解码命令模板字符串引号不匹配，Node 在执行前报 `SyntaxError: missing ) after argument list`。
- 处理：未修改产物；改用无嵌套模板字符串的短命令解码。
- 防复发：一次性 Node 命令避免混用 shell 单引号、模板字符串和嵌套双引号；先以单个文件验证再批量转换。

### EL-093 Provider config 冷启动探针超时

- 严重程度：P2（诊断）。
- 日期：2026-07-13。
- 症状：本地 `GET /api/ai/config` 在 10 秒探针窗口无响应，调用方随即因空响应报 JSON 解析错误。
- 根因：当前 dev server 可在冷启动/编译期超过短探针窗口；该结果不能用于判定 Key、模型或 Provider 不可用。
- 处理：探针调用方须区分网络超时、空响应与有效 JSON；诊断时采用已启动 server 或较长超时，禁止把它显示为凭证错误。
- 防复发：Provider readiness UI/CLI 需给 config 冷启动单独的可重试状态，不得将其归类为阻塞性 Provider 失败。

### EL-094 视频任务可恢复未知态遗漏在 TypeScript 合同外

- 严重程度：P1（构建阻塞）。
- 日期：2026-07-13。
- 症状：`pnpm --filter web typecheck` 报 `Type '"UNKNOWN"' is not assignable to type '"SUCCEEDED" | "FAILED" | "CANCELED" | "TIMEOUT"'`。
- 根因：任务轮询的连续网络失败恢复分支新增 `UNKNOWN` 状态，但 `ViduTaskWaitResult` 失败联合类型未同步。
- 处理：将 `UNKNOWN` 纳入失败结果 status 联合类型。
- 防复发：任务状态机新增终态/可恢复态时，必须同步检查返回类型、route 映射和合同测试。

### EL-095 通用 BYOK 的 localhost endpoint 被 SSRF 防护拒绝

- 严重程度：P1（Comfy 接入前置条件）。
- 日期：2026-07-13。
- 症状：无付费 mock upstream 试图通过 `127.0.0.1` 验证图生图 multipart，route 在出站前返回 `SSRF protection: Base URL points to blocked host: 127.0.0.1`。
- 根因：通用自定义 Base URL 具有服务端请求伪造风险，防护正确拒绝 loopback host。
- 处理：不绕过防护；将 ComfyUI 定义为专用 provider 任务，要求 workflow allowlist 与显式本地 endpoint 开关。
- 防复发：不得为支持任意 local endpoint 而放宽全局 Base URL 校验；所有 local provider 例外必须按环境、provider id 和测试合同三重限定。

### EL-096 E2E 未复用已运行的开发服务器

- 严重程度：P2（验收编排）。
- 日期：2026-07-13。
- 症状：Provider Settings E2E 未带 `STARCANVAS_E2E_BASE_URL`，Playwright 尝试再启动 3183，Next 报已有 dev server。
- 根因：该仓库 Playwright config 只在显式 Base URL 时跳过 `webServer`；默认 E2E 端口与手工启动服务不同。
- 处理：已有服务时传入 `STARCANVAS_E2E_BASE_URL=http://127.0.0.1:3183`。
- 防复发：运行单 spec 前先检查监听端口；复用服务必须显式传 Base URL，不能让 Playwright 竞争同一开发目录锁。

### EL-097 会话级图生图试跑未形成结果记录

- 严重程度：P2（试跑可观测性）。
- 日期：2026-07-13。
- 症状：一次临时 session override 图生图请求结束后未写出预期 JSON 结果文件，无法据此确认上游是否接收任务。
- 处理：不对该未知状态盲目重复付费请求；改为本机 Provider config 生效后，通过具备结果落盘的单次流程重跑。
- 防复发：真实生成调用必须先创建 pending manifest，响应/异常均写入同一 artifact，避免进程中断留下无状态请求。

### EL-098 开发服务器附着在命令包装进程导致后续连接被拒绝

- 严重程度：P1（本地试跑阻塞）。
- 日期：2026-07-13。
- 症状：3183 config 探针成功后，后续真实生成请求在 TCP 建连前报 `ECONNREFUSED 127.0.0.1:3183`。
- 根因：通过受控命令包装启动的 Next dev 子进程未独立存活，包装调用结束后服务退出。
- 处理：本地长期试跑服务使用独立后台进程启动；请求前必须以端口监听和 `/api/ai/config` 双重确认。
- 防复发：不得仅以一次健康响应视作服务可用；任何真实付费调用前先检查 listener 和 config route。

### EL-099 受控终端客户端提前断开但上游图生图已成功

- 严重程度：P1（真实产物回收）。
- 日期：2026-07-13。
- 症状：本地请求方记录 `fetch failed`，但 Next server log 显示 `/images/edits` 上游 `200`、返回 `b64_json`。
- 根因：长生成期间受控终端的等待客户端提前结束；服务端仍完成了同步 Provider 请求，但响应未能写入 artifact。
- 处理：真实长请求改由独立后台脚本持有连接并写 pending/result artifact；不把 client 断连归因为 Provider 失败。
- 防复发：付费同步生成不得依赖会被短时终端生命周期中止的前台进程；提交前预建 manifest，后台回收结果后再报告。

### EL-100 大文件 patch 以过期 import 上下文匹配失败

- 严重程度：P3（本地开发）。
- 日期：2026-07-13。
- 症状：视频 prompt 编译器的首个组合 patch 未匹配 `StarCanvas.tsx` 里的实际 alias import，未落盘。
- 处理：拆分为独立新文件和精确行段 patch，确认首个 patch 的原子性后再接线。
- 防复发：修改大型汇聚组件前，先用精确 import 与调用行上下文定位；新增文件与调用点不得放在同一高风险 patch。

### EL-101 白模 pose 建议的动词词表漏判

- 严重程度：P2（提示词控制）。
- 日期：2026-07-13。
- 症状：`hides/glances` 等正常动作未命中有限动词表，导致动态镜头 `pose=false`。
- 处理：任何显式主动作均建议 pose control；仅系统默认的细微呼吸/衣料动作跳过白模需求。
- 防复发：预演门控不依赖不完整的多语言动作词表；动作存在性优先于动作分类。

### EL-102 新白模计划模块未满足 Node ESM 测试解析合同

- 严重程度：P2（测试阻塞）。
- 日期：2026-07-13。
- 症状：`node --experimental-strip-types` 运行 `shotProductionBrief.test.ts` 时，无法解析无扩展名的 `./videoPromptDirector`。
- 根因：该测试执行器按原生 ESM 解析新模块；现有 app bundler 可解析的无扩展名路径不等于 node:test 合同。
- 处理：新依赖改为显式 `./videoPromptDirector.ts`。
- 防复发：被 Node 直跑测试覆盖的新增 TypeScript 相对 import 必须使用 `.ts` 扩展名，或以同样条件先跑定向测试。

### EL-103 Director Agent brief 的 warning 精确断言遗漏新增预演建议

- 严重程度：P3（回归测试）。
- 日期：2026-07-13。
- 症状：动态镜头新增白模预演 warning 后，既有测试仍精确期望旧 warning 数组。
- 处理：断言纳入新增 warning 与 `handoff.previs` 结构。
- 防复发：为 shared handoff 增加字段时，更新其 exact-array 回归；不要把新增安全提示当作无关输出。

### EL-104 新增预检测试误用不存在的状态名

- 严重程度：P3（测试断言）。
- 日期：2026-07-13。
- 症状：连续动作拆镜 warning 的新增回归将预检状态断言为 `review`，实际稳定枚举为 `needs-review`。
- 根因：测试按面板中文文案推断状态，没有先读取 `buildShotProductionPreflight` 的既有状态合同。
- 处理：测试改断言 `needs-review`，保留 `handoff-warning -> review-handoff-warning` 行为验证。
- 防复发：新增预检 case 前先复用同模块状态常量/既有测试，不从 UI 标签反推内部枚举。

### EL-105 本地 Next 冷启动被短探针误判为无响应

- 严重程度：P2（本地验收环境）。
- 日期：2026-07-13。
- 症状：`127.0.0.1:3183` 仍处于 LISTEN，`/api/ai/health` 在 5 秒内无响应。
- 根因：Next webpack 首次编译 `/instrumentation`、health/config route 需要约 35–50 秒；短时探针把冷编译误判为僵死服务。并行 Next dev 实例会进一步放大等待。
- 处理：收敛为单一 3183 实例，以单次 90 秒探针等待首次编译完成；最终 health `200`、config `200` 且 `hasApiKey=true`。
- 防复发：启动后首个 health/config 探针至少留 90 秒；仅在超时后才判定失败。避免同一 `.next` 输出目录并行运行多个 Next dev 实例。

### EL-106 旧开发服务未加载后写入的本地 Provider 配置

- 严重程度：P2（本地可用性）。
- 日期：2026-07-13。
- 症状：冲突解除后的 3190 服务可响应，但 `/api/ai/health` 与 `/api/ai/config` 返回 `500 No AI Provider configured`。
- 根因：该实例在当前 `.env.local` 写入前已启动；Next dev 不会自动重新读取运行时环境变量。
- 处理：停止同仓旧实例，启动唯一受管服务并在启动时加载当前 `.env.local`；以 health/config 双探针验证。
- 防复发：更新 `.env.local` 后必须重启当前项目的唯一开发服务；不要在同一 `.next` 输出目录并行运行多个 Next dev 实例。

### EL-107 Web 测试脚本引用未安装且无用例的 Vitest

- 严重程度：P2（全量验收阻塞）。
- 日期：2026-07-13。
- 症状：`pnpm --filter web test:vitest` 以 `spawn ENOENT` 失败。
- 根因：`apps/web/package.json` 留有 Vitest scripts，但依赖/lockfile 中没有 `vitest`，`vitest.config.ts` 的 `src/**/*.vitest.test.ts(x)` 也没有任何匹配文件。
- 处理：移除两条死 Vitest script，`test:all` 收口为实际存在的 Node `node:test` 主线。
- 防复发：新增测试执行器前必须同时提交 runner dependency、至少一个匹配用例和 CI 调用；否则不要保留脚本入口。

### EL-108 失效的第二个同仓 Next dev 实例复发

- 严重程度：P2（本地运行环境）。
- 日期：2026-07-14。
- 症状：端口 3190 的 `pnpm -C apps/web exec next dev` 实例与 3183 同时运行；3190 的 `/api/ai/config` 返回 `500 No AI Provider configured`，而 3183 正常加载当前 `.env.local`。
- 根因：旧实例由独立窗口/会话重新启动，读取的是启动时旧环境快照，并与唯一有效实例共享 `.next/dev`。
- 处理：终止 3190 的父/子进程，只保留已验证的 3183。
- 防复发：同一 `apps/web` 目录只能保留一个 Next dev 实例；启动前检查 3183/3190 listener，预览统一使用 `http://127.0.0.1:3183`。

### EL-109 LocalSkillSource 使用了 Node strip-only 不支持的 parameter property

- 严重程度：P2（新增模块测试阻塞）。
- 日期：2026-07-14。
- 症状：`node --experimental-strip-types` 运行 LocalSkillRegistry 单测时报 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`，指向 `constructor(public readonly code: ...)`。
- 根因：仓库 Node test runner 仅剥离类型，不能转换 TypeScript parameter property。
- 处理：改用显式 readonly 字段及 constructor 内赋值。
- 防复发：新增被原生 Node 测试加载的 TypeScript 不得使用 parameter property、enum、namespace 等需要转换的语法。

### EL-110 Local Skill 测试在非 async 回调中使用 await

- 严重程度：P3（测试语法）。
- 日期：2026-07-14。
- 症状：Local Skill Crew context 测试解析时报 `await isn't allowed in non-async function`。
- 根因：`assert.rejects` 回调读取 fixture Registry 时遗漏 `async`。
- 处理：回调改为 async。
- 防复发：含 fixture 创建或异步 factory 的 `assert.rejects` 回调必须显式 async，并先跑新增单测文件。

### EL-111 迁入 SkillRuntime 缺少 AgentNode 运行态字段合同

- 严重程度：P2（类型检查阻塞）。
- 日期：2026-07-14。
- 症状：kernel Canvas adapter 写入 `activeRunId`、`lastSuccessfulRunId`，但主仓 `CanvasNodeData` 未声明两字段，`typecheck` 失败。
- 根因：workbench-kernel 尚未实际合并，迁入时其配套 Canvas 类型扩展没有一并带入。
- 处理：在既有 AgentNode 运行态字段旁补两个可选字符串字段；旧节点无需迁移。
- 防复发：迁入跨层 kernel 时，先用 source worktree 的 type diff 核对 adapter 写入字段与主仓 data contract。

### EL-112 SkillRuntime Canvas adapter 的 Crew trace 字段漏入主仓类型

- 严重程度：P2（类型检查阻塞）。
- 日期：2026-07-14。
- 症状：补完 run id 后，typecheck 继续指出 adapter 写入的 `crewStatuses`、`executionTrace` 不在主仓 `CanvasNodeData`。
- 根因：EL-111 的首次合同核对只补了首批报错字段，未一次性迁入完整 AgentNode runtime 字段组。
- 处理：补齐两个可选字段，保持 legacy `_crewStatuses` / `_executionTrace` 可继续读取。
- 防复发：跨层 adapter 接入时，以完整 object-literal 写入字段清单一次性对照类型，不按编译器逐个报错修补。

### EL-113 生产预检草稿的 ready 断言与当前规则不一致

- 严重程度：P2（全量 Node 测试阻塞）。
- 日期：2026-07-14。
- 症状：`productionPreflightFix.test.ts` 的 `reports ready when the draft clears the last issue` 期待 `ready`，实际为 `needs-review`；`pnpm --filter web test:all` 因此失败。
- 根因：该预检模块存在本次 Agent Runtime 之外的未提交规则改动，测试夹具对完成条件的假设未随当前预检输出同步；已定向复现，非 Runtime 迁移回归。
- 处理：将夹具改为真实的“补语音意图后仍需白模预演复核”契约，断言 `missing-voice-intent` 被清除且 `handoff-warning` 保留；未改动预检实现或用户的角色三视图改动。定向 15/15、`test:all`、typecheck、lint、diff check 通过。
- 防复发：修改 preflight 规则时，同次更新 ready/needs-review 边界用例，并在合并前执行该定向测试。

### EL-114 AgentNode Crew 状态字段缺少类型别名

- 严重程度：P2（typecheck 阻塞）。
- 日期：2026-07-14。
- 症状：`CanvasNodeData.crewStatuses` 引用了未声明的 `CanvasCrewAgentStatus`，`tsc --noEmit` 报 `TS2304`。
- 根因：Runtime adapter 字段迁入时补了引用，遗漏了与既有 `CrewAgentStatus` 的 Canvas type-only alias。
- 处理：添加 `CanvasCrewAgentStatus = CrewAgentStatus` type-only alias，不引入运行时依赖；typecheck、lint、全量 Node tests、Agent Runtime mock E2E 均通过。
- 防复发：新增 Canvas data 字段时，同时检查所有局部引用类型是否已声明；迁入 adapter 后必须跑 typecheck。

### EL-115 Comfy workflow 连线元组未被 TypeScript 输入联合覆盖

- 严重程度：P2（typecheck 阻塞）。
- 日期：2026-07-14。
- 症状：`comfy-client.ts` 的 workflow 节点连线如 `["1", 0]` 被声明为 `string[]`，`tsc --noEmit` 报 number 不可赋给 string。
- 根因：ComfyUI 连线是 `node id + output index` 混合元组，初始 JSON value 类型只允许同质字符串数组。
- 处理：将 workflow input 扩展为 `Array<string | number>`，保留所有其他 JSON 标量限制。
- 防复发：为图形工作流 JSON 定义显式的 node-link tuple/value 联合，并在 adapter 单测后始终跑 typecheck。

### EL-116 Shot Planning 队列任务数断言未随对白任务同步

- 严重程度：P2（全量 Node 测试阻塞）。
- 日期：2026-07-14。
- 症状：`useShotPlanningRunQueueStore.test.ts` 期待 source shot 生成 4 个任务，实际为 5。
- 根因：测试 fixture 新增 `dialogue` 后，当前生产规则正确增加 voice task；断言和提示文本仍停留在无对白链路。
- 处理：更新为 5 任务与 `Created 5 queue tasks`，保留对白 fixture 以覆盖完整生产链。
- 防复发：任务数断言必须显式覆盖输入字段引起的条件任务（图片、视频、声音、字幕）。

### EL-117 Shot Planning adapter 任务列表漏断言交接复核任务

- 严重程度：P2（全量 Node 测试阻塞）。
- 日期：2026-07-14。
- 症状：`shotPlanningRunQueueAdapter.test.ts` 预期 4 个任务，实际额外包含 `review-handoff-warnings`。
- 根因：连续动作/白模预演交接规则已正确追加人工复核任务，旧 adapter 测试未纳入完整生产链。
- 处理：将 `review-handoff-warnings` 加入精确任务列表断言。
- 防复发：队列 adapter 的全链任务断言必须包含条件性 review/handoff 阶段，而不只断言生成阶段。

### EL-118 真实关键帧请求在卡住的 Next dev 实例中无 receipt 终止

- 严重程度：P1（付费请求可追溯性）。
- 日期：2026-07-14。
- 症状：`shot-02` 的真实 reference-image 请求后，旧 `3183` Next dev 停止响应；未落图片、未写 receipt、无可用 route log，无法证明上游是否已接收或计费。
- 根因：请求发起时复用的是已运行数小时的单实例 dev server；长图像请求与该实例的冷编译/连接状态发生卡死，客户端审计在响应前无法落盘。
- 处理：终止卡住的唯一 3183 实例并以同端口单实例重启，health/config 已恢复；本镜头不自动重试。
- 防复发：真实生成 runner 必须先落 request receipt、携带稳定 request id、在响应前后各写审计状态；卡住或无 receipt 时必须人工确认后才能重发，避免重复扣费。

### EL-119 前台自动化会话回收导致图像 response 未持久化

- 严重程度：P1（付费结果丢失风险）。
- 日期：2026-07-14。
- 症状：`shot-03` runner 的 receipt 已预写，但前台 Node 子进程在 route 返回前被自动化会话回收；服务日志随后确认 `POST /api/ai/generate-image 200 in 120s`，本地没有图片文件。
- 根因：真实图像调用时间超过前台自动化会话生命周期，HTTP client 消失而 Next route 仍完成上游调用；route 本身没有服务端产物持久化。
- 处理：将 shot-03 标记 `response_lost_after_route_200`，禁止自动重试；后续批次改由 `nohup` 后台 runner 执行并通过 receipt/log 监控。
- 防复发：长付费调用不得依赖前台 agent session；生产 runner 必须独立运行，并把 request/response artifact 写到本地可恢复存储。

### EL-120 关键帧 runner 的本地 timeout 小于 route 双重试预算

- 严重程度：P1（付费任务结果丢失风险）。
- 日期：2026-07-14。
- 症状：shot-06 runner 在 210 秒本地 abort 后写入失败；同一时间段 route 已完成两次上游尝试并记录 `524`。
- 根因：runner 的 210 秒取消上限低于 route 的最多两次 180 秒上游尝试和退避时间，客户端可能先于 route 收口。
- 处理：runner timeout 提升至 450 秒；不自动重试 shot-02、shot-03、shot-06。
- 防复发：调用方 timeout 必须覆盖服务端重试总预算，并以 server-side receipt 为最终成功依据。

### EL-121 Copse reference-image edit 上游连续返回 Cloudflare 524

- 严重程度：P1（付费关键帧生产阻塞）。
- 日期：2026-07-14。
- 症状：shot-06 的 `gpt-image-2` `/images/edits` 双参考图请求两次均返回 `524`，未获得图像；服务端 health 仍显示 Provider 已配置。
- 根因：health 只验证基础 API 可达，无法证明长时 reference edit 可在代理超时窗口内完成；Copse/Cloudflare 对该长请求未返回有效响应。
- 处理：停止批次 A，保留失败 receipt、request id 和服务端日志，不自动重试或继续扣费。
- 防复发：真实图像生产前须用同一 image-edit 合同做最小 smoke；出现 524 时切换可用 image provider 或直连 endpoint，不能仅依赖 health=ready。

### EL-122 低成本 Gate 继承默认双重试会放大重复扣费风险

- 严重程度：P1（付费请求控制）。
- 日期：2026-07-14。
- 症状：`/api/ai/generate-image` 默认会对 `524` 执行第二次上游尝试；单张 Gate 1 若直接复用该默认值，用户的一次低成本授权可能对应两次 Provider 请求。
- 根因：通用图片 route 以提高普通生成成功率为目标，未区分“允许重试的交互请求”和“必须单次审计的付费探针”。
- 处理：新增有界 `retryAttempts` 请求字段；默认行为不变，Gate 1 runner 显式传 `1`，并要求双环境授权后才可真实执行。
- 防复发：`apps/web/src/app/api/ai/generate-image/retry-attempts.test.ts` 与 `scripts/story-low-cost-anchor-core.test.mjs` 覆盖单次上游尝试和双授权合同；真实 Gate 不得复用隐式重试。

### EL-123 单参考图方形 Gate 仍被 Copse 524 阻塞

- 严重程度：P1（付费关键帧生产阻塞）。
- 日期：2026-07-14。
- 症状：用户授权后的 Gate 1 使用赵珩单一参考图、`1024x1024` 输出及 `retryAttempts: 1`，在约 136 秒后返回 `524`；没有产出关键帧。
- 根因：服务日志确认仅发生 `upstream attempt 1 / 1`，因此不是 StarCanvas 默认重试、双参考图或竖幅尺寸放大的结果；当前 Copse reference-image edit 路径本身无法在 Cloudflare 响应窗口内返回。
- 处理：保存 `anchor-zhaoheng-square.json` receipt，冻结 Gate 2/3/4 与所有 Copse 参考图编辑；不启动 Vidu。
- 防复发：Provider 必须提供 keepalive、异步任务轮询或可验证的替代 `/images/edits` endpoint 后，才可恢复任何参考图关键帧生产。

### EL-124 Comfy route-core 的 JSON seed 未先收窄 number

- 严重程度：P2（类型检查阻塞）。
- 日期：2026-07-14。
- 症状：新本机 Comfy route-core 将 JSON body 中的 `seed` 作为 `unknown` 与数字比较，`tsc --noEmit` 报 `TS18047` / `TS2365`。
- 根因：赋值处虽派生了 number 变量，但校验条件仍直接操作未收窄的原始 JSON 值，遗漏 `null` 和其他非 number 输入。
- 处理：先以 `typeof rawSeed === "number"` 收窄，再检查安全整数和非负范围；新增 `seed: null` 回归断言。
- 防复发：所有 API JSON 数值字段必须在比较或传入 typed runtime 前完成运行时类型收窄。

### EL-125 新版 ComfyUI requirements 引用不可下载的 comfy-angle

- 严重程度：P2（本机安装阻塞）。
- 日期：2026-07-15。
- 症状：官方 `master` 与 `v0.27.0` 的 `pip install -r requirements.txt` 报 `No matching distribution found for comfy-angle`。
- 根因：requirements 声明了当前 PyPI 无可用发行包的 `comfy-angle`，与 StarCanvas 无关。
- 处理：不伪造包或修改官方源码；切换到不含该依赖的官方历史 tag 筛选路径。
- 防复发：本机安装前先验证 requirements 中的非标准 PyPI 包可解析，再开始完整下载。

### EL-126 Intel macOS 的最高 PyTorch wheel 无法运行新版 ComfyUI

- 严重程度：P1（本机 fallback 运行阻塞）。
- 日期：2026-07-15。
- 症状：Intel macOS 可安装 PyTorch 最高为 `2.2.2`；新版 ComfyUI 依赖 `torch.library.custom_op` 与 `torch.serialization.add_safe_globals`，启动时抛 AttributeError。
- 根因：新版 ComfyUI 的实际最低 PyTorch 能力高于该平台可用 wheel，requirements 未固定此兼容边界。
- 处理：采用官方 `v0.3.10`（2024-12）和独立 `.venv-v0310`，原生兼容 Torch `2.2.2`；服务以 CPU 启动。
- 防复发：对旧 Intel macOS 先跑 torch capability import，再选 ComfyUI tag；不要通过连续私有补丁强行运行新版。

### EL-127 ComfyUI v0.3.10 requirements 漏列 requests

- 严重程度：P2（服务启动阻塞）。
- 日期：2026-07-15。
- 症状：`v0.3.10` 已完成 requirements 安装后，在 server import 阶段抛 `ModuleNotFoundError: No module named 'requests'`。
- 根因：该历史 tag 的 requirements 未列出 server 前端管理模块直接导入的标准 HTTP dependency。
- 处理：在隔离 `.venv-v0310` 显式安装 `requests`，随后 ComfyUI 绑定 `127.0.0.1:8188` 并通过 `/system_stats`、`/object_info/CheckpointLoaderSimple` 验证。
- 防复发：历史 tag 安装完成后必须执行真实一次 server startup，而非只以 pip check 作为可运行证据。

### EL-128 旧开发副本的 pnpm 启动会触发非交互依赖目录清理

- 严重程度：P2（副本核验阻塞，不影响主仓）。
- 日期：2026-07-15。
- 症状：在 `01_MAIN_开发版/starcanvas` 执行 `pnpm --filter starcanvas-web dev` 时，pnpm 因 lockfile/依赖状态检查尝试重装，并在无 TTY 环境报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。
- 根因：该副本的已安装依赖与当前 pnpm 解析结果不一致；pnpm 的保护机制拒绝在非交互会话删除现有 `node_modules`。
- 处理：不为临时核验重装或清理该副本依赖；后续仅使用其已安装的 `apps/web/node_modules/.bin/next` 进行隔离健康核验，且绝不复用主仓 `.next`。
- 防复发：旧副本只能作为只读能力证据源；任何需要依赖重装的副本运行，先获得明确许可并在隔离目录执行。

### EL-129 旧开发副本的 Provider 配置落在错误的应用根目录

- 严重程度：P2（副本能力误判）。
- 日期：2026-07-15。
- 症状：`01_MAIN_开发版/starcanvas/apps/web` 的 `/api/ai/config` 报 `Missing AI_BASE_URL`，但同级开发目录外层存在已配置的 `.env.local`。
- 根因：配置文件位于 `01_MAIN_开发版/apps/web/.env.local`，实际 Next 应用根目录是 `01_MAIN_开发版/starcanvas/apps/web`；Next 只加载应用根目录的环境文件。
- 处理：不移动、不复制、不覆盖任何密钥配置；仅用受控临时进程读取该明确文件做无付费 health/config 核验。
- 防复发：多副本审计必须同时记录“代码根目录”和“.env 所属根目录”；Provider 就绪结论只能由运行中 route 的 config/health 响应给出。

### EL-130 本机系统代理未被 Node fetch 继承，且旧副本官方 Key 无效

- 严重程度：P1（备用生产通道不可用）。
- 日期：2026-07-15。
- 症状：旧副本直连官方 endpoint 的 Node `fetch` 报 `UND_ERR_CONNECT_TIMEOUT`，启用 Node `--use-env-proxy` 后连接成功但 `GET /models` 与目标图片模型查询均返回 `401`。
- 根因：系统 HTTP(S) 代理已启用，但 Node fetch 默认不读取代理环境；代理接入后证实网络路径正常，剩余失败是该碎片配置中的官方 API 凭证无效或已失效。
- 处理：不复制、不迁移、不打印该凭证；该副本不得作为 StarCanvas 的图片生产 fallback。关闭其临时 dev server，仅保留主仓实例。
- 防复发：任何“备用 Provider 可用”结论须同时通过本地 config、代理路径与不计费的鉴权端点；仅有 `.env` 或 base URL 均不得视为可生产。

### EL-131 Copse 普通文生图也在单次生产请求中返回 524

- 严重程度：P1（图片生产通道整体阻塞）。
- 日期：2026-07-15。
- 症状：授权后的 `shot-02` 使用无参考图、`1024x1792`、`retryAttempts: 1` 的 `gpt-image-2` 文生图请求，约 143 秒后返回 `524`；首张失败后 runner 立即停止，余下五张未发出。
- 根因：该请求不读取或上传角色三视图，排除了 `/images/edits` multipart 和参考图大小因素；当前 Copse 上游对生产尺寸的普通 `/images/generations` 也无法在响应窗口内完成。
- 处理：保留 `shot-02` receipt 与 batch summary，不自动重试、不继续发送后续图片；图片链路标记为整体不可用于本项目生产。
- 防复发：Provider smoke 通过不代表生产尺寸可用；每个图片 Provider 须先以真实目标尺寸、单次请求和同一 endpoint 验证，失败即切换媒体路径而非批量重试。

### EL-132 本机缺少 ffprobe，视频验收须降级为 ffmpeg 解析加帧检视

- 严重程度：P3（验收工具缺口，不影响视频生成）。
- 日期：2026-07-15。
- 症状：对已回收的 Vidu MP4 执行 `ffprobe` 报 `command not found`。
- 根因：本机只安装了可执行视频转码的 ffmpeg 4.2.2，没有同发行包的 ffprobe 二进制。
- 处理：不为验收临时改动系统环境；用 ffmpeg 成功读取 MP4 的视频流元数据并抽取中段 PNG 供视觉检查。
- 防复发：交付验收脚本应把 ffprobe 作为可选增强项，并保留 ffmpeg/浏览器帧检视 fallback。

### EL-133 Vidu 首个 I2V 未显式传纵幅尺寸与无水印参数，画面不达交付标准

- 严重程度：P1（视频质量门未通过）。
- 日期：2026-07-15。
- 症状：`shot-01` Vidu I2V 成功回收 3 秒 1280×720 MP4，但中段帧横幅、人物头部被裁出画面且右下角带生成水印，未满足竖屏、角色可辨和无文字验收条件。
- 根因：runner 只传了 `resolution: 720P`，没有传 Vidu 的 `size` 和 `watermark`；输入关键帧本身是 1672×941 横幅。官方 Vidu 文档列出 720P 纵幅 `size=720*1280` 及 `watermark` 参数。
- 处理：不继续提交其余六段；先制作不改变人物内容的纵幅安全裁切首帧，并把后续请求固定为 `size: 720*1280`、`watermark: false`，再进行一次受限质量门。
- 防复发：视频生产 request 必须显式写入画幅和水印策略；I2V 的首帧宽高比须在提交前与交付画幅一致，验收至少抽取中段帧检查人脸、主体和水印。

### EL-134 Node 24 的 stdin 交付脚本不允许顶层 await 与 require 混用

- 严重程度：P3（本地打包索引脚本）。
- 日期：2026-07-15。
- 症状：生成 delivery manifest 的 Node stdin 脚本报 `ERR_AMBIGUOUS_MODULE_SYNTAX`，提示无法同时处理 `require()` 与 top-level `await`。
- 根因：仓库使用 ESM，Node 24 对 stdin 脚本的模块格式推断拒绝 CommonJS require 和顶层 await 的混用。
- 处理：未产生半成品 manifest；改为纯 ESM `import` 后重跑。
- 防复发：含顶层 await 的临时 Node 验收/打包脚本统一使用 ESM import，或将异步工作包入 CommonJS async function。

### EL-135 Vidu r2v 新模式暴露类型收窄与已完成镜头替换边界

- 严重程度：P2（参考生视频接入验收）。
- 日期：2026-07-15。
- 症状：新增 `r2v` 后，TypeScript 将可选模型字段推断为 `unknown`；同时 reference batch dry-run 因所有目标镜头均为 `video_completed` 而拒绝运行。
- 根因：模型 family 的可选 `r2v` 字段没有显式收窄；原 runner 的“只处理 pending”规则正确，但没有为受控质量替换提供第二层显式授权。
- 处理：以可选字符串字段收窄模型映射；新增仅在 `STARCANVAS_ALLOW_REFERENCE_REPLACEMENT=1` 下生效的已完成镜头替换模式。
- 防复发：新 Provider mode 必须跑 typecheck；任何重生成已完成资产的 runner 均须有独立、命名明确的 opt-in，不能由普通 batch flag 隐式开启。

### EL-136 R2V 批次 summary 沿用了 T2V 标签

- 严重程度：P3（审计元数据）。
- 日期：2026-07-15。
- 症状：参考生视频成功后，`batch-b-videos-summary.json` 仍写入 `B-videos-text-only`。
- 根因：runner 的 summary 标签为硬编码字符串，没有随 reference mode 切换。
- 处理：按 `STARCANVAS_VIDEO_REFERENCE_MODE` 生成 `B-videos-reference`，并从 receipts 重建当前 summary；不重跑任何 Provider 任务。
- 防复发：所有生产 summary 的批次标签必须派生自实际 request mode，而非写死在 runner 中。

### EL-137 E2E 不能假设固定的 Next dev 端口

- 严重程度：P3（本地验收基础设施）。
- 日期：2026-07-16。
- 症状：浏览器回归复用历史 `3183` 地址时得到 `ERR_CONNECTION_REFUSED`；当时唯一运行中的 Next 实例实际监听 `3000`，且无 `3190` 竞争实例。
- 根因：验收命令沿用了历史端口，没有在运行前以 `lsof` 确认监听状态。
- 处理：以实际监听端口 `3000` 运行 E2E，不启动第二个 Next 进程。
- 防复发：所有复用 dev server 的 E2E 在执行前必须检测监听端口，并将其显式传入 `STARCANVAS_E2E_BASE_URL`。

### EL-138 角色参考图会追加交接复核任务，浏览器队列断言仍按四步写死

- 严重程度：P2（浏览器回归阻塞）。
- 日期：2026-07-16。
- 症状：注入角色三视图后的生产队列完成 `5/5`，旧 E2E 仍等待 `4/4`，导致 60 秒假失败。
- 根因：角色参考链正确追加 `review-handoff-warnings`，但 `production-run-queue.spec.ts` 只覆盖了图片、视频、配音、字幕四步。
- 处理：将该 fixture 的期望更新为五步，并在同一浏览器链断言 R2V 请求合同。
- 防复发：任何按角色资产、连续动作或交接规则追加的条件任务，都必须同步覆盖任务数与最终进度断言。

### EL-139 Workflow 视频失败信息显示于运行记录，不保证渲染在节点卡片内

- 严重程度：P3（浏览器回归选择器）。
- 日期：2026-07-16。
- 症状：角色参考图不可读时，E2E 初始断言在视频节点内寻找错误文本而超时；实际错误已正确显示在 `Workflow Run` 失败记录中。
- 根因：通用工作流将 `VideoGenerationError` 作为 run-level 失败呈现，节点卡片不是该错误的稳定 DOM 容器。
- 处理：E2E 改为断言实际可见的运行记录，并同时验证 Vidu route 未收到请求。
- 防复发：涉及工作流失败的浏览器用例，应先确认错误的产品展示层级，再限定 locator 范围。

### EL-140 真实生产脚本仍默认指向废弃的 3183 端口

- 严重程度：P1（付费生产入口会误判服务不可用）。
- 日期：2026-07-16。
- 症状：当前唯一 Next 实例监听 `3000`，但 keyframe、低成本锚点和视频 batch runner 在未设置环境变量时仍请求 `127.0.0.1:3183`。
- 根因：EL-137 只修正 E2E 复用端口；历史生产 scripts 保留独立硬编码默认值，运行态与脚本再次分叉。
- 处理：新增 `scripts/local-api-base.mjs`，三个 runner 共用它；显式 `STARCANVAS_LOCAL_API_BASE` 优先，默认固定为 `http://127.0.0.1:3000`，不扫描或误选其他端口。
- 防复发：`scripts/local-api-base.test.mjs` 断言默认值、显式覆盖和三个 runner 的共享引用；真实或 dry-run batch 前仍须用 `lsof` 确认监听端口。

### EL-141 Canonical 3000 Gate 1 revalidation confirms Copse image origin is still unavailable

- Severity: P1 (image production remains blocked).
- Date: 2026-07-16.
- Symptom: After explicit paid authorization, the one-image Gate 1 runner used canonical `http://127.0.0.1:3000`, one Zhao Heng reference, `1024x1024`, and one attempt. It ran from `07:22:20Z` to `07:24:34Z`, then recorded `failed_image: image route failed (524)`; no keyframe was created.
- Root cause: The result arrives after the local port fix and from a durable local runner, ruling out the stale `3183` default and Codex foreground-session interruption. The remaining failure is the Copse/Cloudflare upstream image path.
- Handling: Archived prior receipts, retained the new failed receipt and runner log, and stopped the batch. No second image or video task was submitted.
- Prevention: Do not spend more image credits through this base URL. Resume only with a different verified image endpoint, or explicitly accept a non-provider fallback.

**2026-07-16 configuration recheck:** StarCanvas uses `https://copse.top/v1`. Copse's public frontend declares `https://copse.top` as its API base, and unauthenticated `POST` probes to both `/v1/images/generations` and `/v1/images/edits` return `401 API_KEY_REQUIRED`. Thus the failure is not a missing `/v1`, an incorrect HTTP method, or an absent OpenAI-compatible image endpoint. Treat it as a Copse origin/upstream timeout; do not change the base URL or spend another paid image request until the provider path is healthy.

### EL-143 Next runtime and interactive shell can have different provider credentials

- Severity: P2 (diagnostic scripts can produce false "key missing" results).
- Date: 2026-07-16.
- Symptom: The running local Next service reports `hasApiKey: true` and its health check connects to the Copse text provider, while a fresh interactive shell has neither `AI_API_KEY` nor `OPENAI_API_KEY`. A direct shell-only `/v1/models` probe therefore cannot use the configured credential.
- Root cause: The active Next process inherited its environment from a different launch context. This is distinct from the canonical project files and is especially likely after switching windows or terminals.
- Handling: Provider production scripts must call the canonical local API rather than read shell credentials. The safe `/api/ai/config` and `/api/ai/health` endpoints are the authoritative no-secret diagnostics.
- Prevention: Before diagnosing a provider, verify the listening Next process and call its safe config endpoint. Never conclude that the provider key is absent from a fresh shell alone, and never recover the key from another process environment.

### EL-144 Copse async batch-image UI is present but the authenticated API is unavailable

- Severity: P1 (no non-billing image fallback through the configured Copse provider).
- Date: 2026-07-16.
- Symptom: Copse's public frontend ships an authenticated Batch Image guide and documents `GET /v1/images/batches/models`, `POST /v1/images/batches`, polling, download, and idempotency. An unauthenticated request to the model catalog correctly returns `401 API_KEY_REQUIRED`, but the canonical local Next service using the configured server credential receives `404` from that same model-catalog endpoint.
- Root cause: Authentication succeeds before the `404`, so this is not a missing Key or a malformed StarCanvas URL. The batch-image backend is absent, disabled for this Copse deployment/key group, or out of sync with its frontend.
- Handling: Added a server-side, no-cost model-catalog probe at `/api/ai/copse-batch-image/models`; it exposes model ids and availability only, never the API Key. The current live result is retained as an unsupported capability, and no batch submission was made.
- Prevention: Do not infer that a provider's visible web UI means the associated API is enabled. Probe the authenticated model catalog before building or paying for a batch-image workflow.

### EL-145 ComfyUI installation path and current service state must be read from its install record

- Severity: P2 (local-image fallback readiness can be overstated).
- Date: 2026-07-16.
- Symptom: An initial inventory used `/Users/wuyongnaren/ComfyUI`, while the verified installation is `/Users/wuyongnaren/Applications/ComfyUI`. The corrected inspection finds only `models/checkpoints/put_checkpoints_here`, and no listener on `127.0.0.1:8188`.
- Root cause: Historical setup evidence was mistaken for current runtime readiness, and an unverified assumed path was used for the first inventory.
- Handling: Corrected the task plan to say that ComfyUI was installed and previously API-validated, but is currently stopped and model-free. No model download or restart was performed.
- Prevention: Use `artifacts/comfyui-local-install-record.md` as the source for the install path; every local-image readiness check must verify both a real checkpoint and the loopback listener.

### EL-146 Paid keyframe runner can lose a foreground client before persisting the provider result

- Severity: P1 (billing/result audit ambiguity).
- Date: 2026-07-16.
- Symptom: A single, text-only, `1024x1024`, retry-once `shot-01` request wrote its receipt before submission, then the foreground runner disappeared before it could store either the route response or an image file. No live runner or relevant connection remained. A prior `shot-03` receipt documents the same class of client-lifecycle loss after a route `200`.
- Root cause: The foreground execution host can terminate a long-running child while the local Next route and provider request are in flight. The OpenAI-compatible synchronous image response contains the only image payload, so it cannot be recovered after the caller loses it.
- Handling: Marked this receipt `result_unknown_after_foreground_termination`; no retry was sent. All future paid image scripts must use a durable detached process and be polled through their receipt/log instead of a foreground automation session.
- Prevention: Never launch a paid synchronous image runner directly in a short-lived foreground automation command. Persist the request receipt first, start a detached runner, and only submit a replacement after the earlier request's billing/result status is known.

### EL-147 Production queue retried a 524 outside the image route's retry guard

- Severity: P1 (a failed image task could be submitted up to three times).
- Date: 2026-07-16.
- Symptom: The image route no longer retries `524`, but the StarCanvas production executor wrapped `generateImageFromPrompt` in a second `retryWithBackoff` policy. The client also preserved provider-supplied `retryable: true` for a `524`, so the outer queue could still repeat a paid POST.
- Root cause: Retry ownership was split across route, client error normalization, and queue executor without one ambiguous-result policy.
- Handling: `524` is now normalized as non-retryable for image generation, and the production executor has an explicit second guard. Queue failures state that the result is unknown and tell the user to inspect assets/billing before using the existing user-triggered retry action.
- Prevention: Every paid image caller must treat `524` as an unknown outcome, not a transient error. Route-level retries alone are insufficient; client and queue retry policies must be covered by the same regression tests.

### EL-148 Vidu retries could create a second task after the first task id was received

- Severity: P1 (duplicate paid video generation after a client/SSE interruption).
- Date: 2026-07-16.
- Symptom: Vidu creates an asynchronous task and returns `task_id`, then StarCanvas polls it over SSE. Prior to this fix, a repeated client request had no stable id linking it to the prior `task_id`, so it would submit a second video task.
- Root cause: The external DashScope call is asynchronous, but the client and route had no local request-to-task registry.
- Handling: Production queue and workflow video calls now send stable `requestId` values. The Vidu route caches a successfully returned `taskId` for six hours and reuses it on the same request id, resuming polling instead of resubmitting.
- Prevention: Vidu task creation remains single-submit per stable local request id. The cache is process-local; after a Next server restart, DashScope-side task discovery still requires its task id, so a request whose response was lost before `task_id` was recorded remains an unknown outcome and must not be blindly retried.

### EL-142 单镜重跑会覆盖视频 batch summary，只留下本次结果

- 严重程度：P2（交付审计完整性）。
- 日期：2026-07-16。
- 症状：`shot-05` R2V 重跑完成后，`batch-b-videos-summary.json` 只剩该镜头；其余七个已完成视频和独立 receipt 仍存在，但汇总视图错误地表现为“只生产了一镜”。
- 根因：runner 在每次运行结束时直接用本次 `results` 覆盖 summary，未合并既有结果。
- 处理：新增 `mergeVideoBatchResults`；按 `plan.shots` 顺序合并，新的成功结果覆盖同镜旧结果，失败重拍不覆盖已有成功资产。已从八份 receipt 恢复当前 summary，并加入 R2V v2 交付包。
- 防复发：`scripts/story-video-batch-core.test.mjs` 覆盖“单镜成功更新保留旧镜头”与“失败重拍保留旧成功”两个用例。

### EL-149 项目包 E2E 把可扩展 manifest 对象误判为回归

- 严重程度：P2（浏览器验收假失败）。
- 日期：2026-07-16。
- 症状：`production-run-project-package-roundtrip.spec.ts` 的导出结果含合法 `title`、`status`、`pose`、`depth` 等扩展字段时，虽然 `shotId`、拆镜建议和 R2V 审计契约正确，E2E 仍因深度全等失败。
- 根因：测试对数组元素使用 `arrayContaining([{ ... }])`，内部对象仍要求完全相等，和 manifest 的向后可扩展设计冲突。
- 处理：改为 `arrayContaining([expect.objectContaining(...)])`；嵌套 `videoReferenceAudit` 同样只校验导出契约字段。
- 防复发：验收可扩展导出对象时，断言稳定契约字段，不能把额外元数据视为失败。

### EL-150 多条长 E2E 共用一个终端会被验收宿主提前终止

- 严重程度：P3（本地验收基础设施）。
- 日期：2026-07-16。
- 症状：一次性运行三条 1 分钟以上的 Playwright spec 时，外层终端宿主在 120 秒后返回超时，且 Playwright 来不及保留完整报告；这不是产品断言失败。
- 根因：本机自动化终端对单个前台命令有固定时限，长测试组合超过该时限。
- 处理：按 spec 独立执行并记录结果；`auto-agent-director-storyboard`、`auto-agent-creative-production-handoff`、`production-run-jianying-export` 均已独立通过。
- 防复发：长浏览器验收按单 spec 或由可持久化 CI runner 执行；不得将前台宿主超时误登记为应用回归。

### EL-151 Vidu SSE 中断后已建任务没有客户端自动恢复

- 严重程度：P1（真实视频任务恢复与重复计费风险）。
- 日期：2026-07-16。
- 症状：服务端已通过稳定 `requestId -> taskId` 复用任务，但浏览器在 SSE 于最终结果前结束时会直接失败；用户只能手动再点一次，恢复路径不够明确。
- 根因：客户端只在 `result` SSE 事件记录 `taskId`，此前没有把传输中断识别为可安全重连的场景。
- 处理：有稳定 `requestId` 时，`NETWORK_ERROR` 或原生传输异常仅自动重连一次，并继续请求原 task；明确 Provider 错误、无 requestId、第二次中断均不重发。`full-pipeline.spec.ts` 覆盖“首次 SSE 无结果结束 -> 同 requestId 第二次成功 -> 视频资产回写”。
- 防复发：付费异步任务的客户端恢复必须以服务端幂等键为前提；不允许对无幂等键的未知提交自动重试。服务重启丢失本地 registry 仍是显式未知结果，不能盲重发。

### EL-152 同一 Vidu requestId 的并发首提交通道仍会双发

- 严重程度：P1（并发付费视频重复提交）。
- 日期：2026-07-16。
- 症状：此前 registry 只在 `createTask()` 成功后写入 `taskId`；两个 SSE 连接在首个 Promise resolve 前同时进入时都会调用 Provider。
- 根因：registry 缺少按 requestId 合并“进行中提交”的记录，只有完成缓存。
- 处理：增加内存 `inFlight` Promise map；第一个请求立即登记，后续同 id 请求等待同一 Promise。成功才写入六小时 task cache，失败仅清理 in-flight，允许之后的显式重试。
- 防复发：`vidu-submission-registry.test.ts` 覆盖两个并行 getOrCreate 仅提交一次且取得同一 taskId；异步付费任务的幂等实现必须同时覆盖 in-flight 与 completed 两个窗口。

### EL-153 Auto Agent 图片 524 用例曾在 mock 模式下形成假通过

- 严重程度：P1（付费图片失败恢复验收失真）。
- 日期：2026-07-16。
- 症状：用例设置了 `/generate-image` 的 524 路由，但 suite `beforeEach` 默认开启 mock；测试实际生成占位图且没有发出路由请求，原先并未验证失败退路。
- 根因：fixture 没有在该用例中覆盖 `startrails_use_mock=true`，也没有断言图片路由实际被调用。
- 处理：该用例显式关闭 mock、断言恰好一次请求；Auto Agent 对 524 复用“结果未知，先检查资产和账单”提示，同时保留不自动执行的待重试 Prompt 节点。
- 防复发：任何 Provider 失败 E2E 必须显式关闭 mock 并断言请求数；`524` 只能提供人工复核后的重试入口，不能显示为普通超时。

### EL-154 剪映导出提取器丢失了音频节点的时间轴入点

- 严重程度：P2（角色配音/拟音交付错位）。
- 日期：2026-07-17。
- 症状：`JianyingAudioNodeInput` 已支持 `startOffsetSeconds`，但从 Canvas 提取音频节点时固定写入 `0`；多个角色 stem 会全部从开头叠加。
- 根因：导出输入合同与 Canvas adapter 演进不同步。
- 处理：adapter 现保留有限、非负的 `data.startOffsetSeconds`，旧节点和非法值继续回退 `0`。
- 防复发：`jianyingDraftExport.extract.test.ts` 覆盖 `12.28s` 角色音轨入点；未来生产队列写入音频节点时须补累计镜头入点，不能依赖导出器猜测。

### EL-155 项目包恢复的音频时间线字段未被剪映 exporter 消费

- 严重程度：P2（恢复项目的角色配音错位）。
- 日期：2026-07-17。
- 症状：恢复后的音频节点已有 `timelineStartTimeSeconds`，但 exporter 只读取新字段 `startOffsetSeconds`，导致旧项目重新导出时音轨回到 `0s`。
- 根因：项目包恢复模型与剪映 adapter 的字段兼容层缺失。
- 处理：`startOffsetSeconds` 优先；缺失时安全回退有限、非负的 `timelineStartTimeSeconds`。
- 防复发：`jianyingDraftExport.extract.test.ts` 覆盖恢复音频节点的 `9.12s` 入点；字段迁移必须保留旧项目的可导出性。

### EL-156 生产队列 TTS 节点未继承源镜头时间轴

- 严重程度：P2（新生成角色配音导出错位）。
- 日期：2026-07-17。
- 症状：生产队列会成功创建 TTS 音频节点，但节点没有时间轴入点；即使源镜头在 `12.28s`，导出仍从 `0s` 开始。
- 根因：TTS 创建路径仅写入素材、时长和来源镜头 ID，遗漏了 Canvas 已有的时间轴字段。
- 处理：音频节点优先继承有限、非负的源 `timelineStartTimeSeconds`；缺失时回退已计算的 `shot.subtitleTimeline.startTimeSeconds`；两者都缺失时，按当前 `buildShotProductionBriefs` + `buildSubtitleTimeline` 的明确镜头序列计算累计入点；最后才为 `0`。结果同时写入 `startOffsetSeconds` 与 `timelineStartTimeSeconds`，不猜测画布空间位置。
- 防复发：`production-run-queue.spec.ts` 在真实浏览器中仅提供 `shot.subtitleTimeline.startTimeSeconds=12.28`，断言生成配音节点也为 `12.28s`；`shotTimelineStart.test.ts` 覆盖显式、持久化、累计计算、非法值四级优先级；导出 adapter 的 Node 回归同时覆盖新旧时间字段。

### EL-157 字幕累计时间模块不能直接进入 Node 回归

- 严重程度：P3（测试可运行性，不影响 Next 运行时）。
- 日期：2026-07-17。
- 症状：新增纯 Node 时间轴 resolver 测试时，`storyboardSubtitleTimeline.ts` 的 `./subtitleFormatter` 无扩展名导入可被 Next 解析，却被 `node --experimental-strip-types` 拒绝。
- 根因：模块在浏览器构建路径中使用，未经过裸 Node ESM 解析验证。
- 处理：将该相对导入明确为 `./subtitleFormatter.ts`，不改变运行逻辑。
- 防复发：`shotTimelineStart.test.ts` 直接经 `node --test --experimental-strip-types` 运行并调用累计字幕构建器。
