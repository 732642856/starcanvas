import type { LocalSkillMetadata, LocalSkillRegistrySnapshot } from "./contracts.ts";
import { isLocalSkillContentInjectionEnabled, isLocalSkillRegistryEnabled, type LocalSkillEnvironment } from "./environment.ts";
import { LocalSkillSource } from "./local-skill-source.ts";

export type LocalSkillRegistryOptions = {
  source?: LocalSkillSource;
  environment?: LocalSkillEnvironment;
};

export class LocalSkillRegistry {
  private readonly source: LocalSkillSource;
  private readonly environment: LocalSkillEnvironment;
  private skillsById = new Map<string, LocalSkillMetadata>();

  constructor(options: LocalSkillRegistryOptions = {}) {
    this.source = options.source || new LocalSkillSource();
    this.environment = options.environment || process.env;
  }

  async snapshot(refresh = false): Promise<LocalSkillRegistrySnapshot> {
    if (!isLocalSkillRegistryEnabled(this.environment)) {
      return { enabled: false, contentInjectionEnabled: false, skills: [] };
    }
    if (refresh || this.skillsById.size === 0) {
      const skills = await this.source.index();
      this.skillsById = new Map(skills.map((skill) => [skill.skillId, skill]));
    }
    return {
      enabled: true,
      contentInjectionEnabled: isLocalSkillContentInjectionEnabled(this.environment),
      skills: this.list(),
    };
  }

  list(): LocalSkillMetadata[] {
    return [...this.skillsById.values()].sort((a, b) => a.skillId.localeCompare(b.skillId));
  }

  isContentInjectionEnabled(): boolean {
    return isLocalSkillContentInjectionEnabled(this.environment);
  }

  async getSelected(skillIds: string[]): Promise<LocalSkillMetadata[]> {
    await this.snapshot();
    const uniqueIds = [...new Set(skillIds)].slice(0, 8);
    return uniqueIds.flatMap((skillId) => {
      const skill = this.skillsById.get(skillId);
      return skill ? [skill] : [];
    });
  }

  async readContent(skill: LocalSkillMetadata, maxChars: number): Promise<string> {
    await this.snapshot();
    const indexed = this.skillsById.get(skill.skillId);
    if (!indexed) throw new Error(`Local Skill "${skill.skillId}" is not indexed.`);
    return this.source.readContent(indexed, maxChars);
  }
}

let defaultRegistry: LocalSkillRegistry | undefined;

export function getLocalSkillRegistry(): LocalSkillRegistry {
  defaultRegistry ||= new LocalSkillRegistry();
  return defaultRegistry;
}
