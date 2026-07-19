# 星轨画布源代码与 BYOK 审计（2026-07-13）

## 唯一开发主仓

`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`

- Git remote：`git@github.com:732642856/starcanvas.git`
- 当前 branch/HEAD：`codex/starcanvas-staged-split` / `a41305a`（2026-07-04）。
- 该工作树有大量未提交的在制改动；它们是当前能力来源，禁止用历史目录覆盖、复制或重置。

## 本机副本归类

| 位置 | 结论 | 处理规则 |
|---|---|---|
| `01_MAIN_开发版/starcanvas` | 旧仓，2026-06-07，remote 不同 | 仅作考古，不合并 |
| `01_MAIN_主干/starcanvas-opendraft-screenwriter` | 同一 Git 仓的独立 worktree | 仅维护编剧分支 |
| `02_WORKTREES/skill-workbench-*` | 同一 Git 仓的独立 worktree | 不与主干工作树混写 |
| `Documents/Codex/.../2026-06-21/.../work/starcanvas` | 同 remote 的 2026-06-19 历史 worktree，261 项脏改动 | 只做逐文件证据比较，不复制 |
| `Documents/星轨画布` | 空 Git 初始化，无提交、无 remote | 不是源码仓 |
| `GitRepoQuarantine/*`、`02_ARCHIVE_*`、`Desktop/星轨画布文件库` | 非 Git 归档/隔离物 | 不参与构建、部署或代码同步 |
| `WorkBuddy/.../starcanvas-src` | remote 为 `star-track-life2`，非 StarCanvas | 排除 |

远端已列出 `main`、当前 `codex/starcanvas-staged-split` 和功能分支；未发现“另一个更新主线”。以后检索顺序固定为：主仓当前 worktree -> `git worktree list` -> 同 remote 历史 worktree -> 非 Git 归档。

## GPT 图像能力结论

- `gpt-image-2` 文生图已真实成功生成御膳房场景；GPT 图像模型可用。
- 失败仅发生在当前 `copse.top` 代理的“带人物三视图编辑”调用，返回 502（EL-089）。
- 主仓 route 会在 `sourceImage` 存在时调用 `/images/edits`；此次修正 multipart 字段为官方 OpenAI 合同 `image[]`，并以两张参考图 unit test 验证。
- 官方文档确认 `gpt-image-2` 同时支持 images generate 和 image edits：[OpenAI Image generation guide](https://platform.openai.com/docs/guides/image-generation)。

## 用户自带 Key 的当前实现

1. Settings 提供会话 Key、Base URL、默认/图片/视频模型和超时覆盖。
2. Key 随请求的 `_providerOverrides` 到服务端，服务端合并为本次请求 config；不必改项目 `.env.local`。
3. 默认是会话态；用户显式选择“本地保存”时才写浏览器 localStorage。`.env.local` 受 `.gitignore` 保护。
4. 直接 OpenAI API 可使用 `https://api.openai.com/v1` + Platform API Key + `gpt-image-2`。ChatGPT 订阅与 API 账单/Key 是独立体系。

成熟画布通常采用三种模式：服务端共享 Key（平台额度）、用户 Key 会话代理（当前主仓已实现）、或用户 Key 加密入库（需账户、密钥管理和审计）。当前项目应坚持会话 Key 为默认，避免把第三方 Key 保存到画布项目文件。

## ComfyUI 结论

- ComfyUI 本体可本机/云端运行并提供 API，但 StarCanvas 尚无 Comfy workflow adapter。
- 通用 BYOK 的 SSRF 防护会拒绝 `127.0.0.1`/localhost Base URL；这是预期安全边界，不能为方便而全局放开。
- 若接入，需单独实现 Comfy provider：明确的 workflow allowlist、仅开发环境或显式 `AI_ALLOW_LOCAL_PROVIDER` 开关、任务队列/历史回收、IP-Adapter/InstantID reference workflow 合同测试。

## 已验证

- `image-edit-form.test.ts`：两张参考图均使用 `image[]`，不再提交遗留 `image` 字段。
- `vidu-task.test.ts`：5/5 通过。
- `pnpm --filter web typecheck`：通过。
- `git diff --check`：通过。
