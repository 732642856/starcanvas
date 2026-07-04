import type { ShotProductionBrief } from "./shotProductionBrief";

export type ProductionPreflightSeverity = "info" | "warning" | "blocking";

export type ProductionPreflightIssueCode =
  | "missing-visual-prompt"
  | "weak-visual-prompt"
  | "missing-shot-language"
  | "missing-duration"
  | "missing-reference"
  | "missing-character-anchor"
  | "character-anchor-incomplete"
  | "missing-source-time"
  | "missing-voice-intent"
  | "handoff-warning";

export type ProductionPreflightIssue = {
  code: ProductionPreflightIssueCode;
  severity: ProductionPreflightSeverity;
  message: string;
};

export type ShotProductionPreflight = {
  shotId: string;
  order: number;
  title: string;
  status: "ready" | "needs-review" | "blocked";
  score: number;
  issues: ProductionPreflightIssue[];
  requiredActions: string[];
};

export type ProductionPreflightSummary = {
  totalShots: number;
  readyShots: number;
  reviewShots: number;
  blockedShots: number;
  blockingIssues: number;
  warningIssues: number;
  averageScore: number;
};

export type ProductionPreflightReport = {
  summary: ProductionPreflightSummary;
  shots: ShotProductionPreflight[];
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function hasText(value: unknown): boolean {
  return Boolean(cleanText(value));
}

function promptWordCount(prompt: string): number {
  return cleanText(prompt).split(/\s+/).filter(Boolean).length;
}

function hasReference(brief: ShotProductionBrief): boolean {
  return Boolean(
    hasText(brief.handoff.source?.referenceImageUrl) ||
      brief.visual.characterIdentities.some((character) =>
        hasText(character.referenceAssetId) ||
        hasText(character.frontViewUrl) ||
        hasText(character.sideViewUrl) ||
        hasText(character.backViewUrl),
      ),
  );
}

function characterAnchorIssues(brief: ShotProductionBrief): ProductionPreflightIssue[] {
  const issues: ProductionPreflightIssue[] = [];
  const characters = brief.visual.characterIdentities;

  if (characters.length === 0) return issues;

  for (const character of characters) {
    const name = cleanText(character.name) || character.id || "未命名角色";
    const hasVisualSignature = hasText(character.visualSignature);
    const hasCostume = hasText(character.costume);
    const hasReferenceAsset = hasText(character.referenceAssetId) ||
      hasText(character.frontViewUrl) ||
      hasText(character.sideViewUrl) ||
      hasText(character.backViewUrl);

    if (!hasVisualSignature && !hasReferenceAsset) {
      issues.push({
        code: "missing-character-anchor",
        severity: "blocking",
        message: `${name} 缺少视觉锚点或参考资产，跨镜头一致性风险很高。`,
      });
      continue;
    }

    if (!hasCostume && !hasReferenceAsset) {
      issues.push({
        code: "character-anchor-incomplete",
        severity: "warning",
        message: `${name} 缺少服装/参考资产约束，生成时可能出现造型漂移。`,
      });
    }
  }

  return issues;
}

function collectIssues(brief: ShotProductionBrief): ProductionPreflightIssue[] {
  const issues: ProductionPreflightIssue[] = [];
  const prompt = cleanText(brief.visual.prompt);

  if (!prompt) {
    issues.push({
      code: "missing-visual-prompt",
      severity: "blocking",
      message: "缺少视觉提示词，不能进入自动生图/生视频。",
    });
  } else if (promptWordCount(prompt) < 6 && !/[\u4e00-\u9fff]/.test(prompt)) {
    issues.push({
      code: "weak-visual-prompt",
      severity: "warning",
      message: "视觉提示词过短，建议补充主体、动作、场景、光线和风格。",
    });
  }

  if (!hasText(brief.visual.shotType) || !hasText(brief.visual.cameraMovement)) {
    issues.push({
      code: "missing-shot-language",
      severity: "warning",
      message: "缺少景别或运镜，模型会自行补全镜头语言。",
    });
  }

  if (!hasText(brief.visual.duration)) {
    issues.push({
      code: "missing-duration",
      severity: "warning",
      message: "缺少镜头时长，队列排期和字幕/音频同步会不稳定。",
    });
  }

  if (!hasReference(brief)) {
    issues.push({
      code: "missing-reference",
      severity: "warning",
      message: "缺少参考帧或角色参考资产，生成结果会更像盲抽卡。",
    });
  }

  if (brief.handoff.source?.type === "reference-video" && brief.handoff.source.timeSec == null && brief.handoff.source.timestampMs == null) {
    issues.push({
      code: "missing-source-time",
      severity: "warning",
      message: "参考视频镜头缺少来源时间码，后续追溯和重抽帧会变难。",
    });
  }

  if ((hasText(brief.voice.dialogue) || hasText(brief.voice.suggestedText)) && !hasText(brief.voice.voiceIntent) && !hasText(brief.voice.suggestedInstruct)) {
    issues.push({
      code: "missing-voice-intent",
      severity: "warning",
      message: "有对白但缺少声线/表演意图，配音结果可能缺少情绪控制。",
    });
  }

  for (const warning of brief.handoff.warnings ?? []) {
    issues.push({
      code: "handoff-warning",
      severity: "warning",
      message: warning,
    });
  }

  return [...issues, ...characterAnchorIssues(brief)];
}

function issuePenalty(issue: ProductionPreflightIssue): number {
  return issue.severity === "blocking" ? 45 : issue.severity === "warning" ? 14 : 4;
}

function buildRequiredActions(issues: ProductionPreflightIssue[]): string[] {
  const actions = issues.map((issue) => {
    switch (issue.code) {
      case "missing-visual-prompt":
      case "weak-visual-prompt":
        return "strengthen-visual-prompt";
      case "missing-shot-language":
        return "add-shot-language";
      case "missing-duration":
        return "set-shot-duration";
      case "missing-reference":
        return "attach-reference-frame";
      case "missing-character-anchor":
      case "character-anchor-incomplete":
        return "complete-character-anchor";
      case "missing-source-time":
        return "restore-source-timecode";
      case "missing-voice-intent":
        return "add-voice-intent";
      case "handoff-warning":
        return "review-handoff-warning";
      default:
        return "review-shot";
    }
  });

  return [...new Set(actions)];
}

export function buildShotProductionPreflight(
  brief: ShotProductionBrief,
): ShotProductionPreflight {
  const issues = collectIssues(brief);
  const blocking = issues.some((issue) => issue.severity === "blocking");
  const warnings = issues.some((issue) => issue.severity === "warning");
  const score = Math.max(
    0,
    Math.min(100, 100 - issues.reduce((sum, issue) => sum + issuePenalty(issue), 0)),
  );

  return {
    shotId: brief.shotId,
    order: brief.order,
    title: brief.title,
    status: blocking ? "blocked" : warnings ? "needs-review" : "ready",
    score,
    issues,
    requiredActions: buildRequiredActions(issues),
  };
}

export function buildProductionPreflightReport(
  briefs: ShotProductionBrief[],
): ProductionPreflightReport {
  const shots = briefs
    .slice()
    .sort((a, b) => a.order - b.order || a.shotId.localeCompare(b.shotId))
    .map(buildShotProductionPreflight);
  const totalShots = shots.length;
  const readyShots = shots.filter((shot) => shot.status === "ready").length;
  const reviewShots = shots.filter((shot) => shot.status === "needs-review").length;
  const blockedShots = shots.filter((shot) => shot.status === "blocked").length;
  const blockingIssues = shots.flatMap((shot) => shot.issues).filter((issue) => issue.severity === "blocking").length;
  const warningIssues = shots.flatMap((shot) => shot.issues).filter((issue) => issue.severity === "warning").length;
  const averageScore = totalShots > 0
    ? Math.round(shots.reduce((sum, shot) => sum + shot.score, 0) / totalShots)
    : 100;

  return {
    summary: {
      totalShots,
      readyShots,
      reviewShots,
      blockedShots,
      blockingIssues,
      warningIssues,
      averageScore,
    },
    shots,
  };
}
