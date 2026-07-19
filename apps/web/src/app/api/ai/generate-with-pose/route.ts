// ============================================================================
// Generate Image with Pose Reference API Route
// Accepts: reference image + skeleton pose PNG + prompt
// Sends the skeleton as a control reference to the upstream image generation API
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { normalizeGenerationError } from "@/lib/ai/normalizeGenerationError";
import { getImageProviderCapability } from "@/lib/ai/imageProviderCapabilities";
import { getProvider } from "@/lib/ai/provider-registry";
import { fetchWithTimeout } from "@/lib/ai/server-fetch";

// ── Config ──────────────────────────────────────────────────────────────────
function getConfig() {
  const provider = getProvider()
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    timeoutMs: provider.timeoutMs,
  }
}
const TEXT_TO_IMAGE_ENDPOINT = "/images/generations";

const SUPPORTED_IMAGE_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"]);
const SIZE_ALIASES: Record<string, string> = {
  "1024x576": "1792x1024",
  "576x1024": "1024x1792",
  "1024x768": "1792x1024",
  "768x1024": "1024x1792",
  "512x512": "1024x1024",
};

function normalizeImageSize(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "1024x1024";
  const size = value.trim();
  if (SUPPORTED_IMAGE_SIZES.has(size)) return size;
  return SIZE_ALIASES[size] || "1024x1024";
}

