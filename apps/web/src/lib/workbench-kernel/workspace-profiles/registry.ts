import type { WorkspaceProfile, WorkspaceProfileError } from "../contracts/workspace.ts"
import { GENERAL_WORKSPACE_PROFILE } from "./general.ts"
import { DIRECTOR_WORKSPACE_PROFILE } from "./director.ts"

export const PROFILES: readonly WorkspaceProfile[] = Object.freeze([
  GENERAL_WORKSPACE_PROFILE,
  DIRECTOR_WORKSPACE_PROFILE,
])

/**
 * Generate scoped storage keys for a given project+workspace pair.
 * Layout, history and snapshot are isolated per workspace.
 * The project asset namespace is shared across workspaces.
 */
export function getWorkspaceStorageKeys(
  projectId: string,
  profile: WorkspaceProfile,
): {
  readonly layout: string
  readonly history: string
  readonly snapshot: string
  readonly projectAssetNamespace: string
} {
  if (!projectId || projectId.trim().length === 0) {
    throw Object.assign(
      new Error("projectId must be a non-empty string") as WorkspaceProfileError,
      {
        name: "WorkspaceProfileError" as const,
        code: "INVALID_PROJECT_ID" as const,
        profileId: "",
      },
    )
  }
  const safe = encodeURIComponent(projectId)
  return Object.freeze({
    layout: `${profile.layoutStoragePrefix}:${safe}`,
    history: `${profile.historyStoragePrefix}:${safe}`,
    snapshot: `${profile.snapshotStoragePrefix}:${safe}`,
    projectAssetNamespace: `startrails_project_assets:${safe}`,
  })
}

/**
 * Resolve a workspace profile by its string id.
 * Throws a structured WorkspaceProfileError when the id is unknown.
 */
export function resolveProfile(
  workspaceId: WorkspaceProfile["id"],
): WorkspaceProfile {
  const found = PROFILES.find((p) => p.id === workspaceId)
  if (!found) {
    const error = Object.assign(
      new Error(`Unknown workspace profile: "${workspaceId}"`) as WorkspaceProfileError,
      {
        name: "WorkspaceProfileError" as const,
        code: "UNKNOWN_PROFILE" as const,
        profileId: workspaceId,
      },
    )
    throw error
  }
  return found
}
