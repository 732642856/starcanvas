export type ImageGenerationJobStatus = "queued" | "running" | "completed" | "failed"

export type ImageGenerationJob = {
  id: string
  status: ImageGenerationJobStatus
  createdAt: string
  updatedAt: string
  requestId?: string
  result?: unknown
  error?: unknown
}

const jobs = new Map<string, ImageGenerationJob>()

function now() {
  return new Date().toISOString()
}

export function createImageGenerationJob(input: { requestId?: string }): ImageGenerationJob {
  const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const timestamp = now()
  const job: ImageGenerationJob = {
    id,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    requestId: input.requestId,
  }
  jobs.set(id, job)
  return job
}

export function getImageGenerationJob(id: string): ImageGenerationJob | undefined {
  return jobs.get(id)
}

export function markImageGenerationJobRunning(id: string) {
  const job = jobs.get(id)
  if (!job) return
  job.status = "running"
  job.updatedAt = now()
}

export function completeImageGenerationJob(id: string, result: unknown) {
  const job = jobs.get(id)
  if (!job) return
  job.status = "completed"
  job.result = result
  job.updatedAt = now()
}

export function failImageGenerationJob(id: string, error: unknown) {
  const job = jobs.get(id)
  if (!job) return
  job.status = "failed"
  job.error = error
  job.updatedAt = now()
}

export function resetImageGenerationJobsForTests() {
  jobs.clear()
}
