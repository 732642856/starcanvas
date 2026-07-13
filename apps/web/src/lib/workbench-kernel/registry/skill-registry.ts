import type {
  RoutingDecision,
  SkillDefinition,
  SkillRole,
} from "../contracts/registry.ts"
import type { RegistryPort } from "../ports/registry-port.ts"

export type SkillRegistryErrorCode =
  | "DUPLICATE_SKILL_VERSION"
  | "INVALID_VERSION"
  | "EMPTY_INTENTS"
  | "INVALID_PRIORITY"
  | "PRIMARY_CONFLICT"
  | "SELF_CONFLICT"
  | "NO_ROUTING_CANDIDATE"

export class SkillRegistryError extends Error {
  readonly code: SkillRegistryErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: SkillRegistryErrorCode, details?: Record<string, unknown>) {
    super(code)
    this.name = "SkillRegistryError"
    this.code = code
    this.details = details
  }
}

const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/

function compareSemver(left: string, right: string): number {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)

  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}

function compareSkills(left: SkillDefinition, right: SkillDefinition): number {
  const leftPrimary = left.role === "primary" ? 1 : 0
  const rightPrimary = right.role === "primary" ? 1 : 0
  return rightPrimary - leftPrimary
    || right.routing.priority - left.routing.priority
    || left.id.localeCompare(right.id)
    || compareSemver(right.version, left.version)
}

export class SkillRegistry implements RegistryPort {
  private readonly skills: SkillDefinition[] = []

  constructor(skills: SkillDefinition[] = []) {
    for (const skill of skills) this.register(skill)
  }

  register(skill: SkillDefinition): void {
    if (this.skills.some((registered) =>
      registered.id === skill.id && registered.version === skill.version)) {
      throw new SkillRegistryError("DUPLICATE_SKILL_VERSION")
    }
    if (!semverPattern.test(skill.version)) {
      throw new SkillRegistryError("INVALID_VERSION")
    }
    if (skill.intents.length === 0) {
      throw new SkillRegistryError("EMPTY_INTENTS")
    }
    if (!Number.isInteger(skill.routing.priority)) {
      throw new SkillRegistryError("INVALID_PRIORITY")
    }
    if (skill.routing.conflictsWith?.includes(skill.id)) {
      throw new SkillRegistryError("SELF_CONFLICT")
    }
    if (skill.role === "primary" && this.skills.some((registered) =>
      registered.role === "primary"
      && registered.id !== skill.id
      && registered.intents.some((intent) => skill.intents.includes(intent)))) {
      throw new SkillRegistryError("PRIMARY_CONFLICT")
    }

    this.skills.push(skill)
  }

  getSkill(skillId: string, version?: string): SkillDefinition | null {
    const matches = this.skills.filter((skill) =>
      skill.id === skillId && (version === undefined || skill.version === version))
    if (matches.length === 0) return null
    if (version !== undefined) return matches[0]
    return matches.sort((left, right) => compareSemver(right.version, left.version))[0]
  }

  listSkills(filter: {
    domain?: string
    intent?: string
    role?: SkillRole
  } = {}): SkillDefinition[] {
    return this.skills
      .filter((skill) =>
        (filter.domain === undefined || skill.domains.includes(filter.domain))
        && (filter.intent === undefined || skill.intents.includes(filter.intent))
        && (filter.role === undefined || skill.role === filter.role))
      .sort(compareSkills)
  }

  routeIntent(
    intent: { type: string },
    context: { allowedDomains?: string[]; excludedSkillIds?: string[] },
  ): RoutingDecision {
    const excludedSkillIds = new Set(context.excludedSkillIds)
    const candidates = this.skills
      .filter((skill) =>
        skill.intents.includes(intent.type)
        && !excludedSkillIds.has(skill.id)
        && (context.allowedDomains === undefined
          || skill.domains.some((domain) => context.allowedDomains?.includes(domain))))
      .sort(compareSkills)

    const skill = candidates[0]
    if (skill === undefined) {
      throw new SkillRegistryError("NO_ROUTING_CANDIDATE", { intent: intent.type })
    }

    return {
      skill,
      reason: skill.role === "primary" ? "primary-match" : "specialist-match",
      candidates: candidates.map((candidate) => candidate.id),
    }
  }
}
