import assert from "node:assert/strict"
import test from "node:test"

import { buildCanvasIssues } from "./canvasIssueCenter.ts"

test("Issue center maps preflight issues to a deterministic repair action", () => {
  const issues = buildCanvasIssues({
    productionPreflight: {
      summary: { totalShots: 1, readyShots: 0, reviewShots: 0, blockedShots: 1, blockingIssues: 1, warningIssues: 1, averageScore: 50 },
      shots: [{
        shotId: "shot-1",
        order: 1,
        title: "雨夜",
        status: "blocked",
        score: 50,
        requiredActions: ["strengthen-visual-prompt"],
        issues: [
          { code: "missing-visual-prompt", severity: "blocking", message: "缺少视觉提示词" },
          { code: "missing-reference", severity: "warning", message: "缺少参考帧" },
        ],
      }],
    },
  })

  assert.deepEqual(issues.map((issue) => [issue.severity, issue.action]), [
    ["blocking", "strengthen-visual-prompt"],
    ["warning", "attach-reference-frame"],
  ])
})

test("Issue center deduplicates queue actions already represented by preflight", () => {
  const issues = buildCanvasIssues({
    productionPreflight: {
      summary: { totalShots: 1, readyShots: 0, reviewShots: 1, blockedShots: 0, blockingIssues: 0, warningIssues: 1, averageScore: 85 },
      shots: [{
        shotId: "shot-1", order: 1, title: "雨夜", status: "needs-review", score: 85,
        requiredActions: ["attach-reference-frame"],
        issues: [{ code: "missing-reference", severity: "warning", message: "缺少参考帧" }],
      }],
    },
    queue: {
      blockedActions: [
        { shotId: "shot-1", order: 1, title: "雨夜", action: "attach-reference-frame", reason: "缺少参考帧" },
        { shotId: "shot-2", order: 2, title: "追逐", action: "review-video-provider", reason: "视频 Provider 尚未配置" },
      ],
    },
  })

  assert.equal(issues.length, 2)
  assert.equal(issues[0]?.source, "queue")
  assert.equal(issues[0]?.shotId, "shot-2")
  assert.equal(issues[1]?.source, "preflight")
})

test("Issue center returns no rows for a ready project", () => {
  assert.deepEqual(buildCanvasIssues(), [])
})
