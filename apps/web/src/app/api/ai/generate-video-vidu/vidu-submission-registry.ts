type ViduSubmissionRegistryOptions = {
  now?: () => number
  ttlMs?: number
}

type ViduSubmissionRecord = {
  taskId: string
  expiresAt: number
}

export function createViduSubmissionRegistry(options: ViduSubmissionRegistryOptions = {}) {
  const now = options.now ?? (() => Date.now())
  const ttlMs = options.ttlMs ?? 6 * 60 * 60 * 1000
  const records = new Map<string, ViduSubmissionRecord>()
  const inFlight = new Map<string, Promise<string>>()

  return {
    async getOrCreate(requestId: string | undefined, createTask: () => Promise<string>): Promise<string> {
      const key = requestId?.trim()
      if (!key) return createTask()

      const existing = records.get(key)
      if (existing && existing.expiresAt > now()) return existing.taskId
      if (existing) records.delete(key)

      const pending = inFlight.get(key)
      if (pending) return pending
      const submission = createTask()
        .then((taskId) => {
          records.set(key, { taskId, expiresAt: now() + ttlMs })
          return taskId
        })
        .finally(() => {
          inFlight.delete(key)
        })
      inFlight.set(key, submission)
      return submission
    },
  }
}
