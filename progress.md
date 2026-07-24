# Progress

## 2026-07-16
- 用户授权后，单张图片 Gate 1 仍在 canonical `3000` 上于约 134 秒返回 Copse `524`，故停止该 base URL 的后续付费图片调用。Vidu 随后完成两次 `shot-05` R2V；第二次经三时点 QA 确认可见匕首击锅和火花，上一版自动归档。已本地合成 24.71 秒、8 段 R2V 的 v2 母版，封装 `artifacts/太子替我背黑锅-delivery-package-r2v-v2.zip` 并通过 `unzip -t`。
- 修复 `run-story-video-batch.mjs` 的 batch summary 覆盖问题：保留既有成功镜头、失败重拍不抹除成功结果；完整脚本回归 16/16。已从八份 receipt 恢复当前 summary 并写入 v2 ZIP；整片 4x2 接触表确认八段均进入 v2 母版。
- 完成本机项目位置、Git worktree、远端 refs、运行进程、交付物、Skill Registry 和配置边界复核；权威地图见 `docs/reference/runtime-source-of-truth-2026-07-16.md`。旧 `00_INDEX_总索引` 只保留历史价值。
- 最终 R2V ZIP 完整；delivery manifest 记录 24.71 秒、720x1280、7 段 R2V。shot 05 和临时单声线旁白仍为已知限制。
- 确认 3 个生产 runner 默认打向废弃 3183；新增共享 `local-api-base` resolver，默认 3000，显式 override 优先。`node --test` 14/14、`node --check`、R2V dry-run 均通过，未触发 Provider。

