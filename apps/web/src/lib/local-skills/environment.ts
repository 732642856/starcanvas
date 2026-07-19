export type LocalSkillEnvironment = Record<string, string | undefined>;

export function isLocalSkillRegistryEnabled(env: LocalSkillEnvironment = process.env): boolean {
  if (env.STARCANVAS_LOCAL_SKILL_REGISTRY !== "1") return false;
  if (env.STARCANVAS_CLOUD_DEPLOYMENT === "1") return false;

  return env.NODE_ENV === "development" || env.STARCANVAS_DESKTOP_LOCAL === "1";
}

export function isLocalSkillContentInjectionEnabled(env: LocalSkillEnvironment = process.env): boolean {
  return isLocalSkillRegistryEnabled(env)
    && env.STARCANVAS_LOCAL_SKILL_CONTENT_INJECTION === "1";
}

export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost"
    || normalized.startsWith("localhost:")
    || normalized === "127.0.0.1"
    || normalized.startsWith("127.0.0.1:")
    || normalized === "[::1]"
    || normalized.startsWith("[::1]:");
}

export function canServeLocalSkillRequest(
  host: string | null,
  env: LocalSkillEnvironment = process.env,
): boolean {
  return isLocalSkillRegistryEnabled(env) && isLoopbackHost(host);
}
