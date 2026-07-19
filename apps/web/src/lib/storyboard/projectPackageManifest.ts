import type { ShotProductionBrief } from "./shotProductionBrief";
import {
  buildVideoProviderDryRunPlan,
  type VideoProviderDryRunIssue,
  type VideoProviderEvidenceLevel,
  type VideoProviderId,
  type VideoProviderImplementationStatus,
} from "../ai/video-provider-capabilities.ts";
import {
  buildProductionPreflightReport,
  type ProductionPreflightReport,
} from "./productionPreflight.ts";

export type ProjectPackageShotExport = {
  id: string;
  order: number;
  title: string;
  intent?: string;
  visualReference?: string | null;
  status?: string;
};

export type ProjectPackageReference = {
  id: string;
  title: string;
  note?: string;
  url?: string | null;
  mimeType?: string | null;
};

export type ProjectPackageVideoProviderDryRunShot = {
  shotId: string;
  order: number;
  title: string;
  ok: boolean;
  providerId?: VideoProviderId;
  providerName?: string;
  model?: string;
  mode: "image-to-video";
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  sourceImageUrl?: string;
  implementationStatus?: VideoProviderImplementationStatus;
  evidenceLevel?: VideoProviderEvidenceLevel;
  issues: Array<Pick<VideoProviderDryRunIssue, "code" | "severity" | "message">>;
};

export type ProjectPackageVideoProviderDryRunReport = {
  providerId?: VideoProviderId;
  providerName?: string;
  model?: string;
  implementationStatus?: VideoProviderImplementationStatus;
  evidenceLevel?: VideoProviderEvidenceLevel;
  summary: {
    totalShots: number;
    readyShots: number;
    blockedShots: number;
    blockingIssues: number;
    warningIssues: number;
  };
  shots: ProjectPackageVideoProviderDryRunShot[];
};

export type ProjectPackageProductionRunManifest = {
  version: "1.2";
  workflow: {
    model: "sound-picture-production-run";
    orchestrationHint: "queue-by-shot";
    stages: Array<
      | "script"
      | "storyboard"
      | "visual"
      | "video"
      | "voice"
      | "subtitle"
      | "composition"
      | "handoff"
    >;
  };
  counts: {
    shots: number;
    productionBriefs: number;
    visualReferences: number;
    audioIntent: number;
    handoffNotes: number;
    warnings: number;
    previsPlans: number;
  };
  shotBriefIndex: Array<{
    shotId: string;
    order: number;
    title: string;
    hasVisualPrompt: boolean;
    hasVoice: boolean;
    hasSubtitle: boolean;
    characterCount: number;
    warningCount: number;
  }>;
  productionRunPlan: Array<{
    shotId: string;
    order: number;
    title: string;
    requiredAssets: Array<"visual" | "video" | "voice" | "subtitle" | "handoff-review">;
    nextActions: string[];
    videoReferenceAudit?: NonNullable<ShotProductionBrief["handoff"]["videoReferenceAudit"]>;
  }>;
  handoffWarnings: Array<{
    shotId: string;
    order: number;
    title: string;
    warning: string;
  }>;
  previsPlans: Array<{
    shotId: string;
    order: number;
    title: string;
    status: "not-required" | "recommended";
    pose: boolean;
    depth: boolean;
    splitShotRecommended: boolean;
  }>;
  productionPreflight: ProductionPreflightReport;
  videoProviderDryRun: ProjectPackageVideoProviderDryRunReport;
  sourceReferences: Array<{
    shotId: string;
    order: number;
    title: string;
    type?: string;
    videoName?: string;
    timeSec?: number;
    timestampMs?: number;
    frameIndex?: number;
    sourceVideoId?: string;
    referenceImageUrl?: string;
  }>;
  assetLinks: {
    visualReferenceIds: string[];
    audioIntentIds: string[];
    handoffNoteIds: string[];
  };
};

export type BuildProjectPackageManifestInput = {
  shots: ProjectPackageShotExport[];
  productionBriefs: ShotProductionBrief[];
  visualReferences?: ProjectPackageReference[];
  audioIntent?: ProjectPackageReference[];
  handoffNotes?: ProjectPackageReference[];
  videoProvider?: {
    providerId?: string;
    model?: string;
    aspectRatio?: string;
    resolution?: string;
    allowMock?: boolean;
  };
};

