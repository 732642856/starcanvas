"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

interface CanvasRuntimeErrorBoundaryProps {
  children: ReactNode
}

interface CanvasRuntimeErrorBoundaryState {
  error: Error | null
  resetKey: number
}

export class CanvasRuntimeErrorBoundary extends Component<
  CanvasRuntimeErrorBoundaryProps,
  CanvasRuntimeErrorBoundaryState
> {
  state: CanvasRuntimeErrorBoundaryState = {
    error: null,
    resetKey: 0,
  }

  static getDerivedStateFromError(error: Error): Partial<CanvasRuntimeErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[StarCanvas] Runtime component error", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  private retry = () => {
    this.setState((state) => ({
      error: null,
      resetKey: state.resetKey + 1,
    }))
  }

  render() {
    if (!this.state.error) {
      return <div key={this.state.resetKey}>{this.props.children}</div>
    }

    return (
      <main
        className="flex min-h-screen items-center justify-center px-6"
        style={{ background: "#05060a", color: "rgba(255,255,255,0.92)" }}
      >
        <section
          className="w-full max-w-xl rounded-[28px] border p-7 shadow-2xl"
          style={{
            background: "rgba(18,18,24,0.92)",
            borderColor: "rgba(255,255,255,0.1)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
          }}
          data-testid="starcanvas-runtime-error"
        >
          <div
            className="inline-flex rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: "rgba(251,113,133,0.12)", color: "#fecdd3" }}
          >
            Canvas Runtime Boundary
          </div>
          <h1 className="mt-5 text-2xl font-semibold">画布组件运行异常，已由局部兜底接管</h1>
          <p className="mt-3 text-sm leading-7" style={{ color: "rgba(255,255,255,0.62)" }}>
            这通常来自某个面板或节点组件的渲染异常。可以先重试画布组件；若仍失败，再刷新页面或清理本地缓存。
          </p>
          <pre
            className="mt-5 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl p-4 text-xs leading-6"
            style={{ background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.76)" }}
          >
            {this.state.error.message || "未知错误"}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.retry}
              className="rounded-full px-4 py-2 text-sm font-bold"
              style={{ background: "#f59e0b", color: "#111827" }}
            >
              重试画布组件
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full border px-4 py-2 text-sm"
              style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.78)" }}
            >
              刷新页面
            </button>
          </div>
        </section>
      </main>
    )
  }
}
