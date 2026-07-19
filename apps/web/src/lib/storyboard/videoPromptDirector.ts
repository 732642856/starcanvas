export type VideoPromptDirection = {
  action?: string;
  shotType?: string;
  cameraMovement?: string;
  hasReferenceFrame?: boolean;
};

export type VideoPromptDirectionResult = {
  prompt: string;
  controlPlan: { pose: boolean; depth: boolean; whiteboxPrevisRecommended: boolean; splitShotRecommended: boolean };
};

function clean(value?: string): string {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function selectPrimaryAction(value: string): { action: string; splitShotRecommended: boolean } {
  const segments = value.split(/(?:[。！？!?；;\n]+|，?(?:然后|随后|接着|再)|\s+(?:and then|then)\s+)/i).map(clean).filter(Boolean);
  return {
    action: segments[0] || value,
    splitShotRecommended: segments.length > 1,
  };
}

export function buildVideoPromptDirection(input: VideoPromptDirection): VideoPromptDirectionResult {
  const suppliedAction = clean(input.action);
  const actionPlan = selectPrimaryAction(suppliedAction);
  const action = actionPlan.action || "The subject makes only subtle natural breathing and cloth movement.";
  const shotType = clean(input.shotType) || "cinematic medium";
  const camera = clean(input.cameraMovement);
  const dynamic = Boolean(suppliedAction);
  const cameraMoves = Boolean(camera) && !/static|locked|固定|静止/.test(camera);
  const continuity = input.hasReferenceFrame
    ? "Preserve the reference frame's character identity, wardrobe, props, spatial layout, and lighting."
    : "Keep character identity, props, and spatial layout stable throughout the shot.";

  return {
    prompt: [
      `Generate one continuous ${shotType} shot with no cuts.`,
      continuity,
      `Primary action: ${action}.`,
      camera ? `Camera movement: ${camera}.` : "Camera movement: locked-off camera.",
      "Do not add characters, change costume, change location, or introduce a second action beat.",
    ].join(" "),
    controlPlan: {
      pose: dynamic,
      depth: cameraMoves,
      whiteboxPrevisRecommended: dynamic || cameraMoves,
      splitShotRecommended: actionPlan.splitShotRecommended,
    },
  };
}