const STAGES: ProjectPackageProductionRunManifest["workflow"]["stages"] = [
  "script",
  "storyboard",
  "visual",
  "video",
  "voice",
  "subtitle",
  "composition",
  "handoff",
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function hasText(value: unknown): boolean {
  return Boolean(cleanText(value));
}

function parseDurationSeconds(value: unknown): number | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  const timecode = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timecode) {
    const first = Number(timecode[1]);
    const second = Number(timecode[2]);
    const third = timecode[3] != null ? Number(timecode[3]) : undefined;
    const seconds = third == null
      ? first * 60 + second
      : first * 3600 + second * 60 + third;
    return seconds > 0 ? seconds : undefined;
  }

  const durationMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!durationMatch) return undefined;

  const seconds = Number(durationMatch[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.max(1, Math.round(seconds));
}

function hasVoice(brief: ShotProductionBrief): boolean {
  return Boolean(
    hasText(brief.voice.dialogue) ||
      hasText(brief.voice.voiceIntent) ||
      hasText(brief.voice.soundCue) ||
      hasText(brief.voice.suggestedText) ||
      hasText(brief.voice.suggestedInstruct),
  );
}

function hasSubtitle(brief: ShotProductionBrief): boolean {
  return Boolean(hasText(brief.subtitle.text) || hasText(brief.subtitle.intent));
}

function buildRequiredAssets(brief: ShotProductionBrief): Array<"visual" | "video" | "voice" | "subtitle" | "handoff-review"> {
  const requiredAssets: Array<"visual" | "video" | "voice" | "subtitle" | "handoff-review"> = [];

  if (hasText(brief.visual.prompt)) {
    requiredAssets.push("visual");
    requiredAssets.push("video");
  }
  if (hasVoice(brief)) {
    requiredAssets.push("voice");
  }
  if (hasSubtitle(brief)) {
    requiredAssets.push("subtitle");
  }
  if ((brief.handoff.warnings ?? []).length > 0 || hasText(brief.handoff.notes)) {
    requiredAssets.push("handoff-review");
  }

  return requiredAssets;
}

function buildNextActions(brief: ShotProductionBrief): string[] {
  const actions: string[] = [];

  if (hasText(brief.visual.prompt)) {
    actions.push("generate-storyboard-image");
    actions.push("generate-video-clip");
  } else {
    actions.push("add-visual-prompt");
  }

  if (hasVoice(brief)) {
    actions.push("generate-voice-track");
  }

  if (hasSubtitle(brief)) {
    actions.push("create-subtitle-track");
  }

  if ((brief.handoff.warnings ?? []).length > 0) {
    actions.push("review-handoff-warnings");
  }

  return [...new Set(actions)];
}

function compareBriefOrder(a: ShotProductionBrief, b: ShotProductionBrief): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.shotId.localeCompare(b.shotId);
}

function buildVideoProviderDryRunReport(
  orderedBriefs: ShotProductionBrief[],
  options: BuildProjectPackageManifestInput["videoProvider"],
): ProjectPackageVideoProviderDryRunReport {
  const shots = orderedBriefs.map((brief) => {
    const hasUpstreamStoryboardImage = hasText(brief.visual.prompt);
    const plan = buildVideoProviderDryRunPlan({
      providerId: options?.providerId ?? "vidu",
      model: options?.model,
      mode: "image-to-video",
      prompt: brief.visual.prompt,
      imageUrl: brief.handoff.source?.referenceImageUrl,
      durationSeconds: parseDurationSeconds(brief.visual.duration),
      aspectRatio: options?.aspectRatio ?? "16:9",
      resolution: options?.resolution ?? "720p",
      allowMock: options?.allowMock,
    });

    return {
      shotId: brief.shotId,
      order: brief.order,
      title: brief.title,
      ok: plan.ok ||
        plan.issues.every((issue) =>
          issue.code === "missing-image" && hasUpstreamStoryboardImage,
        ),
      providerId: plan.normalized.providerId,
      providerName: plan.provider?.displayName,
      model: plan.normalized.model,
      mode: "image-to-video" as const,
      durationSeconds: plan.normalized.durationSeconds,
      aspectRatio: plan.normalized.aspectRatio,
      resolution: plan.normalized.resolution,
      sourceImageUrl: plan.normalized.imageUrl,
      implementationStatus: plan.provider?.implementationStatus,
      evidenceLevel: plan.provider?.evidenceLevel,
      issues: plan.issues.map((issue) => {
        if (issue.code === "missing-image" && hasUpstreamStoryboardImage) {
          return {
            code: issue.code,
            severity: "info" as const,
            message: "首帧将由上游分镜图任务生成，视频任务会在同一队列中等待该结果。",
          };
        }

        return {
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
        };
      }),
    };
  });

  const blockingIssues = shots.reduce(
    (sum, shot) => sum + shot.issues.filter((issue) => issue.severity === "blocking").length,
    0,
  );
  const warningIssues = shots.reduce(
    (sum, shot) => sum + shot.issues.filter((issue) => issue.severity === "warning").length,
    0,
  );
  const firstProviderShot = shots.find((shot) => shot.providerId || shot.providerName);

  return {
    providerId: firstProviderShot?.providerId,
    providerName: firstProviderShot?.providerName,
    model: firstProviderShot?.model,
    implementationStatus: firstProviderShot?.implementationStatus,
    evidenceLevel: firstProviderShot?.evidenceLevel,
    summary: {
      totalShots: shots.length,
      readyShots: shots.filter((shot) => shot.ok).length,
      blockedShots: shots.filter((shot) => !shot.ok).length,
      blockingIssues,
      warningIssues,
    },
    shots,
  };
}

