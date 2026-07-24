# 审计发现

## 2026-07-16 事实源复核
- Copse Gate 1 已在 canonical `3000`、持久后台 runner 下再次失败为 `524`；端口或前台会话不是图片生产阻塞根因，不能再把同一 base URL 当可用 fallback。
- 唯一可写源码是 `01_MAIN_主干/starcanvas`；Desktop `StarCanvas-v2` 只是它的软链接。
- `starcanvas-active`、6/18 与 6/21 Codex 目录、开发版、Quarantine 和桌面文件库均已归类；没有证据支持把任一目录整体复制回主仓。
- 6/18 与 6/21 Git 快照的提交均为当前主仓祖先；`starcanvas-active` 的已提交 HEAD 亦为祖先，但保留 19 项未比较本地改动，只能逐项取证。
- 当前服务是 `http://127.0.0.1:3000`。遗留 batch scripts 默认 3183 是本轮确认的真实生产入口 bug，已用共享 resolver 修复。
- LocalSkillRegistry 当前启用、166 条 metadata、29 条风险标记、正文注入关闭；参考资料目录不会自动读入 Crew。
- 《太子替我背黑锅》R2V v2 已含完整 8 段角色参考视频，shot 05 的历史裁切已替换并经三时点画面检查；图片 Provider 生产尺寸仍持续 `524`，临时旁白仍是交付质量缺口。

## 2026-07-13 初始事实
- `gpt-image-2` 已成功生成无参考场景图；并非全部 GPT 生图不可用。
- 失败面是经 `copse.top` 的参考图编辑，上游返回 502（EL-089）。
- DashScope 当前账户仅见 Qwen 文本和 HappyHorse 视频能力，不可充当图像 Provider（EL-090）。
- 本机发现主干、开发版、Codex 历史 worktree、隔离备份/合并残留等多副本；须以 Git 元数据和源码差异判定，不按目录名猜测。
- 唯一开发主仓、所有副本归类及 BYOK 边界见 `docs/audit/source-of-truth-and-byok-audit-2026-07-13.md`。
- OpenAI 编辑 route 已对齐官方 multipart `image[]`；GPT Image 的能力本身正常，当前风险点是代理兼容性。
- 通用 BYOK 正确阻止 localhost，ComfyUI 需要专用 adapter，不能把 `127.0.0.1` 白名单塞进通用 SSRF 例外。
- 重新扫描发现 WorkBuddy `starcanvas-dev` Skill 和 2026-06-18 Codex worktree；前者是本轮开发约束来源，后者与 6/21 worktree均为同源历史候选，不直接复制。
- AI 视频预演/导演 prompt 的研究和可落地字段见 `docs/research/ai-video-previz-and-director-prompt-playbook-2026-07-13.md`。
- 单镜头 I2V 不能把连续动作直接交给模型：当前实现保留首个动作，拆镜建议持久化到 production brief、queue preflight 和 project package manifest；因此后续 worker 可读到同一约束，不依赖 UI 文案。
- 项目包序列化已包含 `productionRunManifest`；浏览器下载回归直接验证 `previsPlans[].splitShotRecommended`，不存在“内存态有、交付包无”的断点。
- 本机未发现 ComfyUI/ControlNet 服务或专用 endpoint 配置；`generate-with-pose` 是通用图像 provider 路由，不能作为本地 Comfy worker 的替身。
- 导演组原先只有角色 prompt；现在本机 LocalSkillRegistry 受 server-only allowlist 保护。正文默认不进入模型，metadata/正文模式、hash、截断、风险均由 Crew audit 记录；绝不记录正文。
