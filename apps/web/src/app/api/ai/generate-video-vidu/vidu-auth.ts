export const DASHSCOPE_VIDEO_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

export type ViduAuthProvider = {
  apiKey?: string;
  baseUrl?: string;
};

export type ViduAuthResolution = {
  apiKey: string;
  baseUrl: string;
  source: "session" | "provider";
};

export function resolveViduAuth(input: {
  sessionApiKey?: string;
  provider?: ViduAuthProvider | null;
}): ViduAuthResolution | null {
  const sessionApiKey = input.sessionApiKey?.trim();
  if (sessionApiKey) {
    return {
      apiKey: sessionApiKey,
      baseUrl: DASHSCOPE_VIDEO_BASE_URL,
      source: "session",
    };
  }

  const providerApiKey = input.provider?.apiKey?.trim();
  if (!providerApiKey) return null;

  return {
    apiKey: providerApiKey,
    baseUrl: input.provider?.baseUrl || DASHSCOPE_VIDEO_BASE_URL,
    source: "provider",
  };
}
