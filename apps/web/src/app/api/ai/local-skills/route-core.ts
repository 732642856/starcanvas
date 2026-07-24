import type { LocalSkillRegistrySnapshot } from "../../../../lib/local-skills/contracts.ts";
import { canServeLocalSkillRequest, type LocalSkillEnvironment } from "../../../../lib/local-skills/environment.ts";

export type LocalSkillRegistryPort = {
  snapshot(refresh?: boolean): Promise<LocalSkillRegistrySnapshot>;
};

export async function getLocalSkillsResponse({
  host,
  registry,
  environment = process.env,
}: {
  host: string | null;
  registry: LocalSkillRegistryPort;
  environment?: LocalSkillEnvironment;
}): Promise<{ status: number; body: LocalSkillRegistrySnapshot | { error: string } }> {
  if (!canServeLocalSkillRequest(host, environment)) {
    return {
      status: 403,
      body: { error: "Local Skill Registry is available only to an enabled loopback deployment." },
    };
  }
  return { status: 200, body: await registry.snapshot(true) };
}
