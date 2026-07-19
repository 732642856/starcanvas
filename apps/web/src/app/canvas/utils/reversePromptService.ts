import { assetUrlToDataUrl } from "./providerMediaDataUrl.ts";

type ImageUrlToBase64Fn = (imageUrl: string, assetId?: string) => Promise<string>;

export type ReversePromptResult = {
  prompt: string;
  negativePrompt?: string;
  qualityScore?: number;
  language?: "en" | "zh" | "mixed";
  raw?: string;
};

export type ReversePromptMessage = {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } }
      >;
};

type ReverseImagePromptDeps = {
  imageUrlToBase64Fn?: ImageUrlToBase64Fn;
  fetchImpl?: typeof fetch;
};

export const REVERSE_PROMPT_SYSTEM_PROMPT = [
  "You are a senior cinematic prompt engineer and image captioning analyst.",
  "Reverse-engineer the visual into a production-ready image generation prompt.",
  "Follow this role discipline inspired by curated ChatGPT role prompts: stay in character, be specific, and optimize for direct downstream use.",
  "Output ONLY valid JSON with keys: prompt, negativePrompt, qualityScore, language.",
  "The prompt must be English, under 200 words, and cover subject, composition, lighting, lens/camera, mood, color palette, style, and technical quality terms.",
  "negativePrompt should list defects to avoid, not moral or safety commentary.",
  "qualityScore must be a number from 0 to 1 estimating how complete the visual evidence is.",
].join("\n");

export function buildReversePromptMessages(imageUrl: string): ReversePromptMessage[] {
  return [
    {
      role: "system",
      content: REVERSE_PROMPT_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Analyze the image and return the JSON reverse prompt now.",
        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: "high",
          },
        },
      ],
    },
  ];
}

function stripFences(value: string): string {
  return value.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function clampQualityScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

export function cleanReversePromptOutput(raw: string): ReversePromptResult {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  const maybeJson =
    jsonStart >= 0 && jsonEnd > jsonStart
      ? trimmed.slice(jsonStart, jsonEnd + 1)
      : stripFences(trimmed);

  try {
    const parsed = JSON.parse(stripFences(maybeJson)) as Record<string, unknown>;
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    if (prompt) {
      const negativePrompt =
        typeof parsed.negativePrompt === "string" ? parsed.negativePrompt.trim() : undefined;
      const language = parsed.language === "zh" || parsed.language === "mixed" ? parsed.language : "en";
      return {
        prompt,
        negativePrompt: negativePrompt || undefined,
        qualityScore: clampQualityScore(parsed.qualityScore),
        language,
        raw,
      };
    }
  } catch {
    // Fall through to plain-text cleanup.
  }

  const prompt = stripFences(trimmed)
    .replace(/^sure,?\s+here(?:'s| is)\s+the\s+prompt:?\s*/i, "")
    .replace(/^prompt:\s*/i, "")
    .trim();

  return {
    prompt,
    language: /[\u4e00-\u9fff]/.test(prompt) ? "mixed" : "en",
    raw,
  };
}

async function defaultImageUrlToBase64(imageUrl: string, assetId?: string): Promise<string> {
  return assetUrlToDataUrl(imageUrl, { assetId, mediaKind: "image" });
}

export async function reverseImagePrompt(
  input: { imageUrl: string; assetId?: string },
  deps: ReverseImagePromptDeps = {},
): Promise<ReversePromptResult> {
  if (!input.imageUrl?.trim()) {
    throw new Error("反推提示词缺少源图片。");
  }

  const imageUrlToBase64Fn = deps.imageUrlToBase64Fn ?? defaultImageUrlToBase64;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const dataUrl = await imageUrlToBase64Fn(input.imageUrl, input.assetId);

  const response = await fetchImpl("/api/ai/reverse-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: dataUrl,
      assetId: input.assetId,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "反推提示词失败";
    throw new Error(message);
  }

  if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
    throw new Error("反推提示词返回为空。");
  }

  const result: ReversePromptResult = {
    prompt: payload.prompt.trim(),
    negativePrompt: typeof payload.negativePrompt === "string" ? payload.negativePrompt.trim() : undefined,
    qualityScore: clampQualityScore(payload.qualityScore),
    language: payload.language === "zh" || payload.language === "mixed" ? payload.language : "en",
  };
  if (typeof payload.raw === "string") result.raw = payload.raw;
  return result;
}
