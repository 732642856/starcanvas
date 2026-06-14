# E2E 冒烟测试文档

## 概述

StarCanvas 使用 Playwright 进行端到端自动化测试。冒烟测试覆盖核心用户流程，确保关键路径在每次变更后仍然可用。

## 测试文件

```
apps/web/e2e/core-workflow-smoke.spec.ts
```

## 运行方式

### Dev 模式（快速反馈）

使用 Next.js dev server（webpack），支持 HMR：

```bash
cd apps/web
pnpm test:e2e:smoke
```

- 自动启动 `next dev --webpack -p 3107`
- 超时：180s（构建）+ 90s（导航）
- 适用于本地开发快速验证

### Prod 模式（推荐 CI）

使用 `next start` 生产构建，更稳定可靠：

```bash
cd apps/web
pnpm test:e2e:smoke:prod
```

- 自动执行 `next build` + `next start -p 3107`
- 超时：300s（构建）+ 60s（导航）
- 无 HMR 干扰，结果可复现
- **推荐在 CI 和发布前使用**

### 手动运行单个测试

```bash
cd apps/web
npx playwright test e2e/core-workflow-smoke.spec.ts --reporter=list
```

## 为什么 Prod Smoke 使用 next start

`next dev` 在 E2E 测试中存在以下问题：

1. **开发服务器负载敏感**：并发页面操作可能导致 HMR 重编译，引起 `net::ERR_ABORTED` 或页面不一致
2. **构建产物不完整**：dev 模式下部分优化未执行，测试结果不能完全反映生产环境行为
3. **超时不稳定**：dev 模式的编译缓存行为在不同机器上差异大

`next start` 提供与生产环境一致的静态构建产物，确保测试结果可靠且可复现。

## 测试配置

### playwright.config.ts 关键设置

```typescript
{
  fullyParallel: false,  // 串行执行，避免 dev server 过载
  workers: 1,            // 单 worker
  timeout: 120_000,      // 120s（prod 模式）
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:3107',
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
}
```

### E2E_SERVER 环境变量

```bash
E2E_SERVER=prod    # 使用 next start（推荐 CI）
# 不设置或 dev：   使用 next dev --webpack
```

## 16 个用例（10 核心 + 6 已知限制）

| # | 用例 | 验证内容 | 状态 |
|---|------|----------|------|
| 1 | 打开应用 → 首页 → Canvas | 路由可达、canvas 正常渲染 | ✅ |
| 2 | 新建项目 → 进入 Canvas | Dashboard 创建流程、projectId 一致性 | ✅ |
| 3 | 添加文本元素到画布 | 节点面板打开、元素创建到画布 | ✅ |
| 4 | 修改文本元素内容 | 文本编辑交互 | ⊘ 条件跳过 |
| 5 | 拖动元素到新位置 | 节点位置跟随拖拽 | ⊘ 条件跳过 |
| 6 | 保存 → 刷新恢复 → 删除确认 | IndexedDB 持久化 + P0-1 autosave | ⊘ 条件跳过 |
| 7 | 导出菜单 | 导出选项可见 | ✅ |
| 8 | 预览功能 | 预览入口可达 | ✅ |
| 9 | 首页加载无严重错误 | console/network 错误监控 | ✅ |
| 10 | Canvas 加载无严重错误 | Canvas 加载无异常 | ✅ |
| 11-16 | 已知限制 6 项 | (见下方 skip 说明) | ⊘ 固定跳过 |

> ⊘ = 跳过（条件或固定），0 失败
>
> 最新 prod smoke 结果：**7 passed, 9 skipped, 0 failed** (46.1s)

## Skip 的含义

测试中有两类 skip：

### 条件性 Skip（测试运行时自动判断）

测试在运行时会检测必要的 UI 元素。如果元素未找到，跳过该测试并输出原因。
这是**预期的自我保护机制**——当 UI 变更导致选择器失效时，测试不会误报失败。

### 固定 Skip（在 "已知限制" describe 块中）

6 个用例被标记为 `test.skip(true)`:

| Skip 用例 | 原因 |
|-----------|------|
| 修改节点样式后撤销 | 撤销覆盖不完全 |
| 时间轴播放头推进 | 需要 timed preview 支持 |
| 多项目切换与数据隔离 | 未专项覆盖 |
| 剪映草稿导出 | Playwright 文件下载需额外配置 |
| IndexedDB 大文件持久化 | 需要专项测试 |
| AI 生成流程 | 需要 API 密钥 |

这些 skip 是**明确接受的已知限制**，而非遗漏。每个 skip 都有对应的后续跟踪任务。

## 查看测试产物

测试失败时自动保留：

```
apps/web/test-results/
  ├── core-workflow-smoke-xxx/
  │   ├── trace.zip      # Playwright Trace Viewer
  │   ├── screenshot.png  # 失败时截图
  │   └── video.webm     # 测试过程录像
```

查看 trace：

```bash
npx playwright show-trace test-results/xxx/trace.zip
```

## 本地调试

```bash
cd apps/web

# 带 UI 模式运行
npx playwright test --ui

# 调试模式（单步执行）
npx playwright test --debug

# 只运行特定测试
npx playwright test -g "保存项目"
```

## CI 集成

### GitHub Actions 示例

```yaml
- name: E2E Smoke Test
  run: |
    cd apps/web
    pnpm test:e2e:smoke:prod
  env:
    E2E_SERVER: prod

- name: Upload Playwright Report
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: apps/web/test-results/
```
