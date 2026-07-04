/**
 * E2E Selectors — stable data-testid constants for toolbar and panels.
 *
 * Use these in tests instead of hardcoded strings to enable
 * centralized refactoring and IDE autocompletion.
 */
export const testIds = {
  toolbar: {
    aiScript: "toolbar-ai-script",
    shotLibrary: "toolbar-shot-library",
    reverseStoryboard: "toolbar-reverse-storyboard",
    colorGrade: "toolbar-color-grade",
    cinematicParams: "toolbar-cinematic-params",
    timeline: "toolbar-timeline",
    crewAgent: "toolbar-crew-agent",
  },
  panels: {
    aiScript: "ai-script-panel",
    shotLibrary: "shot-library-panel",
    reverseStoryboard: "reverse-storyboard-panel",
    colorGrade: "color-grade-panel",
    cinematicParams: "cinematic-param-panel",
    referenceVideoEntry: "reference-video-entry-panel",
  },
  aiScript: {
    briefInput: "ai-script-brief",
    generateButton: "ai-script-generate-button",
    importButton: "ai-script-import-button",
    draftPreview: "ai-script-draft-preview",
  },
  shotLibrary: {
    applyButton: "shot-library-apply-button",
    searchInput: "shot-library-search",
  },
  reverseStoryboard: {
    extractButton: "reverse-storyboard-extract",
    generateButton: "reverse-storyboard-generate",
    importButton: "reverse-storyboard-import",
  },
  canvas: {
    root: ".react-flow",
    node: ".react-flow__node",
  },
} as const
