# 叙事编辑器参考筛选

日期：2026-07-14。

## 目的

只提取可提升“剧本 -> 分镜 -> 队列 -> 交付”可靠性的机制；不把互动小说编辑器、游戏引擎或桌面应用架构引入 StarCanvas。

## 一手来源

- Inky / ink：[README](https://github.com/inkle/inky)（MIT）。
- Twine：[官网](https://twinery.org/)、[TwineJS](https://github.com/klembot/twinejs)。
- Dialogic：[README](https://github.com/dialogic-godot/dialogic)、[文档](https://docs.dialogic.pro/introduction.html)。

## 保留的机制

| 来源 | 可迁移机制 | StarCanvas 落点 | 优先级 |
| --- | --- | --- | --- |
| Inky | 修改后从上次有效位置继续运行；问题可跳转源位置；多文件/导出 | 受影响镜头局部重演、问题中心、剧本段落到交付物溯源 | P1 |
| Twine | 可视化 passage 图；条件分支；变量；HTML 试玩 | 叙事节拍图、版本/分支条件、无付费的剧情路径预览 | P1 |
| Dialogic | 时间轴事件；角色与变量资源；条件/信号；可视化事件序列 | 镜头节拍时间线、角色状态连续性、队列条件、Crew 事件 trace | P1 |

## 不迁移

- Inky 的 Ink 语言、Twine story format、Dialogic 的 Godot runtime 都不是画布主数据格式。
- 不接受用户 JavaScript、CSS、GDScript、Ink 或 Skill 附带脚本执行。
- 不复用 Electron、Ace、Godot UI；StarCanvas 保持 Next.js、React Flow、结构化项目包。
- 不将分支叙事等同于生产分支：每个生产节点仍须保留 Provider、版本、资产、费用与审计信息。

## 目标模型

```text
NarrativeGraph (剧情节拍/条件/选择)
  -> ShotGraph (分镜/角色状态/镜头节拍)
  -> ProductionGraph (资产依赖/预检/队列)
  -> DeliveryGraph (成片/项目包/导出版本)
```

每条边都应能说明：源剧本段落、使用的角色参考、导演规则/Skill 摘要、生成请求、产物版本和失败原因。

## 与现有代码的衔接

- `apps/web/src/lib/storyboard/productionPreflight.ts`：已承担部分条件门控；扩展为节点级可跳转 issue。
- `apps/web/src/lib/storyboard/shotProductionBrief.ts`：已保存镜头、角色、白模预演 handoff；可作为 ShotGraph 编译产物。
- `apps/web/src/lib/workbench-kernel` 与 AgentNode runtime：已提供 run id、Crew trace、Local Skill audit；可作为 ProductionGraph 追溯信息。
- 项目 package/manifest：应保存 NarrativeGraph 的版本和从 narrative node 到 shot id 的映射，而不是只保存最终镜头。

## 实施顺序

1. **问题中心**：将 preflight/Provider/queue issue 统一为 `{ code, severity, nodeId, shotId, sourceRef, repairAction }`，点击定位画布节点。
2. **叙事节拍图**：以结构化节点保存场景、目标、冲突、转折、选择与条件；不运行用户代码。
3. **状态连续性**：角色状态、服装、道具、地点、时间、情绪从 narrative node 编译到 shot brief，显示冲突来源。
4. **局部重演**：变更 narrative/shot node 后只标记下游失效，用户确认后才重建受影响的 prompts、任务和交付包。
5. **路径预览**：只预览叙事/镜头数据，不调用 Provider；生成前仍走现有显式授权与预检。

## 采纳标准

新增能力必须：使用结构化数据、可从画布定位、可写入项目包、默认不消耗额度、不得扩大本地文件或网络权限，并至少具备 Node 单测与 mock E2E。