function stripDataUriPrefix(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.*)$/);
  return match ? match[1] : trimmed;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function buildImageEditFormData(params: {
  model: string;
  prompt: string;
  size: string;
  referenceImageDataUrl: string;
  skeletonImageDataUrl?: string;
}): FormData {
  const { model, prompt, size, referenceImageDataUrl, skeletonImageDataUrl } =
    params;
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", "1");
  form.append("response_format", "b64_json");

  // Primary reference image
  const refBlob = dataUrlToBlob(referenceImageDataUrl);
  const refExt = refBlob.type.includes("jpeg")
    ? "jpg"
    : refBlob.type.includes("webp")
      ? "webp"
      : "png";
  form.append("image", refBlob, `reference.${refExt}`);

  // Skeleton pose image as additional reference (if supported by upstream)
  if (skeletonImageDataUrl) {
    const skelBlob = dataUrlToBlob(skeletonImageDataUrl);
    form.append(
      "image",
      skelBlob,
      `skeleton.${skelBlob.type.includes("jpeg") ? "jpg" : "png"}`,
    );
  }

  return form;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      referenceImage,
      skeletonPng,
      poseJson,
      prompt,
      model = "gpt-image-2",
      size = "1024x1024",
      requestId,
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "Prompt is required",
          requestId,
          model,
        },
        { status: 400 },
      );
    }

    const config = getConfig()

    if (!config.apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "API key is not configured",
          requestId,
          model,
        },
        { status: 500 },
      );
    }

    const normalizedSize = normalizeImageSize(size);

    // Build a prompt that includes pose awareness
    const posePrompt = [
      prompt.trim(),
      "Maintain the exact pose, body proportions, and joint positions as shown in the reference skeleton image.",
      "Do not change the character's stance, posture, or limb positions.",
      "Apply the character's appearance, clothing, and style from the source image onto the pose.",
    ].join(" ");

    const capability = getImageProviderCapability(model);

    // If we have a reference image, use image-to-image approach (FormData /images/edits)
    if (referenceImage) {
      const formData = buildImageEditFormData({
        model,
        prompt: posePrompt,
        size: normalizedSize,
        referenceImageDataUrl: referenceImage,
        skeletonImageDataUrl: skeletonPng,
      });

      const upstreamUrl = `${config.baseUrl}/images/edits`;
      console.info(
        "[generate-with-pose] calling image-to-image:",
        upstreamUrl,
      );

      const upstreamRes = await fetchWithTimeout(upstreamUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: formData,
      }, config.timeoutMs);

      if (!upstreamRes.ok) {
        const errorText = await upstreamRes.text();
        const normalized = normalizeGenerationError({
          status: upstreamRes.status,
          body: errorText,
          provider: capability.provider,
        });
        return NextResponse.json(
          {
            ok: false,
            error: normalized,
            requestId,
            model,
          },
          { status: normalized.status || upstreamRes.status },
        );
      }

      const imageData = await upstreamRes.json();
      const b64Json = imageData.data?.[0]?.b64_json;

      if (b64Json) {
        return NextResponse.json({
          ok: true,
          imageUrl: `data:image/png;base64,${b64Json}`,
          prompt: posePrompt,
          model,
          requestId,
        });
      }

      const url = imageData.data?.[0]?.url;
      if (url) {
        return NextResponse.json({
          ok: true,
          imageUrl: url,
          prompt: posePrompt,
          model,
          requestId,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: "No image data returned",
          requestId,
          model,
        },
        { status: 500 },
      );
    }

    // Text-to-image fallback: embed pose description in the prompt
    const poseDescription = poseJson
      ? buildPoseDescription(poseJson)
      : "A person in a standing pose.";

    const textPrompt = [
      prompt.trim(),
      poseDescription,
    ].join(" ");

    const generationPayload = {
      model,
      prompt: textPrompt,
      n: 1,
      size: normalizedSize,
      response_format: "b64_json",
    };

    console.info("[generate-with-pose] calling text-to-image");

    const upstreamRes = await fetchWithTimeout(`${config.baseUrl}${TEXT_TO_IMAGE_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(generationPayload),
    }, config.timeoutMs);

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      const normalized = normalizeGenerationError({
        status: upstreamRes.status,
        body: errorText,
        provider: capability.provider,
      });
      return NextResponse.json(
        {
          ok: false,
          error: normalized,
          requestId,
          model,
        },
        { status: normalized.status || upstreamRes.status },
      );
    }

    const imageData = await upstreamRes.json();
    const b64Json = imageData.data?.[0]?.b64_json;

    if (b64Json) {
      return NextResponse.json({
        ok: true,
        imageUrl: `data:image/png;base64,${b64Json}`,
        prompt: textPrompt,
        model,
        requestId,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "No image data returned",
        requestId,
        model,
      },
      { status: 500 },
    );
  } catch (error: any) {
    const normalized = normalizeGenerationError({ error, provider: "copse" });
    console.debug("[generate-with-pose] unexpected error:", normalized.raw);
    return NextResponse.json(
      {
        ok: false,
        error: normalized,
        requestId: null,
        model: null,
      },
      { status: normalized.status || 500 },
    );
  }
}

/**
 * Build a rough pose description text from OpenPose JSON keypoints.
 * This is used as a fallback when only poseJson is available (no skeleton PNG).
 */
function buildPoseDescription(poseJson: any): string {
  try {
    const kp = poseJson?.people?.[0]?.pose_keypoints_2d;
    if (!kp || kp.length < 25 * 3) return "A person in a standing pose.";

    // Extract key joint positions (normalized from pixel coords)
    const getKp = (index: number) => {
      const xi = index * 3;
      return { x: kp[xi], y: kp[xi + 1] };
    };

    const head = getKp(0);
    const rWrist = getKp(4);
    const lWrist = getKp(7);
    const rAnkle = getKp(11);
    const lAnkle = getKp(14);

    const limbs: string[] = [];

    // Detect arm positions
    if (rWrist.y < head.y) limbs.push("right arm raised above head");
    else if (rWrist.y < 0.5 * 512) limbs.push("right arm at shoulder height");
    else limbs.push("right arm down");

    if (lWrist.y < head.y) limbs.push("left arm raised above head");
    else if (lWrist.y < 0.5 * 512) limbs.push("left arm at shoulder height");
    else limbs.push("left arm down");

    // Detect leg positions
    const legSpread = Math.abs(lAnkle.x - rAnkle.x);
    if (legSpread > 0.3 * 512) {
      limbs.push("legs spread apart");
    } else {
      limbs.push("legs together");
    }

    // Detect standing vs sitting
    const rKnee = getKp(10);
    const lKnee = getKp(13);
    const avgKneeY = (rKnee.y + lKnee.y) / 2;
    if (avgKneeY > 0.75 * 512) {
      limbs.push("knees bent, appears to be sitting or crouching");
    } else {
      limbs.push("standing upright");
    }

    return `The character is in a pose with the following details: ${limbs.join("; ")}.`;
  } catch {
    return "A person in a standing pose.";
  }
}
