// ============================================================================
// Image Prompt Reverser — 图片反推提示词 (P3-5A)
// 将图片 URL / data URL 发送到 AI，AI 分析图片内容并返回高质量的生图提示词。
// ============================================================================
"use client";

import { callAiChat } from "@/lib/ai/client";
import { assetUrlToDataUrl } from "./providerMediaDataUrl.ts";

/**
 * 将图片转换为适合 AI vision 的 base64 data URL。
 *
 * 如果提供了 assetId，优先从 IndexedDB 读取原始 blob（避免 blob URL 失效）；
 * 否则直接 fetch imageUrl。
 */
export async function imageUrlToBase64(
  imageUrl: string,
  assetId?: string,
): Promise<string> {
  return assetUrlToDataUrl(imageUrl, { assetId, mediaKind: "image" });
}

/** 系统级反推 prompt，告诉 AI 如何分析图片 */
const REVERSE_SYSTEM_PROMPT =
  "Analyze this image and describe it in detail as a high-quality image generation prompt. Output ONLY the prompt text. Include: subject, composition, lighting, style, mood, color palette, technique keywords (e.g. 8K, cinematic lighting, photorealistic). Keep under 200 words.";

/**
 * 将指定图片反推为生图提示词。
 *
 * @param imageUrl  - 图片 URL (blob URL / 远程 URL / data URL)
 * @param options.assetId - IndexedDB asset ID (可选，用于从本地存储读取原始图片)
 * @returns AI 返回的提示词文本
 */
export async function reverseImageToPrompt(
  imageUrl: string,
  options?: { assetId?: string },
): Promise<string> {
  const dataUrl = await imageUrlToBase64(imageUrl, options?.assetId);

  const response = await callAiChat({
    messages: [
      { role: "system", content: REVERSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
    temperature: 0.7,
    timeoutMs: 120_000,
  });

  return response.content.trim();
}
