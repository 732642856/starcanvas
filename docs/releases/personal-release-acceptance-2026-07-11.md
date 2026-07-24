# StarCanvas 个人发布验收（2026-07-11）

## 发布定位

- 用途：个人正式使用，不对外计费。
- 主仓：`/Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas`。
- 分支：`codex/starcanvas-staged-split`，与远程同名分支 `0 ahead / 0 behind`；当前功能变更仍在工作树。

## 固定启动方式

```bash
cd /Users/wuyongnaren/Projects/StarCanvas/01_MAIN_主干/starcanvas
corepack pnpm install
corepack pnpm cli:start
corepack pnpm cli:status
```

开发模式备用：

```bash
corepack pnpm dev:web
```

## Fresh 硬证据

- Full unit：`978 tests / 969 pass / 9 skipped / 0 fail`。
- Typecheck：通过。
- Lint：`0 errors`；`79` 个既有 warning。
- Auto Agent -> Project Bible 真实 provider：通过。
- 真实生图 -> 画布 + 资产库：通过。
- Vidu 最终视频 URL 回收：通过，返回 `video/mp4`。
- Auto Agent -> 生产 -> 剪映 ZIP：通过。
- 项目包导出 -> 新画布恢复：通过。
- Shot Planning -> Run Queue -> Jianying ZIP：通过。
- 生产失败 -> 手动重试 -> 依赖链继续：通过。
- Chat 先预览 -> 草稿节点 -> 确认/丢弃 -> deferred edge：`2/2` 通过。
- App Router 根错误 -> Sentry：合同测试通过；fresh production build 通过且缺失 `global-error` 警告已消失。

## Provider 边界

- API Key 仅通过本地 env/会话设置提供，不写入本报告。
- text/image/video 必须经 `taskReadiness` 和 provider task contract 前置检查。
- 真实 image/video smoke 需显式成本确认；不默认消耗额度。
- server TTS 可为 warning；浏览器 TTS 是个人使用兜底。

## 已知非阻塞限制

- 长中文生图可因上游 `524` 退化为“待重试 Prompt”，不会丢失创作上下文。
- 剪映 ZIP 仍是交接包；浏览器已验证单片段、双片段 WebM -> MP4 下载。音频、字幕合成尚待同等级验证。
- 超大项目包仍需流式 ZIP/分块存储优化。
- 当前工作树变更量大；功能可用，但尚未形成干净 commit/PR。

## 工作树分类

- 产品源码：Provider 合同/媒体桥接、Auto Agent、Project Bible、生产队列、项目包、剪映导出。
- 测试证据：23 个 E2E 变更及新增单测/合同测试。
- 事实文档：`current-capability-map.md`、`error-ledger.md`、`QA_CHECKLIST.md`、本报告。
- 本地工具生成物：`.serena/`、`apps/web/src/graphify-out/`，已 ignore，未删除。
- 历史副本恢复：Preview Draft Transaction 与批量节点布局已迁回；其他旧 workflow/backend/export helper 仍需先对照当前等价实现，不直接复制。

## 建议提交批次

1. Provider contract / network / session scope / media bridge。
2. Auto Agent / Project Bible / production queue / artifact writeback。
3. Project package / structured export / Jianying handoff。
4. Unit + E2E 验收证据。
5. Capability map / QA / error ledger / release report。

## 备份与回滚

- 正式拆批前不删除未跟踪文件。
- 每批单独 commit；回滚时按批次 `git revert <commit>`，不使用 `git reset --hard`。
- 项目内容备份使用项目包导出，并在新画布导入验证后再清理旧数据。
