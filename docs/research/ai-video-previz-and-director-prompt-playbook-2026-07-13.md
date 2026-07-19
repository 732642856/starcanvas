# AI 视频预演与导演提示词：可落地研究

## 结论

高质量 AI 视频不是“长剧本 + 一次生成”。稳定路径是：

`剧本意图 -> 单镜头拆解 -> 白模/pose/depth 预演 -> 人物关键帧 -> I2V 动作与运镜 -> 任务回收 -> 合成/交付`

白模预演用于锁定人物站位、视线、道具接触、景别、机位与运镜路径；不要把灰白画风直接当成最终视觉参考。最终 I2V 同时使用角色关键帧和白模导出的 pose/depth 控制图，分别解决“是谁”和“怎么动/镜头怎么走”。

## 官方规则

- 阿里万相：T2V 用 `主体 + 场景 + 运动`；精细控制增加美学/风格。I2V 图像已确定主体与画风，prompt 应收敛为 `运动 + 运镜`。多镜头需明确镜头序号/时间段；若要避免模型自行切镜，明确单镜头。[文生视频/图生视频 Prompt 指南](https://help.aliyun.com/zh/model-studio/text-to-video-prompt)
- 异步视频必须保存 `task_id`，避免重复创建任务；结果链接及 task 查询有效期有限，应立即回收。这与 StarCanvas 的 Vidu 恢复链直接相关。[万相视频 API](https://help.aliyun.com/zh/model-studio/text-to-video-api-reference)
- ComfyUI 官方 Pose ControlNet 说明：OpenPose skeleton 可作为条件输入，精确约束姿态、动作、表情；两阶段生成先满足结构，再优化画风与细节。[ComfyUI Pose ControlNet 2-pass](https://docs.comfy.org/tutorials/controlnet/pose-controlnet-2-pass)
- ControlNet 的核心价值是向生成过程加入明确控制条件，而不是再堆风格词。[ControlNet](https://github.com/lllyasviel/ControlNet)
- HunyuanVideo 开源链已提供 I2V、角色定制和 ComfyUI wrapper 等路线，但模型/显存/工作流运维成本高，不应作为个人版默认依赖。[HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo)

## 单镜头导演模板

### 文生视频

`主体身份/外观 + 场景空间 + 一个主要动作（起点->终点->可见结果） + 景别/角度 + 一个运镜 + 光线/氛围 + 声音约束`

### 图生视频

`生成单镜头。保持参考帧人物身份、服装、道具、空间布局、光线不变。主动作：...。运镜：...。不要切镜、不要新增人物、不要换装/换景、不要添加第二动作节拍。`

## 白模进入生产的字段

| 白模输出 | 进入模型的控制 | 解决的问题 |
|---|---|---|
| 人物骨架/关键 pose | OpenPose / Pose Control | 肢体畸形、道具接触、动作方向 |
| 灰模深度图 | Depth Control | 机位、前后景、空间尺度 |
| 机位路径 | camera movement 字段 | 推拉摇移与主体运动冲突 |
| 道具碰撞/交接点 | primary action 文本 | 锅、刀、手等物理关系漂移 |
| 首尾关键帧 | I2V start/end frame | 转场、动作终点、跨镜头连续性 |

## 高发失败及处理

1. 一条 prompt 同时要跑、转身、打斗、推镜、摇镜、切镜：拆成单动作/单运镜镜头。
2. I2V 重复描述人物外貌/场景：改为保真约束，只写时间变化。
3. 手持道具/人物接触失真：先白模 pose，再生成关键帧，再进 I2V。
4. 人脸、服装、场景漂移：角色锚点 + 首帧约束；不要让不同角色 reference 混用。
5. 无端切镜：单镜头生成；多镜头仅在 Provider 明确支持时采用带时间戳脚本。
6. 视频已成功但前端超时/断连：保存 task ID、后台回收、立即下载结果。StarCanvas 已在 EL-091/099 覆盖。
7. 大素材浏览器合成中止：超过阈值转剪映交接，不在 wasm 强行渲染。见 EL-081/082。

## StarCanvas 当前落点

- 已有：shot 的 `description / visualPrompt / shotType / cameraMovement / duration`，角色三视图、I2V、队列、任务恢复、分镜 brief。
- 新增：`videoPromptDirector` 将现有字段编译成可执行 I2V prompt，并输出 pose/depth/白模建议。
- 连续动作：编译器只把第一个动作送入单镜头 I2V prompt；拆镜建议会进入 brief、生产预检和交付 manifest 的 `previsPlans[].splitShotRecommended`，避免导出后丢失。
- 尚缺：专用 Comfy provider、白模编辑器/pose/depth 导出、控制图上传、由队列自动消费控制图。这些必须在 endpoint 和 workflow 明确后再接入，不能假装当前可用。
