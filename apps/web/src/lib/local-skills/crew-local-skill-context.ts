import type { LocalSkillAuditRecord } from "./contracts.ts";
import { canServeLocalSkillRequest, type LocalSkillEnvironment } from "./environment.ts";
import { buildLocalSkillContext } from "./local-skill-context.ts";
import type { LocalSkillRegistry } from "./local-skill-registry.ts";

export type CrewLocalSkillResolution = {
  prompt: string;
  audit: LocalSkillAuditRecord[];
};

export function normalizeCrewLocalSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && /^local:(codex|agents|workbuddy):[^/\\]+(?:\/[^/\\]+)*$/.test(item)))].slice(0, 8);
}

export async function resolveCrewLocalSkillContext({
  skillIds,
  includeContent,
  host,
  registry,
  environment = process.env,
}: {
  skillIds: string[];
  includeContent: boolean;
  host: string | null;
  registry: LocalSkillRegistry;
  environment?: LocalSkillEnvironment;
}): Promise<CrewLocalSkillResolution> {
  if (skillIds.length === 0) return { prompt: "", audit: [] };
  if (!canServeLocalSkillRequest(host, environment)) {
    throw new Error("Local Skill selections are available only to an enabled loopback deployment.");
  }
  const snapshot = await registry.snapshot();
  if (!snapshot.enabled) {
    throw new Error("Local Skill Registry is disabled.");
  }
  return buildLocalSkillContext({
    registry,
    selectedSkillIds: skillIds,
    includeContent,
  });
}
