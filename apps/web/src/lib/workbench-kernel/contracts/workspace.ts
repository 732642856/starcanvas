/** Shared workspace profile contract — not coupled to React or ReactFlow. */

export interface WorkspaceProfile {
  readonly id: "general" | "director"
  readonly title: string
  readonly allowedNodeKinds: readonly string[]
  readonly allowedSkillDomains: readonly string[]
  readonly panels: readonly string[]
  readonly commands: readonly string[]
  readonly defaultWorkflowId?: string
  readonly layoutStoragePrefix: string
  readonly historyStoragePrefix: string
  readonly snapshotStoragePrefix: string
}

export interface WorkspaceProfileError extends Error {
  readonly name: "WorkspaceProfileError"
  readonly code: "UNKNOWN_PROFILE"
  readonly profileId: string
}
