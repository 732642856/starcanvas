import type { WorkspaceProfile } from "../contracts/workspace.ts"

export const DIRECTOR_WORKSPACE_PROFILE: WorkspaceProfile = Object.freeze({
  id: "director" as const,
  title: "导演组画布",
  allowedNodeKinds: Object.freeze([
    "asset",
    "skill",
    "department",
    "review",
    "workflow",
    "delivery",
  ]),
  allowedSkillDomains: Object.freeze([
    "film",
    "storyboard",
    "writing",
  ]),
  panels: Object.freeze([
    "department",
    "shot-list",
    "storyboard",
    "review",
  ]),
  commands: Object.freeze([
    "add-scene",
    "run-department",
    "approve",
    "export-draft",
  ]),
  defaultWorkflowId: "film-crew-pipeline",
  layoutStoragePrefix: "ws:director:lay",
  historyStoragePrefix: "ws:director:his",
  snapshotStoragePrefix: "ws:director:snap",
})