export function buildProjectPackageManifest({
  shots,
  productionBriefs,
  visualReferences = [],
  audioIntent = [],
  handoffNotes = [],
  videoProvider,
}: BuildProjectPackageManifestInput): ProjectPackageProductionRunManifest {
  const orderedBriefs = productionBriefs.slice().sort(compareBriefOrder);
  const handoffWarnings = orderedBriefs.flatMap((brief) =>
    (brief.handoff.warnings ?? []).map((warning) => ({
      shotId: brief.shotId,
      order: brief.order,
      title: brief.title,
      warning,
    })),
  );
  const productionPreflight = buildProductionPreflightReport(orderedBriefs);
  const videoProviderDryRun = buildVideoProviderDryRunReport(orderedBriefs, videoProvider);

  return {
    version: "1.2",
    workflow: {
      model: "sound-picture-production-run",
      orchestrationHint: "queue-by-shot",
      stages: STAGES,
    },
    counts: {
      shots: shots.length,
      productionBriefs: orderedBriefs.length,
      visualReferences: visualReferences.length,
      audioIntent: audioIntent.length,
      handoffNotes: handoffNotes.length,
      warnings: handoffWarnings.length,
      previsPlans: orderedBriefs.filter((brief) => brief.handoff.previs?.status === "recommended").length,
    },
    shotBriefIndex: orderedBriefs.map((brief) => ({
      shotId: brief.shotId,
      order: brief.order,
      title: brief.title,
      hasVisualPrompt: hasText(brief.visual.prompt),
      hasVoice: hasVoice(brief),
      hasSubtitle: hasSubtitle(brief),
      characterCount: brief.visual.characterIdentities.length,
      warningCount: brief.handoff.warnings?.length ?? 0,
    })),
    productionRunPlan: orderedBriefs.map((brief) => ({
      shotId: brief.shotId,
      order: brief.order,
      title: brief.title,
      requiredAssets: buildRequiredAssets(brief),
      nextActions: buildNextActions(brief),
      videoReferenceAudit: brief.handoff.videoReferenceAudit,
    })),
    handoffWarnings,
    previsPlans: orderedBriefs
      .filter((brief) => brief.handoff.previs?.status === "recommended")
      .map((brief) => ({
        shotId: brief.shotId,
        order: brief.order,
        title: brief.title,
        status: brief.handoff.previs!.status,
        pose: brief.handoff.previs!.pose,
        depth: brief.handoff.previs!.depth,
        splitShotRecommended: brief.handoff.previs!.splitShotRecommended,
      })),
    productionPreflight,
    videoProviderDryRun,
    sourceReferences: orderedBriefs
      .filter((brief) => brief.handoff.source)
      .map((brief) => ({
        shotId: brief.shotId,
        order: brief.order,
        title: brief.title,
        ...brief.handoff.source,
      })),
    assetLinks: {
      visualReferenceIds: visualReferences.map((reference) => reference.id),
      audioIntentIds: audioIntent.map((reference) => reference.id),
      handoffNoteIds: handoffNotes.map((reference) => reference.id),
    },
  };
}
