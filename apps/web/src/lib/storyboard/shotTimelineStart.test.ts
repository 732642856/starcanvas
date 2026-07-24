import assert from "node:assert/strict";
import test from "node:test";
import type { ShotProductionBrief } from "./shotProductionBrief.ts";
import { resolveShotTimelineStart } from "./shotTimelineStart.ts";

const briefs = [
  {
    shotId: "shot-1",
    order: 1,
    title: "第一镜",
    visual: { prompt: "first", duration: "3s", characterIdentities: [] },
    voice: { dialogue: "第一句" },
    subtitle: { text: "第一句" },
    handoff: {},
  },
  {
    shotId: "shot-2",
    order: 2,
    title: "第二镜",
    visual: { prompt: "second", duration: "4s", characterIdentities: [] },
    voice: { dialogue: "第二句" },
    subtitle: { text: "第二句" },
    handoff: {},
  },
] as ShotProductionBrief[];

test("resolveShotTimelineStart prioritizes an explicit canvas start", () => {
  assert.equal(
    resolveShotTimelineStart({
      explicitTimelineStart: 12.28,
      persistedSubtitleStart: 3,
      briefs,
      shotId: "shot-2",
    }),
    12.28,
  );
});

test("resolveShotTimelineStart uses a persisted subtitle start before recomputing", () => {
  assert.equal(
    resolveShotTimelineStart({
      persistedSubtitleStart: 9.12,
      briefs,
      shotId: "shot-2",
    }),
    9.12,
  );
});

test("resolveShotTimelineStart computes the cumulative brief start when needed", () => {
  assert.equal(resolveShotTimelineStart({ briefs, shotId: "shot-2" }), 3);
});

test("resolveShotTimelineStart ignores invalid starts and falls back to zero", () => {
  assert.equal(
    resolveShotTimelineStart({
      explicitTimelineStart: -1,
      persistedSubtitleStart: Number.NaN,
      briefs,
      shotId: "missing-shot",
    }),
    0,
  );
});
