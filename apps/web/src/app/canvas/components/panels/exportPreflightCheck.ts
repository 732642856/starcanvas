export interface ExportAssetCheck {
  type: "video" | "audio" | "subtitle";
  label: string;
  nodeId: string;
  title: string;
  hasContent: boolean;
  missingReason?: string;
  warningReason?: string;
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

function getFileNameWarning(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const trimmed = fileName.trim();
  if (!trimmed) return "文件名为空，导出时会使用默认文件名";
  if (/[\\/:*?"<>|]/.test(trimmed)) return "文件名包含跨平台非法字符，导出时会自动替换";
  if (/[. ]$/.test(trimmed)) return "文件名以点或空格结尾，导出时会自动清理";
  if (!/\.[A-Za-z0-9]{2,8}$/.test(trimmed)) return "文件名缺少扩展名，导出时会自动补齐";
  const base = trimmed.replace(/\.[^.]+$/, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) {
    return "文件名是 Windows 保留名，导出时会自动改名";
  }
  return undefined;
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

    if (JIANYING_VIDEO_NODE_KINDS.has(nodeKind) && !processed.has(`video:${node.id}`)) {
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
        warningReason: getFileNameWarning(nonEmptyString(data.fileName)),
      });
    }

    if (
      (nodeKind.includes("audio") ||
        nodeKind.includes("tts") ||
        nodeKind === "bgm" ||
        Boolean((data.shot as { voiceAudioUrl?: unknown } | undefined)?.voiceAudioUrl)) &&
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
        warningReason: getFileNameWarning(nonEmptyString(data.fileName)),
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

  const seenFileNames = new Map<string, ExportAssetCheck>();
  for (const check of checks) {
    if (check.type === "subtitle") continue;
    const sourceNode = nodes.find((node) => node.id === check.nodeId);
    const fileName = nonEmptyString(sourceNode?.data?.fileName);
    if (!fileName) continue;
    const normalized = `${check.type}:${fileName.trim().toLowerCase()}`;
    const existing = seenFileNames.get(normalized);
    if (!existing) {
      seenFileNames.set(normalized, check);
      continue;
    }
    const reason = "存在同名素材，导出时会自动追加序号避免覆盖";
    existing.warningReason ??= reason;
    check.warningReason ??= reason;
  }

  return checks;
}
import { JIANYING_VIDEO_NODE_KINDS } from "../../utils/jianyingDraftExport.ts";
