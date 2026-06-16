# Contributing to StarCanvas（星轨画布）

感谢你考虑为 StarCanvas 贡献代码！本文档指导你如何参与项目。

## 开发环境

- **Node.js**: >= 22（推荐使用 `.nvmrc` 中的版本）
- **包管理器**: pnpm 10.x（`npm install -g pnpm@10`）
- **系统**: macOS / Linux（Windows 可能遇到路径问题）

## 快速开始

```bash
git clone https://github.com/732642856/starcanvas.git
cd starcanvas
pnpm install
cp apps/web/.env.example apps/web/.env.local
# 编辑 apps/web/.env.local 填写 AI Provider 配置
pnpm dev
```

## 代码规范

### 技术栈

- **框架**: Next.js 16 App Router + React 19
- **画布**: @xyflow/react v12
- **状态管理**: Zustand v5
- **样式**: Tailwind CSS v4（内联 `@theme` 配置）
- **构建**: Turborepo + pnpm workspace

### 编码原则

1. **不要重复造轮子** — 修改前先搜索项目中是否已有类似实现
2. **不要修改 `apps/api` 和 `packages/`** — 除非明确指示，这些目录是实验性的
3. **不要使用 `any` 类型** — 优先使用具体类型或 `unknown`
4. **功能性 State 更新** — 操作 React Flow 节点必须使用 `setNodes` 的函数式回调
5. **服务端 API 路由** — 必须使用 `src/lib/ai/server-fetch.ts` 中的 `fetchWithTimeout`
6. **不做空 `catch`** — 每个 `catch` 块必须记录或处理错误

### 节点类型添加流程

1. 在 `types.ts` 中添加节点类型到 `NodeType` 联合类型
2. 添加 `nodeKind` 到 `CanvasNodeKind`
3. 在 `nodeToneStyles` 中添加颜色
4. 在 `components/nodes/` 创建节点组件
5. 在 `StarCanvas.tsx` 的 `nodeTypes` 中注册
6. 如果节点需要工作流执行，在 `useWorkflowRunner.ts` 的 `executeStep` 中添加处理

### 提交规范

```
type(scope): description
```

**type**: feat | fix | refactor | chore | docs  
**scope**: agent | workflow | image | canvas | ui | storyboard | api

示例：
- `feat(workflow): add shot continuity guard`
- `fix(ui): correct character panel group-hover`
- `docs(readme): update quick start guide`

## 测试

```bash
# 运行所有测试
pnpm --filter web test

# 类型检查
pnpm --filter web exec tsc --noEmit

# 运行单个测试文件
pnpm -C apps/web exec node --test --experimental-strip-types src/path/to/file.test.ts
```

当前测试基线：**554 个测试**。

## PR 流程

1. Fork 仓库
2. 从 `main` 创建分支
3. 提交改动（遵循提交规范）
4. 确保 CI 通过（lint + typecheck + test + build）
5. 创建 Pull Request 描述改了什么、为什么

## 架构概览

```
apps/web/              # Next.js 前端主应用
  src/app/canvas/      # 画布核心（StarCanvas.tsx）
  src/app/canvas/hooks/         # React Hooks
  src/app/canvas/utils/         # 工具函数
  src/app/canvas/stores/        # Zustand stores
  src/app/canvas/components/    # React 组件
  src/app/api/ai/               # API 路由（20 个端点）
  src/lib/                      # 共享工具库
apps/api/          # NestJS 后端（实验性）
packages/          # 共享包（多数为空壳）
docs/              # 文档和审计报告
scripts/           # CLI 和审计工具
```

## 许可证

MIT License。详见 [LICENSE](./LICENSE)。
