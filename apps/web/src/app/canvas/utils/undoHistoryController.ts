export interface UndoSnapshot<TNode = unknown, TEdge = unknown> {
  nodes: TNode[]
  edges: TEdge[]
}

interface TimerApi {
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
}

export interface UndoHistoryController<TNode = unknown, TEdge = unknown> {
  push: (entry: UndoSnapshot<TNode, TEdge>, actionType?: string) => void
  undo: (current?: UndoSnapshot<TNode, TEdge>) => UndoSnapshot<TNode, TEdge> | undefined
  redo: (current?: UndoSnapshot<TNode, TEdge>) => UndoSnapshot<TNode, TEdge> | undefined
  dispose: () => void
}

const DEFAULT_MAX_UNDO = 50
const DEFAULT_DEBOUNCE_MS = 300

export function createUndoHistoryController<TNode = unknown, TEdge = unknown>(
  timerApi: Partial<TimerApi> = {},
  options: { maxUndo?: number; debounceMs?: number } = {},
): UndoHistoryController<TNode, TEdge> {
  const undoStack: Array<UndoSnapshot<TNode, TEdge>> = []
  const redoStack: Array<UndoSnapshot<TNode, TEdge>> = []
  const maxUndo = options.maxUndo ?? DEFAULT_MAX_UNDO
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const setTimer = timerApi.setTimeout ?? setTimeout
  const clearTimer = timerApi.clearTimeout ?? clearTimeout
  let undoTimer: ReturnType<typeof setTimeout> | undefined
  let lastUndoActionType: string | undefined

  function clearDebounceTimer() {
    if (!undoTimer) return
    clearTimer(undoTimer)
    undoTimer = undefined
  }

  return {
    push(entry, actionType) {
      if (actionType !== "move" && undoTimer && lastUndoActionType === actionType && actionType) {
        return
      }
      clearDebounceTimer()
      undoTimer = setTimer(() => {
        undoTimer = undefined
      }, debounceMs)
      lastUndoActionType = actionType

      undoStack.push(entry)
      if (undoStack.length > maxUndo) undoStack.shift()
      redoStack.length = 0
    },
    undo(current) {
      const entry = undoStack.pop()
      if (!entry) return undefined
      if (current) redoStack.push(current)
      return entry
    },
    redo(current) {
      const entry = redoStack.pop()
      if (!entry) return undefined
      if (current) undoStack.push(current)
      return entry
    },
    dispose() {
      clearDebounceTimer()
      undoStack.length = 0
      redoStack.length = 0
      lastUndoActionType = undefined
    },
  }
}
