// ============================================================================
// Canvas Page - Entry point for the StarTrails Canvas
// rc.2b: reads projectId from URL searchParams for project-level canvas isolation
// ============================================================================
"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import StarCanvas from "./StarCanvas"
import { CanvasRuntimeErrorBoundary } from "./components/canvas/CanvasRuntimeErrorBoundary"

function CanvasPageInner() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId") || undefined

  return (
    <CanvasRuntimeErrorBoundary>
      <StarCanvas projectId={projectId} />
    </CanvasRuntimeErrorBoundary>
  )
}

export default function CanvasPage() {
  return (
    <Suspense fallback={null}>
      <CanvasPageInner />
    </Suspense>
  )
}
