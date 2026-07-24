export type ProductionTaskState =
  | "QUEUED"
  | "SUBMITTING"
  | "POLLING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"

const allowedTransitions: Record<ProductionTaskState, ProductionTaskState[]> = {
  QUEUED: ["SUBMITTING", "CANCELED"],
  SUBMITTING: ["POLLING", "FAILED", "CANCELED"],
  POLLING: ["COMPLETED", "FAILED", "CANCELED"],
  COMPLETED: [],
  FAILED: ["QUEUED", "CANCELED"],
  CANCELED: [],
}

export function assertProductionTaskTransition(from: ProductionTaskState, to: ProductionTaskState) {
  if (!allowedTransitions[from]?.includes(to)) {
    throw new Error(`Invalid production task transition: ${from} -> ${to}`)
  }
}
