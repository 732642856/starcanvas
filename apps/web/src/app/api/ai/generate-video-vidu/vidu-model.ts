export type ViduRouteMode = "i2v" | "t2v" | "start-end" | "r2v";

const VIDU_MODEL_FAMILIES = {
  "viduq3-turbo": {
    i2v: "vidu/viduq3-turbo_img2video",
    t2v: "vidu/viduq3-turbo_text2video",
    r2v: "vidu/viduq3-turbo_reference2video",
  },
  "viduq3-pro": {
    i2v: "vidu/viduq3-pro_img2video",
    t2v: "vidu/viduq3-pro_text2video",
  },
  "viduq2-turbo": {
    i2v: "vidu/viduq2-turbo_img2video",
    t2v: "vidu/viduq2-turbo_text2video",
  },
  "viduq2-pro": {
    i2v: "vidu/viduq2-pro_img2video",
    t2v: "vidu/viduq2-pro_text2video",
    r2v: "vidu/viduq2-pro_reference2video",
  },
} as const;

type ViduModelFamily = keyof typeof VIDU_MODEL_FAMILIES;

const DEFAULT_VIDU_MODEL_FAMILY: ViduModelFamily = "viduq3-turbo";

const VIDU_MODEL_ALIASES: Record<string, ViduModelFamily | "default"> = {
  dashscope: "default",
  vidu: "default",
  "vidu-q3-turbo-i2v": "viduq3-turbo",
  "vidu-q3-pro-i2v": "viduq3-pro",
  "vidu-q2-turbo-i2v": "viduq2-turbo",
  "vidu-q2-pro-i2v": "viduq2-pro",
  "vidu-q3-turbo-t2v": "viduq3-turbo",
  "vidu-q3-pro-t2v": "viduq3-pro",
  "vidu-q2-turbo-t2v": "viduq2-turbo",
  "vidu-q2-pro-t2v": "viduq2-pro",
  "vidu/viduq3-turbo_img2video": "viduq3-turbo",
  "vidu/viduq3-pro_img2video": "viduq3-pro",
  "vidu/viduq2-turbo_img2video": "viduq2-turbo",
  "vidu/viduq2-pro_img2video": "viduq2-pro",
  "vidu/viduq3-turbo_text2video": "viduq3-turbo",
  "vidu/viduq3-pro_text2video": "viduq3-pro",
  "vidu/viduq2-turbo_text2video": "viduq2-turbo",
  "vidu/viduq2-pro_text2video": "viduq2-pro",
  "vidu/viduq3-turbo_reference2video": "viduq3-turbo",
  "vidu/viduq2-pro_reference2video": "viduq2-pro",
  viduq3: "default",
  "viduq3-turbo": "viduq3-turbo",
  "viduq3-pro": "viduq3-pro",
  viduq2: "default",
  "viduq2-turbo": "viduq2-turbo",
  "viduq2-pro": "viduq2-pro",
};

function isImageDrivenMode(mode: ViduRouteMode): boolean {
  return mode === "i2v" || mode === "start-end";
}

export function resolveViduModel(model: string | undefined, mode: ViduRouteMode): string {
  const normalized = model?.trim().toLowerCase();
  const familyOrDefault = normalized ? VIDU_MODEL_ALIASES[normalized] : "default";

  if (familyOrDefault) {
    const family =
      familyOrDefault === "default" ? DEFAULT_VIDU_MODEL_FAMILY : familyOrDefault;
    if (mode === "r2v") {
      const referenceModel = (VIDU_MODEL_FAMILIES[family] as { r2v?: string }).r2v;
      return referenceModel ?? "vidu/viduq3-turbo_reference2video";
    }
    return isImageDrivenMode(mode)
      ? VIDU_MODEL_FAMILIES[family].i2v
      : VIDU_MODEL_FAMILIES[family].t2v;
  }

  return model?.trim() || (
    mode === "r2v"
      ? "vidu/viduq3-turbo_reference2video"
      : isImageDrivenMode(mode)
      ? VIDU_MODEL_FAMILIES[DEFAULT_VIDU_MODEL_FAMILY].i2v
      : VIDU_MODEL_FAMILIES[DEFAULT_VIDU_MODEL_FAMILY].t2v
  );
}
