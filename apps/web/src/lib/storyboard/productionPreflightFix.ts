import type {
  CharacterIdentityAsset,
  StoryboardShotData,
} from "@/app/canvas/components/canvas/types";
import { buildShotProductionBrief } from "./shotProductionBrief.ts";
import { buildShotProductionPreflight } from "./productionPreflight.ts";
import type { ShotProductionPreflight } from "./productionPreflight.ts";

export type ProductionPreflightFixAction =
  | "strengthen-visual-prompt"
  | "add-shot-language"
  | "set-shot-duration"
  | "attach-reference-frame"
  | "complete-character-anchor"
  | "restore-source-timecode"
  | "add-voice-intent"
  | "review-handoff-warning"
  | "add-visual-prompt"
  | string;

export type ProductionPreflightFixDraft = {
  patch: Partial<StoryboardShotData>;
  summary: string;
  appliedActions: string[];
};

export type ProductionPreflightFixOutcome = {
  draft: ProductionPreflightFixDraft;
  before: ShotProductionPreflight;
  after: ShotProductionPreflight;
  resolvedBlockingIssues: number;
  remainingBlockingIssues: number;
  remainingWarningIssues: number;
  statusChanged: boolean;
  notice: {
    kind: "success" | "warning" | "info";
    title: string;
    description: string;
  };
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function hasText(value: unknown): boolean {
  return Boolean(cleanText(value));
}

function normalizeAction(action: ProductionPreflightFixAction): string {
  return action.startsWith("preflight:") ? action.slice("preflight:".length) : action;
}

function joinPromptParts(parts: string[]): string {
  return [...new Set(parts.map(cleanText).filter(Boolean))].join(", ");
}

function buildVisualPromptDraft(shot: StoryboardShotData): string {
  const base = cleanText(shot.visualPrompt) || cleanText(shot.description) || cleanText(shot.title) || `shot ${shot.order}`;
  const shotType = cleanText(shot.shotType) || "cinematic medium shot";
  const camera = cleanText(shot.cameraMovement) || "controlled camera movement";
  const characters = (shot.characterIdentities ?? [])
    .map((character) => cleanText(character.visualSignature) || cleanText(character.name))
    .filter(Boolean)
    .join(", ");

  return joinPromptParts([
    shotType,
    camera,
    base,
    characters ? `consistent character details: ${characters}` : "",
    "clear subject action",
    "cinematic lighting",
    "production-ready AI video prompt",
  ]);
}

function completeCharacterAnchors(
  identities: CharacterIdentityAsset[] | undefined,
  shot: StoryboardShotData,
): CharacterIdentityAsset[] | undefined {
  if (!identities?.length) return identities;

  return identities.map((identity, index) => {
    const name = cleanText(identity.name) || `角色 ${index + 1}`;
    const hasReferenceAnchor = hasText(identity.referenceAssetId) ||
      hasText(identity.frontViewAssetId) ||
      hasText(identity.sideViewAssetId) ||
      hasText(identity.backViewAssetId) ||
      hasText(identity.frontViewUrl) ||
      hasText(identity.sideViewUrl) ||
      hasText(identity.backViewUrl);
    const visualSignature = hasText(identity.visualSignature) || hasReferenceAnchor
      ? identity.visualSignature
      : `待确认：${name} 的脸型、发型、年龄感和独特轮廓，需要与本项目其他镜头保持一致。`;
    const costume = hasText(identity.costume) || hasReferenceAnchor
      ? identity.costume
      : `待确认：${name} 在「${cleanText(shot.title) || `镜头 ${shot.order}`}」中的服装、主色和关键道具。`;

    return {
      ...identity,
      name,
      visualSignature,
      costume,
      notes: joinPromptParts([
        identity.notes ?? "",
        "Preflight quick-fix draft: verify this character anchor before final generation.",
      ]),
    };
  });
}

function buildVoiceIntentDraft(shot: StoryboardShotData): string {
  const dialogue = cleanText(shot.dialogue) || cleanText(shot.voiceConfig?.text);
  const emotionalHint = cleanText(shot.cinematicShot?.emotionalState) || "自然、克制、有电影感";
  return dialogue
    ? `${emotionalHint}；根据对白节奏表演，保持清晰咬字和稳定情绪。`
    : `${emotionalHint}；无对白镜头，保留环境声和节奏呼吸。`;
}

export function buildProductionPreflightFixDraft(
  shot: StoryboardShotData,
  actions: ProductionPreflightFixAction[],
): ProductionPreflightFixDraft {
  const normalizedActions = [...new Set(actions.map(normalizeAction).filter(Boolean))];
  const patch: Partial<StoryboardShotData> = {};
  const summaries: string[] = [];
  const appliedActions: string[] = [];

  const applyVisualPrompt = () => {
    const nextPrompt = buildVisualPromptDraft({ ...shot, ...patch });
    if (nextPrompt && nextPrompt !== shot.visualPrompt) {
      patch.visualPrompt = nextPrompt;
      summaries.push("已生成视觉提示词草案");
      appliedActions.push("strengthen-visual-prompt");
    }
  };

  for (const action of normalizedActions) {
    switch (action) {
      case "missing-visual-prompt":
      case "add-visual-prompt":
      case "strengthen-visual-prompt":
        applyVisualPrompt();
        break;
      case "add-shot-language":
        if (!hasText(shot.shotType)) {
          patch.shotType = "medium";
        }
        if (!hasText(shot.cameraMovement)) {
          patch.cameraMovement = "static";
        }
        if (patch.shotType || patch.cameraMovement) {
          summaries.push("已补景别/运镜草案");
          appliedActions.push("add-shot-language");
        }
        break;
      case "set-shot-duration":
        if (!hasText(shot.duration)) {
          patch.duration = "3s";
          summaries.push("已补默认镜头时长草案");
          appliedActions.push("set-shot-duration");
        }
        break;
      case "attach-reference-frame":
        if (!hasText(shot.referenceImageUrl)) {
          patch.notes = joinPromptParts([
            shot.notes ?? "",
            "待补参考帧：请拖入该镜头的关键参考图或从原视频重新抽帧。",
          ]);
          summaries.push("已添加参考帧待办说明");
          appliedActions.push("attach-reference-frame");
        }
        break;
      case "complete-character-anchor": {
        const nextIdentities = completeCharacterAnchors(shot.characterIdentities, shot);
        if (nextIdentities && JSON.stringify(nextIdentities) !== JSON.stringify(shot.characterIdentities)) {
          patch.characterIdentities = nextIdentities;
          summaries.push("已补角色锚点草案");
          appliedActions.push("complete-character-anchor");
        }
        break;
      }
      case "restore-source-timecode":
        if (shot.sourceType === "reference-video" && !hasText(shot.sourceMeta?.timeSec) && !hasText(shot.sourceMeta?.timestampMs)) {
          patch.notes = joinPromptParts([
            patch.notes ?? shot.notes ?? "",
            "待恢复来源时间码：请从反推视频分析结果中选择原片时间点。",
          ]);
          summaries.push("已添加来源时间码待办说明");
          appliedActions.push("restore-source-timecode");
        }
        break;
      case "add-voice-intent":
        if (!hasText(shot.voiceConfig?.instruct)) {
          patch.voiceConfig = {
            ...(shot.voiceConfig ?? {}),
            mode: shot.voiceConfig?.mode ?? "design",
            text: shot.voiceConfig?.text || shot.dialogue || "",
            instruct: buildVoiceIntentDraft(shot),
          };
          summaries.push("已补声音意图草案");
          appliedActions.push("add-voice-intent");
        }
        break;
      case "review-handoff-warning":
        patch.notes = joinPromptParts([
          patch.notes ?? shot.notes ?? "",
          "待复核交接警告：请确认视觉、声音、字幕与后期交接信息。",
        ]);
        summaries.push("已添加交接复核待办");
        appliedActions.push("review-handoff-warning");
        break;
      default:
        break;
    }
  }

  return {
    patch,
    summary: summaries.length > 0 ? [...new Set(summaries)].join("；") : "没有可自动生成的修复草案",
    appliedActions: [...new Set(appliedActions)],
  };
}

export function buildProductionPreflightFixOutcome(
  shot: StoryboardShotData,
  actions: ProductionPreflightFixAction[],
): ProductionPreflightFixOutcome {
  const before = buildShotProductionPreflight(buildShotProductionBrief(shot));
  const draft = buildProductionPreflightFixDraft(shot, actions);
  const nextShot = { ...shot, ...draft.patch };
  const after = buildShotProductionPreflight(buildShotProductionBrief(nextShot));
  const beforeBlockingIssues = before.issues.filter((issue) => issue.severity === "blocking").length;
  const remainingBlockingIssues = after.issues.filter((issue) => issue.severity === "blocking").length;
  const remainingWarningIssues = after.issues.filter((issue) => issue.severity === "warning").length;
  const resolvedBlockingIssues = Math.max(0, beforeBlockingIssues - remainingBlockingIssues);
  const statusChanged = before.status !== after.status || before.score !== after.score;

  if (Object.keys(draft.patch).length === 0) {
    return {
      draft,
      before,
      after,
      resolvedBlockingIssues,
      remainingBlockingIssues,
      remainingWarningIssues,
      statusChanged,
      notice: {
        kind: "info",
        title: "没有可自动应用的草案",
        description: draft.summary,
      },
    };
  }

  if (remainingBlockingIssues > 0) {
    return {
      draft,
      before,
      after,
      resolvedBlockingIssues,
      remainingBlockingIssues,
      remainingWarningIssues,
      statusChanged,
      notice: {
        kind: "warning",
        title: "草案已应用，仍有阻塞",
        description: `${draft.summary}；仍剩 ${remainingBlockingIssues} 个阻塞、${remainingWarningIssues} 个警告，需要继续补齐。`,
      },
    };
  }

  if (remainingWarningIssues > 0) {
    return {
      draft,
      before,
      after,
      resolvedBlockingIssues,
      remainingBlockingIssues,
      remainingWarningIssues,
      statusChanged,
      notice: {
        kind: resolvedBlockingIssues > 0 ? "success" : "warning",
        title: resolvedBlockingIssues > 0 ? "阻塞已解除，仍需复核" : "草案已应用，仍需复核",
        description: `${draft.summary}；当前剩余 ${remainingWarningIssues} 个警告，投产前建议人工确认。`,
      },
    };
  }

  return {
    draft,
    before,
    after,
    resolvedBlockingIssues,
    remainingBlockingIssues,
    remainingWarningIssues,
    statusChanged,
    notice: {
      kind: "success",
      title: "草案已应用，预检通过",
      description: `${draft.summary}；该镜头现在可以进入生产队列。`,
    },
  };
}
