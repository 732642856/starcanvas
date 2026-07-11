export type SkillLayer = "L0" | "L1" | "L2" | "L3"

export type SkillRole =
  | "primary"
  | "specialist"
  | "critic"
  | "transformer"
  | "executor"
  | "adapter"

export interface SkillDefinition {
  id: string
  version: string
  name: string
  layer: SkillLayer
  role: SkillRole
  domains: readonly string[]
  intents: readonly string[]
  inputSchema: string
  outputSchema: string
  execution: {
    type: "prompt" | "script" | "mcp" | "plugin" | "hybrid"
    entrypoint: string
  }
  routing: {
    priority: number
    requiredContext: readonly string[]
    conflictsWith?: readonly string[]
    composesWith?: readonly string[]
  }
  quality: {
    contractTests: readonly string[]
    examples: readonly string[]
    regressionSet: string
  }
}

export interface RoutingDecision {
  skill: SkillDefinition
  reason: "explicit" | "primary-match" | "specialist-match"
  candidates: string[]
}
