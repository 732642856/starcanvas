// ============================================================================
// Canvas Page - Entry point for the StarTrails Canvas
// rc.2b: reads projectId from URL searchParams for project-level canvas isolation
// ============================================================================
"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import StarCanvas from "./StarCanvas"

function CanvasPageInner() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId") || undefined

  return <StarCanvas projectId={projectId} />
}

export default function CanvasPage() {
  return (
    <Suspense fallback={null}>
      <CanvasPageInner />
    </Suspense>
  )
}
