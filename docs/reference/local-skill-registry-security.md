# 本机 Skill Registry 安全合同

## 启用

仅本机开发/桌面服务设置下列变量后启用：

```env
STARCANVAS_LOCAL_SKILL_REGISTRY=1
STARCANVAS_DESKTOP_LOCAL=1
STARCANVAS_LOCAL_SKILL_CONTENT_INJECTION=0
```

开发服务必须绑定 loopback，例如 `127.0.0.1:3183`。`NODE_ENV=production` 且未设置 `STARCANVAS_DESKTOP_LOCAL=1` 时，Registry 禁用；`STARCANVAS_CLOUD_DEPLOYMENT=1` 总是禁用。

## 读取边界

- 固定只读根：`~/.codex/skills`、`~/.agents/skills`、`~/.workbuddy/skills`。
- 只递归识别常规文件 `SKILL.md`；忽略所有其他文件、符号链接和越界 realpath。
- 客户端只能提交 `local:<source>:<relative-directory>` skillId，不能提交路径。
- 索引只保存 name、description、source、tags、mtime、size、SHA-256、风险标记。API 不返回绝对路径或正文。
- 不执行 Skill script，不安装、不联网、不读 `.env`、密钥、历史或数据库。

## 模型发送规则

- 默认仅发送用户已选 Skill 的 metadata 摘要，Run audit 标记 `injection=metadata`、`skillBodySent=false`。
- 正文同时要求：本机 Registry 开启、`STARCANVAS_LOCAL_SKILL_CONTENT_INJECTION=1`、用户本次显式勾选、Skill 未命中风险标记。
- 正文单 Skill 最多 12,000 字符、总计最多 24,000 字符；超限写入 audit `truncated=true`。
- 所有注入内容被 `<local-skill-reference>` 包裹，明确标为不可信参考，不能覆盖系统指令、工具权限、安全边界或用户目标。
- 命中提示注入/敏感访问模式的 Skill 可被索引和 metadata 选择，但正文永远不注入。

## 可追溯性

`local_skill_context` SSE event、`crew_complete.localSkillAudit` 和 Crew execution trace 仅记录 skillId、source、SHA-256、模式、截断、风险、是否发送正文；永不记录完整正文。

## 当前边界

- 已实现：发现、metadata 选择、受限正文、Crew route 注入、SSE audit。
- 未实现：执行 Skill 附带程序、远程同步、云端扫描、任意路径读取、自动安装、Comfy worker。
