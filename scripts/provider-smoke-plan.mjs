export const SMOKE_CHECKS = [
  { id: "text", label: "文本 / 剧本" },
  { id: "image", label: "图片生成" },
  { id: "video", label: "视频生成" },
  { id: "tts", label: "配音" },
];

export const SMOKE_ENV_KEYS = [
  "STARCANVAS_REAL_PROVIDER_SMOKE",
  "STARCANVAS_REAL_IMAGE_SMOKE",
  "STARCANVAS_REAL_VIDEO_SMOKE",
  "STARCANVAS_REAL_TTS_SMOKE",
  "STARCANVAS_REAL_IMAGE_SMOKE_TIMEOUT_MS",
  "STARCANVAS_REAL_VIDEO_SMOKE_TIMEOUT_MS",
  "STARCANVAS_REAL_TTS_SMOKE_TIMEOUT_MS",
  "VOXCPM_BASE_URL",
];

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseProviderSmokeEnvFile(content) {
  const parsed = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (!SMOKE_ENV_KEYS.includes(key)) continue;
    parsed[key] = stripQuotes(trimmed.slice(index + 1));
  }
  return parsed;
}

export function buildProviderSmokeEnv(processEnv = {}, fileEnv = {}) {
  const env = {};
  for (const key of SMOKE_ENV_KEYS) {
    const value = processEnv[key] ?? fileEnv[key];
    if (value !== undefined) env[key] = String(value);
  }
  return env;
}

function isEnabled(value) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function hasDashScopeVideoProvider(config) {
  return Boolean(
    config?.providers?.some((provider) => {
      const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
      const isDashScope =
        provider.id === "dashscope" ||
        /dashscope|百炼/i.test(provider.name || "");
      return Boolean(provider.hasApiKey) && isDashScope && capabilities.includes("video");
    }),
  );
}

function makeCheck(id, status, reason, action) {
  const label = SMOKE_CHECKS.find((check) => check.id === id)?.label || id;
  return { id, label, status, reason, action };
}

export function buildProviderSmokePlan({ config, env = {} }) {
  const generalOptIn = isEnabled(env.STARCANVAS_REAL_PROVIDER_SMOKE);
  const imageOptIn = generalOptIn && isEnabled(env.STARCANVAS_REAL_IMAGE_SMOKE);
  const videoOptIn = generalOptIn && isEnabled(env.STARCANVAS_REAL_VIDEO_SMOKE);
  const ttsOptIn = generalOptIn && isEnabled(env.STARCANVAS_REAL_TTS_SMOKE);

  const checks = [];

  if (!config?.hasApiKey || !config?.baseUrl || !config?.defaultModel) {
    checks.push(makeCheck("text", "blocked", "缺少服务端文本 provider 配置或 API Key，无法验证真实聊天/剧本链路。"));
  } else if (!generalOptIn) {
    checks.push(makeCheck("text", "skipped", "未设置 STARCANVAS_REAL_PROVIDER_SMOKE=1，跳过真实文本请求以避免误用额度。"));
  } else {
    checks.push(makeCheck("text", "runnable", `将调用 /api/ai/health 验证 ${config.defaultModel}。`, "health"));
  }

  if (!config?.hasApiKey || !config?.defaultImageModel) {
    checks.push(makeCheck("image", "blocked", "缺少图片 provider 配置、图片模型或 API Key，无法验证真实生图链路。"));
  } else if (!imageOptIn) {
    checks.push(makeCheck("image", "skipped", "未同时设置 STARCANVAS_REAL_PROVIDER_SMOKE=1 和 STARCANVAS_REAL_IMAGE_SMOKE=1，跳过真实生图请求。"));
  } else {
    checks.push(makeCheck("image", "runnable", `将调用 /api/ai/generate-image 验证 ${config.defaultImageModel}。`, "image"));
  }

  if (!config?.videoModel) {
    checks.push(makeCheck("video", "blocked", "未配置视频模型，无法验证真实视频链路。"));
  } else if (!hasDashScopeVideoProvider(config)) {
    checks.push(makeCheck("video", "blocked", "缺少带 API Key 的 DashScope 视频 provider，Vidu 真实生成无法运行。"));
  } else if (!videoOptIn) {
    checks.push(makeCheck("video", "skipped", "未同时设置 STARCANVAS_REAL_PROVIDER_SMOKE=1 和 STARCANVAS_REAL_VIDEO_SMOKE=1，跳过真实视频请求。"));
  } else {
    checks.push(makeCheck("video", "runnable", `将调用 /api/ai/generate-video-vidu 验证 ${config.videoModel}。`, "video"));
  }

  if (!env.VOXCPM_BASE_URL) {
    checks.push(makeCheck("tts", "skipped", "未配置 VOXCPM_BASE_URL；浏览器 Kokoro TTS 不需要服务端 smoke，VoxCPM 真实 TTS 跳过。"));
  } else if (!ttsOptIn) {
    checks.push(makeCheck("tts", "skipped", "未同时设置 STARCANVAS_REAL_PROVIDER_SMOKE=1 和 STARCANVAS_REAL_TTS_SMOKE=1，跳过 VoxCPM 真实 TTS 请求。"));
  } else {
    checks.push(makeCheck("tts", "runnable", "将调用 /api/ai/tts 验证 VoxCPM 服务端 TTS。", "tts"));
  }

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { runnable: 0, skipped: 0, blocked: 0 },
  );

  return { checks, summary };
}