## 2026-07-13
- 已读取 `docs/reference/error-ledger.md`（至 EL-092）。
- 已发现本机 StarCanvas 目录与主仓 Git worktree；下一步采集 refs、HEAD、关键代码哈希及 Provider 调用证据。
- 已完成副本、远端、Key 边界、GPT 图生图 route 与官方合同审计。
- 修正 `/images/edits` multipart `image[]`；新增合同测试。修复视频 `UNKNOWN` 任务状态的 TypeScript 联合类型遗漏。
- 定向 6/6、`pnpm --filter web typecheck`、`git diff --check` 均通过。后续仅需在用户提供 endpoint/部署选择后推进专用 Comfy adapter。
- Provider Settings E2E 初次因未复用已运行的 3183 dev server 未启动；已登记 EL-096，改用显式 `STARCANVAS_E2E_BASE_URL` 重跑。
- `STARCANVAS_E2E_BASE_URL=http://127.0.0.1:3183` 下 `e2e/provider-health-summary.spec.ts` 已完成；验证 session Key / health / 真实 smoke 的设置页路径可在浏览器执行。
- 已按 WorkBuddy `starcanvas-dev` Skill 重做本地副本、worktree、SKILL.md、未跟踪能力扫描；发现并归类 6/18 历史 worktree，未导入其脏改动。
- 已完成 AI 视频白模预演/导演提示词全球资料研究；开始将单镜头 I2V 编译器接入当前视频主路径。
- `videoPromptDirector` 已接入 `StarCanvas.tsx` 的镜头 I2V 调用；定向 node:test + 视频资产回收回归 `6/6`、web typecheck、diff check 通过。EL-101 修复了多语言动作词表漏判。
- I2V 编译 prompt 与白模建议已显示在 ShotNode 的付费前确认区；`e2e/shot-video-direction.spec.ts` 在复用本地服务模式下完成，未触发 Provider 调用。
- 白模计划已写入 `ShotProductionBrief.handoff.previs`，动态镜头自动生成预检 warning；video prompt/brief/preflight 定向测试、typecheck、diff check 通过。EL-102/103 已收口。
- `previsPlans` 已进入项目交付 manifest；manifest + brief + preflight + video prompt 定向测试 `19/19`、web typecheck、diff check 通过。
- `e2e/production-run-project-package-roundtrip.spec.ts` 已在复用本地服务模式下完成，覆盖生产队列 -> 项目包 -> 恢复 -> 再交付长链，未触发真实 Provider。
- 连续动作拆镜建议已进入 `ShotProductionBrief.handoff.previs.splitShotRecommended`、生产预检交接 warning 与项目 manifest `previsPlans`；video prompt / brief / preflight / manifest 定向测试与 web typecheck、diff check 通过。
- `e2e/production-run-project-package-roundtrip.spec.ts` 已增强并完成：真实下载的项目包 JSON 断言连续动作镜头包含 `previsPlans[].splitShotRecommended=true`，随后导入恢复并再导出剪映兼容包。`lint` 通过，未触发 Provider。
- 本地预览已收敛为唯一服务：`http://127.0.0.1:3183`。冷启动 health/config 编译约 35–50 秒，完成后已验证 `health=200`、`config=200`、`hasApiKey=true`；见 EL-105/106。
- 已移除无依赖、无匹配用例的 Vitest 死脚本；`pnpm --filter web test:all`、`typecheck`、`lint`、`git diff --check` 均通过。见 EL-107。
- 已迁入干净 worktree `cbec72d` 的 workbench-kernel；新增本机 LocalSkillRegistry。实际 metadata-only API 已发现 164 个 allowlist Skill，覆盖 codex/agents/workbuddy；正文开关保持关闭。Crew 面板、`/api/ai/crew/run`、SSE audit 已接入。定向 node:test、typecheck、lint、mock E2E 通过；EL-109~111 已记录。
- 已清理失效的同仓 3190 Next dev 实例；唯一有效预览为 `http://127.0.0.1:3183`，config `200`、`hasApiKey=true`。见 EL-108。
- AgentNode 的公开“运行 Crew”入口已改为显式调用 `film.crew.orchestrator` SkillRuntime。成功、运行时返回失败和抛错均记录节点状态、运行历史、用量与 WorkflowRunEvent；新增请求契约测试，并补 `agent-node-run-{id}` 浏览器稳定锚点。未触发 Provider。
- EL-113 已收口：预检草稿的“补语音意图”用例改为真实规则，自动清除声线意图 warning，但对白镜头保留白模预演复核 warning；定向 15/15、`test:all`、typecheck、lint、diff check 通过。
- AgentNode SkillRuntime mock E2E 已通过：双击画布创建导演节点、填入剧本、点击运行，mock chat SSE 收到完整 7 Agent 调用且节点回到完成态；EL-114 的 Crew 状态类型别名亦已收口。无真实 Provider 调用。
- 已筛选 Inky、Twine、Dialogic 的一手资料：采纳叙事图、条件状态、时间事件、局部重演与问题定位；明确不引入其脚本执行、Godot/Electron runtime。见 `docs/reference/narrative-editor-reference.md`。
- 已落地画布问题中心：`CanvasIssueCenter` 聚合 preflight 与队列阻塞项、按严重度排序、去重后复用现有镜头定位/修复草案；工具栏与 Chromium E2E 已验证。同步收口队列条件任务断言 EL-116/117。定向 14/14、`test:all`、build、typecheck、lint、diff check 通过。
- 《太子替我背黑锅》已完成免费预生产：提取原剧本，形成 8 镜头/24 秒计划，复用赵珩与荆钗三视图、已完成 shot-01 关键帧和 shot-05 真实 MP4；剩余为 6 张关键帧和 7 段 Vidu 三秒视频，等待显式额度授权。见 `artifacts/太子替我背黑锅-full-production-plan.{md,json}`。
- 《太子替我背黑锅》批次 A 已在用户授权下尝试，但 Copse `gpt-image-2` reference-image edit 连续返回 Cloudflare 524；未得到新增关键帧，已停发后续请求并保存 shot-03 response-lost / shot-06 failed receipts。runner 改为后台可审计且 timeout 覆盖 route 双重试预算；见 EL-118~121。Vidu 批次未启动。
