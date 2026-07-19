export const LOCAL_SKILL_SOURCE_IDS = ["codex", "agents", "workbuddy"] as const;

export type LocalSkillSourceId = typeof LOCAL_SKILL_SOURCE_IDS[number];
export type LocalSkillInjectionMode = "metadata" | "content";
export type LocalSkillRiskFlag = "prompt-injection-pattern" | "sensitive-access-pattern";

export type LocalSkillMetadata = {
  skillId: string;
  name: string;
  description: string;
  source: LocalSkillSourceId;
  relativePath: string;
  tags: string[];
  updatedAt: string;
  updatedAtMs: number;
  sizeBytes: number;
  contentHash: string;
  riskFlags: LocalSkillRiskFlag[];
};

export type LocalSkillAuditRecord = {
  skillId: string;
  source: LocalSkillSourceId;
  contentHash: string;
  injection: LocalSkillInjectionMode;
  modelContextSent: boolean;
  skillBodySent: boolean;
  truncated: boolean;
  riskFlags: LocalSkillRiskFlag[];
};

export type LocalSkillContext = {
  prompt: string;
  audit: LocalSkillAuditRecord[];
};

export type LocalSkillRegistrySnapshot = {
  enabled: boolean;
  contentInjectionEnabled: boolean;
  skills: LocalSkillMetadata[];
};
