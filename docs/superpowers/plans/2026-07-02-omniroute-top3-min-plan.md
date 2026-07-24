# StarCanvas OmniRoute Top 3 最小改造计划

> 适用主仓：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`
> 目标：吸收 OmniRoute 最值得借鉴的 5 个落点中的 Top 3，以最小补丁提升 StarCanvas 的“正式可用性判定、任务级路由、生产队列稳定性”，避免继续在 provider/模型/任务链路上重复误判。

## Top 1：任务级开工判定（Task Readiness）

### 目标
把当前“分项 health / smoke”升级成“用户当前能不能开始某条真实创作链路”的统一判定。

### 为什么优先
这是最直接减少重复工作的地方。当前系统能告诉用户 text/image/video 分项是否 ready，但还不能足够准确地回答：
- 我现在能不能做一句话创作？
- 能不能开始生产队列？
- 能不能跑完整项目骨架 + 生图？

### 改造范围

#### 新增文件
- `apps/web/src/lib/ai/taskReadiness.ts`
- `apps/web/src/lib/ai/taskReadiness.test.ts`

#### 修改文件
- `apps/web/src/lib/ai/provider-health-summary.ts`
- `apps/web/src/lib/ai/providerSmoke.ts`
- `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx`
- `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`
- `apps/web/e2e/provider-health-summary.spec.ts`
- `apps/web/e2e/production-run-queue.spec.ts`

### 关键函数级落点

#### 1. `apps/web/src/lib/ai/taskReadiness.ts`
新增纯函数：
- `buildTaskReadinessSummary(input)`
- `buildTaskReadinessItem(taskId, providerHealthSummary, providerSmokeReport)`

建议任务枚举先只做 4 个：
- `chat-create`
- `auto-agent-project-bootstrap`
- `image-production`
- `production-run`

输出字段最少包含：
- `taskId`
- `status: ready | warning | blocked`
- `blockingReasons: string[]`
- `recommendedFixes: string[]`

#### 2. `apps/web/src/lib/ai/provider-health-summary.ts`
复用现有：
- `buildTextItem()`
- `buildImageItem()`
- `buildVideoItem()`
- `buildProviderHealthSummary()`

不重写现有 item 逻辑，只把它作为 `taskReadiness.ts` 的基础输入。

#### 3. `apps/web/src/lib/ai/providerSmoke.ts`
复用现有：
- `buildProviderSmokeReport()`

只补一个导出辅助函数，例如：
- `summarizeProviderSmokeForTasks(report)`

避免 `taskReadiness.ts` 直接解析 UI 文案。

#### 4. `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx`
在现有：
- `providerHealthSummary`
- `providerSmoke`
- `handleCheckProviderSmoke()`

之上新增一个“正式开工判定”块，不单独发新请求，直接本地聚合显示。

#### 5. `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`
在现有：
- `getProductionProviderItems(summary)`
- `providerBlockingCount`

之外，引入 `production-run` 的 task readiness 结果，替代当前“只按 image/video 两项 blockingCount 决定能否开始”的粗粒度逻辑。

### 最小测试计划

#### Node 单测
- `apps/web/src/lib/ai/taskReadiness.test.ts`
  - 无任何 key 时：`chat-create` blocked，`production-run` blocked
  - 只有 session key 且无 DashScope 视频 provider 时：`image-production` ready，`production-run` warning 或 blocked（按设计收口）
  - text/image 都 ready、video warning 时：`auto-agent-project-bootstrap` ready，`production-run` warning

#### 回归单测
- `apps/web/src/lib/ai/provider-health-summary.test.ts`
  - 保持既有语义不回退
- `apps/web/src/lib/ai/providerSmoke.test.ts`
  - 保持 dry-run 语义不回退

#### E2E
- `apps/web/e2e/provider-health-summary.spec.ts`
  - 新增断言：设置页出现任务级 readiness 文案，如“可开始图片生产”“完整生产仍需视频 provider”
- `apps/web/e2e/production-run-queue.spec.ts`
  - 新增断言：开始生产按钮由 task readiness 控制，而不是只看 `0 阻塞`

---

## Top 2：统一模型/Provider 合同层（Alias + Capability Contract）

### 目标
把“用户填写的模型名”“上游真实接受的模型名”“该模型支持哪些 endpoint/任务”统一收口，减少 chat/image/video 在中转站上的误判。

### 为什么优先
你前面给的 `copse.top` 就是典型例子：同一组 key，生图能用，对话模型不通。当前仓库虽然已经有：
- `model-resolve.ts`
- `vidu-model.ts`
- `provider-registry.ts`

但它们还没有形成统一合同层。

### 改造范围

#### 新增文件
- `apps/web/src/lib/ai/providerTaskRouting.ts`
- `apps/web/src/lib/ai/providerTaskRouting.test.ts`

#### 修改文件
- `apps/web/src/lib/ai/provider-registry.ts`
- `apps/web/src/lib/ai/model-resolve.ts`
- `apps/web/src/lib/ai/model-resolve.test.ts`
- `apps/web/src/app/api/ai/generate-video-vidu/vidu-model.ts`
- `apps/web/src/lib/ai/provider-health-summary.ts`
- `apps/web/src/app/canvas/components/panels/SettingsPanel.tsx`

### 关键函数级落点

#### 1. `apps/web/src/lib/ai/providerTaskRouting.ts`
新增纯函数：
- `resolveProviderTaskContract(input)`
- `resolveTaskModelAlias(taskType, model, providerId?)`
- `isTaskSupportedByContract(taskType, contract)`

建议最小合同字段：
- `taskType: text | image | video`
- `providerId`
- `requestedModel`
- `resolvedModel`
- `supported: boolean`
- `reason?: string`

#### 2. `apps/web/src/lib/ai/provider-registry.ts`
复用现有：
- `isImageModel()`
- `isVideoModel()`
- `isChatModel()`
- `mergeProviderConfig()`
- `findProviderByCapability()`

新增一层轻量 metadata，不重写 registry 主体。
重点是补“task contract 视角”，不是只判断模型是否出现在 Set 里。

#### 3. `apps/web/src/lib/ai/model-resolve.ts`
保留现有 `resolveModelForTask()`。
新增或扩展输出：
- `normalizedModel?`
- `contractWarnings: string[]`

但不要把 provider 选择塞进这里，仍保持它是“模型解析纯函数”。

#### 4. `apps/web/src/app/api/ai/generate-video-vidu/vidu-model.ts`
继续作为视频合同的特例归一化层。
不要被新合同层替代，而是由 `providerTaskRouting.ts` 调用它。

#### 5. `apps/web/src/lib/ai/provider-health-summary.ts`
在：
- `buildTextItem()`
- `buildImageItem()`
- `buildVideoItem()`

里增加基于合同层的 message 改进，例如：
- “当前模型名已配置，但不属于该 provider 的已知 chat 合同”
- “这个视频模型只支持 Vidu 路由，不支持通用 OpenAI 兼容视频接口”

### 最小测试计划

#### Node 单测
- `apps/web/src/lib/ai/providerTaskRouting.test.ts`
  - OpenAI-compatible relay + `gpt-image-1` -> image supported
  - OpenAI-compatible relay + `vidu` -> video unsupported unless explicit DashScope route contract
  - `vidu-q3-turbo-i2v` -> normalize to DashScope vidu model family
- `apps/web/src/lib/ai/model-resolve.test.ts`
  - 增加合同 warning 用例

#### 回归单测
- `apps/web/src/app/api/ai/generate-video-vidu/vidu-model.test.ts`
  - 保持现有 alias 能力
- `apps/web/src/lib/ai/provider-health-summary.test.ts`
  - 增加“模型名存在但合同不支持”的 warning/blocking 文案

#### UI / E2E
- `apps/web/e2e/provider-health-summary.spec.ts`
  - 新增断言：模型设置面板能区分“缺 key”与“模型合同不支持”

---

## Top 3：Auto Agent / 生产队列统一走任务路由与 readiness

### 目标
把 Top 1 和 Top 2 的结果真正接到主工作流，而不是只停留在设置页。先覆盖两个主路径：
- Auto Agent 一句话创作
- Production Run 开始生产

### 为什么优先
如果只补设置页，用户还是会在真正执行时踩坑。这个改造的关键，是让“路由/判定”进入真实执行入口。

### 改造范围

#### 新增文件
- 无需新增 UI 文件
- 如有必要可新增：`apps/web/src/app/canvas/utils/autoAgentTaskRouting.ts`

#### 修改文件
- `apps/web/src/app/canvas/utils/autoAgentService.ts`
- `apps/web/src/app/canvas/utils/autoAgentService.test.ts`
- `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`
- `apps/web/src/app/canvas/hooks/useProductionRunExecutor.ts`
- `apps/web/src/lib/storyboard/productionRunQueue.ts`
- `apps/web/e2e/auto-agent-clarification.spec.ts`
- `apps/web/e2e/full-pipeline.spec.ts`
- `apps/web/e2e/production-run-queue.spec.ts`

### 关键函数级落点

#### 1. `apps/web/src/app/canvas/utils/autoAgentService.ts`
复用现有：
- `shouldFallbackToPlainChat()`
- `buildAutoAgentClarificationResponseActions()`
- `buildAutoAgentPlanningActions()`
- `processWithAutoAgent()`

最小改造点：
- 在 `processWithAutoAgent()` 中增加 task readiness / task contract 检查
- 如果当前 provider 只支持 text，不支持 image，则在生成“视觉概念图/生产任务”动作时提前降级或提示
- 不要等到真正 run node 才失败

建议新增辅助函数：
- `resolveAutoAgentExecutionProfile(userIntent, canvasContext)`
- `buildAutoAgentCapabilityWarningActions(profile)`

#### 2. `apps/web/src/app/canvas/hooks/useWorkflowRunner.ts`
复用现有：
- `isTextModelStep()`
- `isImageModelStep()`
- `isVideoGenerationStep()`
- `resolveLocalModelOverrides()`

最小改造点：
- 在 `runNode` / `executeStep` 的模型解析处接入 `resolveProviderTaskContract()`
- 对 image/video step 在真正请求前先做合同检查，返回更干净的 failed reason

#### 3. `apps/web/src/app/canvas/hooks/useProductionRunExecutor.ts`
最小改造点：
- 启动队列时先读取 `production-run` task readiness
- 任务执行时按 action 再走一次 task contract 校验，避免“队列能启动但某一步模型根本不支持”

#### 4. `apps/web/src/lib/storyboard/productionRunQueue.ts`
复用现有：
- `buildPreflightBlockedActions()`
- `buildVideoProviderBlockedActions()`
- `buildProductionRunQueue()`

最小改造点：
- 增加 provider contract 级 blocked action，例如：
  - `provider-contract:image-model-unsupported`
  - `provider-contract:video-model-unsupported`
- 不大改 queue 数据结构，只是扩展 blocked reason 来源

### 最小测试计划

#### Node 单测
- `apps/web/src/app/canvas/utils/autoAgentService.test.ts`
  - 当创意请求会生成 image workflow，但当前合同不支持 image 时，Auto Agent 生成 warning / setup intent，而不是直接继续假跑
- `apps/web/src/lib/storyboard/productionRunQueue.test.ts`
  - 当 queue 依赖的视频合同不支持时，blocked actions 包含 provider-contract 原因
- `apps/web/src/app/canvas/hooks/productionRunExecutorState.test.ts`
  - 已 blocked 的合同任务不会进入 runnable 集合

#### E2E
- `apps/web/e2e/auto-agent-clarification.spec.ts`
  - 新增用例：text ready / image blocked 时，点击“生成分镜”能继续，但不会自动进入 image production
- `apps/web/e2e/production-run-queue.spec.ts`
  - 新增用例：队列可见，但合同不支持的视频任务被拦截为 blocked reason
- `apps/web/e2e/full-pipeline.spec.ts`
  - 新增断言：失败原因是 provider contract / readiness，不再是晚到的上游模糊报错

---

## 推荐执行顺序

1. **Top 1：任务级开工判定**
   - 成本最低
   - 立刻减少用户误判
   - 也能为后两项提供稳定输入

2. **Top 2：统一模型/Provider 合同层**
   - 收口“模型名对但任务不支持”的老问题
   - 是你前面真实 key 验证反复卡住的根源之一

3. **Top 3：把前两项真正接入 Auto Agent 和生产队列**
   - 这是把“设置页能力”变成“主工作流能力”的最后一跳

## 不该做的事

- 不要先重写整个 provider-registry。
- 不要把 StarCanvas 改造成 OmniRoute 的通用管理后台。
- 不要现在引入 webhook/telemetry 大系统。
- 不要先大拆 `StarCanvas.tsx`；这三项都能先以窄补丁完成。
