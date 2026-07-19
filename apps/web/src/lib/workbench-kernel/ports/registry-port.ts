import type {
  RoutingDecision,
  SkillDefinition,
  SkillRole,
} from "../contracts/registry.ts"

export interface RegistryPort {
  getSkill(skillId: string, version?: string): SkillDefinition | null
  listSkills(filter?: {
    domain?: string
    intent?: string
    role?: SkillRole
  }): SkillDefinition[]
  routeIntent(
    intent: { type: string },
    context: { allowedDomains?: string[]; excludedSkillIds?: string[] },
  ): RoutingDecision
}
