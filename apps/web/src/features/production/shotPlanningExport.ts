import type { ShotPlanningBoard } from "./shotPlanningTypes.ts";
import { getShotPlanningSummary } from "./shotPlanningCore.ts";

/**
 * 将制片规划板导出为 Markdown 格式
 * 包含 title / summary / status / duration / notes / description / preset 信息
 */
export function exportShotPlanningBoardToMarkdown(
  board: ShotPlanningBoard,
): string {
  const summary = getShotPlanningSummary(board);
  const STATUS_LABELS: Record<string, string> = {
    todo: "📋 Todo",
    ready: "✅ Ready",
    shooting: "🎬 Shooting",
    done: "✔️ Done",
    blocked: "🚫 Blocked",
  };

  const lines: string[] = [
    `# ${board.title}`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Project | ${board.projectId} |`,
    `| Total Shots | ${summary.total} |`,
    `| Todo | ${summary.todo} |`,
    `| Ready | ${summary.ready} |`,
    `| Shooting | ${summary.shooting} |`,
    `| Done | ${summary.done} |`,
    `| Blocked | ${summary.blocked} |`,
    `| Total Duration | ${summary.totalDurationSec}s |`,
    `| Progress | ${summary.progress}% |`,
    "",
    "## Shot List",
    "",
  ];

  const sorted = [...board.items].sort((a, b) => a.order - b.order);

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const statusLabel =
      STATUS_LABELS[item.status] ?? item.status;

    lines.push(`### ${i + 1}. ${item.title}`);
    lines.push("");
    lines.push(`- **Status**: ${statusLabel}`);
    lines.push(`- **Source Node**: \`${item.sourceNodeId}\``);
    if (item.durationSec != null) {
      lines.push(`- **Duration**: ${item.durationSec}s`);
    }
    if (item.shotPresetId) {
      lines.push(`- **Shot Preset**: \`${item.shotPresetId}\``);
    }
    if (item.stylePresetId) {
      lines.push(`- **Style Preset**: \`${item.stylePresetId}\``);
    }
    if (item.description) {
      lines.push(`- **Description**: ${item.description}`);
    }
    if (item.notes) {
      lines.push(`- **Notes**: ${item.notes}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
