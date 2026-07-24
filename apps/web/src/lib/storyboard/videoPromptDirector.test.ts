import assert from "node:assert/strict";
import test from "node:test";

import { buildVideoPromptDirection } from "./videoPromptDirector.ts";

test("compiles one action and one camera move for a reference frame", () => {
  const result = buildVideoPromptDirection({
    action: "Jingchai slowly hides the scorched wok and glances toward the gate",
    shotType: "medium close-up",
    cameraMovement: "slow push in",
    hasReferenceFrame: true,
  });
  assert.match(result.prompt, /one continuous medium close-up shot with no cuts/i);
  assert.match(result.prompt, /Preserve the reference frame/i);
  assert.match(result.prompt, /Primary action:/);
  assert.match(result.prompt, /Camera movement: slow push in/i);
  assert.deepEqual(result.controlPlan, { pose: true, depth: true, whiteboxPrevisRecommended: true, splitShotRecommended: false });
});

test("defaults a static reference shot to conservative motion", () => {
  const result = buildVideoPromptDirection({ hasReferenceFrame: true });
  assert.match(result.prompt, /subtle natural breathing/i);
  assert.match(result.prompt, /locked-off camera/i);
  assert.deepEqual(result.controlPlan, { pose: false, depth: false, whiteboxPrevisRecommended: false, splitShotRecommended: false });
});

test("keeps only the first sequential action and recommends splitting the shot", () => {
  const result = buildVideoPromptDirection({
    action: "荆钗把焦黑铁锅藏到身后，然后警觉望向宫门。",
    cameraMovement: "slow push in",
    hasReferenceFrame: true,
  });

  assert.match(result.prompt, /Primary action: 荆钗把焦黑铁锅藏到身后/);
  assert.doesNotMatch(result.prompt, /警觉望向宫门/);
  assert.equal(result.controlPlan.splitShotRecommended, true);
});
