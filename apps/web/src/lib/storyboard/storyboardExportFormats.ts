/**
 * Storyboard Export Formats — Markdown screenplay, Character CSV, Storyboard CSV.
 *
 * Zero-dependency, self-contained exporters for StarCanvas storyboard data.
 * Called from StarCanvas toolbar for one-click downloads.
 */

import type { ShotProductionBrief } from "./shotProductionBrief";
import type { CharacterIdentityAsset } from "@/app/canvas/components/canvas/types";

// ============================================================================
// Helpers
// ============================================================================

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function csvQuote(text: string): string {
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function sortedBriefs(briefs: ShotProductionBrief[]): ShotProductionBrief[] {
  return [...briefs].sort((a, b) => a.order - b.order);
}

// ============================================================================
// 1. Markdown Screenplay Export
// ============================================================================

export function generateScreenplayMarkdown(
  title: string,
  briefs: ShotProductionBrief[],
  options?: {
    /** Include visual prompt as action block description */
    includeVisual?: boolean;
    /** Include voice intent annotations */
    includeVoiceIntent?: boolean;
  },
): string {
  const includeVisual = options?.includeVisual ?? true;
  const includeVoiceIntent = options?.includeVoiceIntent ?? true;
  const shots = sortedBriefs(briefs);
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> 自动生成于 ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`> ${shots.length} 个分镜`);
  lines.push("");

  for (const shot of shots) {
    const num = shot.order;
    const shotTitle = shot.title || `分镜 ${num}`;

    // Scene header
    lines.push("---");
    lines.push("");
    lines.push(`## ${num}. ${shotTitle}`);
    lines.push("");

    // Shot metadata as scene heading
    const meta: string[] = [];
    if (shot.visual.shotType) meta.push(shot.visual.shotType);
    if (shot.visual.cameraMovement) meta.push(shot.visual.cameraMovement);
    if (shot.visual.duration) meta.push(`时长: ${shot.visual.duration}`);
    if (meta.length > 0) {
      lines.push(`*${meta.join(" | ")}*`);
      lines.push("");
    }

    // Characters
    if (shot.visual.characterIdentities.length > 0) {
      const names = shot.visual.characterIdentities.map((c) => c.name);
      lines.push(`**角色**: ${names.join("、")}`);
      lines.push("");
    }

    // Action block (visual prompt)
    if (includeVisual && shot.visual.prompt) {
      lines.push(shot.visual.prompt.trim());
      lines.push("");
    }

    // Dialogue
    if (shot.voice.dialogue) {
      // For each character, we find their lines
      // Since brief.voice.dialogue may contain multi-character dialogue,
      // we detect "<NAME>:" prefixes
      const dialogueText = shot.voice.dialogue.trim();
      const dialogueLines = dialogueText.split("\n");

      for (const dl of dialogueLines) {
        const trimmed = dl.trim();
        if (!trimmed) continue;

        // Detect "<Character>:" prefix
        const charMatch = trimmed.match(/^[\u4e00-\u9fff\w]+[:：]/);
        if (charMatch) {
          const charName = charMatch[0].replace(/[:：]$/, "");
          const lineText = trimmed.slice(charMatch[0].length).trim();
          lines.push(`**${charName}**`);
          lines.push(`: ${lineText}`);
        } else {
          // No character prefix — treat as narration or unnamed dialogue
          lines.push(`: ${trimmed}`);
        }
        lines.push("");
      }
    }

    // Voice intent
    if (includeVoiceIntent && shot.voice.voiceIntent) {
      lines.push(`> 🎤 ${shot.voice.voiceIntent}`);
      lines.push("");
    }

    // Sound cue
    if (shot.voice.soundCue) {
      lines.push(`> 🔊 ${shot.voice.soundCue}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`*${title} — 分镜剧本 终*`);

  return lines.join("\n");
}

export function screenplayFilename(title: string): string {
  const safe = title.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 80);
  return `${safe}_剧本.md`;
}

// ============================================================================
// 2. Character Table CSV Export
// ============================================================================

export function generateCharacterTableCsv(
  characters: CharacterIdentityAsset[],
): string {
  const headers = [
    "名称",
    "角色",
    "视觉特征",
    "服装",
    "道具",
    "色板",
    "声线档案ID",
    "声线状态",
    "备注",
  ];

  const rows: string[] = [headers.map(csvQuote).join(",")];

  for (const c of characters) {
    const row = [
      c.name,
      c.role ?? "",
      c.visualSignature ?? "",
      c.costume ?? "",
      c.props?.join("；") ?? "",
      c.colorPalette?.join("；") ?? "",
      c.voiceProfileId ?? "",
      c.voiceProfileStatus ?? "",
      c.notes ?? "",
    ];
    rows.push(row.map(csvQuote).join(","));
  }

  // Add BOM for Excel CJK compatibility
  return "\uFEFF" + rows.join("\n");
}

export function characterTableFilename(projectName: string): string {
  const safe = projectName.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 80);
  return `${safe}_角色表.csv`;
}

// ============================================================================
// 3. Storyboard Table CSV Export
// ============================================================================

export function generateStoryboardTableCsv(
  briefs: ShotProductionBrief[],
): string {
  const headers = [
    "编号",
    "标题",
    "景别",
    "运镜",
    "时长",
    "角色",
    "对白",
    "声音意图",
    "音效",
    "字幕",
    "后期备注",
    "警告",
    "来源类型",
    "来源时间码",
    "参考帧",
  ];

  const shots = sortedBriefs(briefs);
  const rows: string[] = [headers.map(csvQuote).join(",")];

  for (const s of shots) {
    const row = [
      s.order.toString(),
      s.title,
      s.visual.shotType ?? "",
      s.visual.cameraMovement ?? "",
      s.visual.duration ?? "",
      s.visual.characterIdentities.map((c) => c.name).join("；"),
      s.voice.dialogue ?? "",
      s.voice.voiceIntent ?? "",
      s.voice.soundCue ?? "",
      s.subtitle.text ?? "",
      s.handoff.notes ?? "",
      s.handoff.warnings?.join("；") ?? "",
      s.handoff.source?.type ?? "",
      formatSourceTime(s.handoff.source?.timeSec, s.handoff.source?.timestampMs),
      s.handoff.source?.referenceImageUrl ?? "",
    ];
    rows.push(row.map(csvQuote).join(","));
  }

  return "\uFEFF" + rows.join("\n");
}

export function storyboardTableFilename(projectName: string): string {
  const safe = projectName.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, "_").slice(0, 80);
  return `${safe}_分镜表.csv`;
}

function formatSourceTime(timeSec?: number, timestampMs?: number): string {
  const seconds = typeof timeSec === "number"
    ? timeSec
    : typeof timestampMs === "number"
      ? timestampMs / 1000
      : undefined;
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? `${Math.round(seconds * 10) / 10}s`
    : "";
}

// ============================================================================
// 4. Unified export helper — generates all formats at once
// ============================================================================

export type ExportBundle = {
  markdown: string;
  markdownFilename: string;
  characterCsv: string;
  characterCsvFilename: string;
  storyboardCsv: string;
  storyboardCsvFilename: string;
};

export function generateExportBundle(
  projectName: string,
  briefs: ShotProductionBrief[],
  characters: CharacterIdentityAsset[],
): ExportBundle {
  return {
    markdown: generateScreenplayMarkdown(projectName, briefs),
    markdownFilename: screenplayFilename(projectName),
    characterCsv: generateCharacterTableCsv(characters),
    characterCsvFilename: characterTableFilename(projectName),
    storyboardCsv: generateStoryboardTableCsv(briefs),
    storyboardCsvFilename: storyboardTableFilename(projectName),
  };
}
