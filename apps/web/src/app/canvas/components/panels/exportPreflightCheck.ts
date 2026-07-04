export interface ExportAssetCheck {
  type: "video" | "audio" | "subtitle";
  label: string;
  nodeId: string;
  title: string;
  hasContent: boolean;
  missingReason?: string;
}

export interface ExportPreflightNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

export type ExportPreflightType = "json" | "zip";

export function normalizeExportPreflightType(value: unknown): ExportPreflightType {
  return value === "zip" ? "zip" : "json";
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function hasAnyValue(data: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Boolean(nonEmptyString(data[key])));
}

function hasLegacyShotVoice(data: Record<string, unknown>): boolean {
  const shot = data.shot as { voiceAudioUrl?: unknown } | undefined;
  return Boolean(nonEmptyString(shot?.voiceAudioUrl));
}

function hasMissingLocalAsset(data: Record<string, unknown>): boolean {
  return data.persistence === "missing" || typeof data.loadError === "string";
}

/**
 * Pure export preflight scanner shared by the UI and tests.
 */
export function runExportPreflightCheck(
  nodes: ExportPreflightNode[],
  timelineOrder?: string[],
): ExportAssetCheck[] {
  const checks: ExportAssetCheck[] = [];
  const processed = new Set<string>();

  const orderedNodes = timelineOrder
    ?.map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is ExportPreflightNode => Boolean(node));

  const orderedIds = new Set(orderedNodes?.map((node) => node.id) ?? []);
  const scanNodes = orderedNodes?.length
    ? [...orderedNodes, ...nodes.filter((node) => !orderedIds.has(node.id))]
    : nodes;

  for (const node of scanNodes) {
    const data = node.data || {};
    const nodeKind = nonEmptyString(data.nodeKind) || node.type || "";
    const title = nonEmptyString(data.title) || node.id.slice(0, 8);
    const isMissingLocalAsset = hasMissingLocalAsset(data);

    if (nodeKind.includes("video") && !processed.has(`video:${node.id}`)) {
      processed.add(`video:${node.id}`);
      const hasVideoUrl = hasAnyValue(data, ["resultUrl", "assetUrl", "imageUrl"]);
      const hasContent = hasVideoUrl && !isMissingLocalAsset;
      checks.push({
        type: "video",
        label: "视频",
        nodeId: node.id,
        title,
        hasContent,
        missingReason: hasContent
          ? undefined
          : isMissingLocalAsset
            ? "本地视频资产缺失，请重新上传或重新生成"
            : "视频文件缺失，请先生成视频",
      });
    }

    if (
      (nodeKind.includes("audio") || nodeKind.includes("tts") || nodeKind === "bgm") &&
      !processed.has(`audio:${node.id}`)
    ) {
      processed.add(`audio:${node.id}`);
      const hasAudioUrl =
        hasAnyValue(data, ["resultUrl", "assetUrl", "audioUrl", "voiceAudioUrl"]) ||
        hasLegacyShotVoice(data);
      const hasContent = hasAudioUrl && !isMissingLocalAsset;
      checks.push({
        type: "audio",
        label: nodeKind === "bgm" ? "背景音乐" : "配音",
        nodeId: node.id,
        title,
        hasContent,
        missingReason: hasContent
          ? undefined
          : isMissingLocalAsset
            ? "本地音频资产缺失，请重新生成配音或重新上传音频"
            : "音频文件缺失",
      });
    }

    if (
      (nodeKind.includes("subtitle") ||
        hasAnyValue(data, ["srtContent", "content", "text"])) &&
      !processed.has(`subtitle:${node.id}`)
    ) {
      processed.add(`subtitle:${node.id}`);
      const hasSubtitle = hasAnyValue(data, ["srtContent", "content", "text"]);
      checks.push({
        type: "subtitle",
        label: "字幕",
        nodeId: node.id,
        title,
        hasContent: hasSubtitle,
        missingReason: hasSubtitle ? undefined : "字幕内容为空",
      });
    }
  }

  return checks;
}
