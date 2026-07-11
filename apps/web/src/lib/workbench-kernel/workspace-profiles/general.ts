import type { WorkspaceProfile } from "../contracts/workspace.ts"

export const GENERAL_WORKSPACE_PROFILE: WorkspaceProfile = Object.freeze({
  id: "general" as const,
  title: "星轨画布",
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
    "general",
    "research",
    "finance",
  ]),
  panels: Object.freeze(["properties", "bible", "timeline", "assets"]),
  commands: Object.freeze(["add-node", "run-all", "export"]),
  layoutStoragePrefix: "ws:general:lay",
  historyStoragePrefix: "ws:general:his",
  snapshotStoragePrefix: "ws:general:snap",
})
