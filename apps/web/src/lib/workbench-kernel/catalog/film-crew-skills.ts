import type { SkillDefinition } from "../contracts/registry.ts"

const domains = Object.freeze(["film", "directing", "storyboard"])
const intents = Object.freeze(["film.crew.run", "director.analyze", "storyboard.consult"])
const execution = Object.freeze({ type: "hybrid" as const, entrypoint: "adapter://film-crew" })
const routing = Object.freeze({
  priority: 100,
  requiredContext: Object.freeze(["content"]),
})
const quality = Object.freeze({
  contractTests: Object.freeze(["film-crew-skill-adapter.test.ts"]),
  examples: Object.freeze(["example://film/crew/basic"]),
  regressionSet: "regression://film/crew/v1",
})

export const FILM_CREW_SKILL_DEFINITION: SkillDefinition = Object.freeze({
  id: "film.crew.orchestrator",
  version: "1.0.0",
  name: "导演组总控",
  layer: "L1",
  role: "primary",
  domains,
  intents,
  inputSchema: "schema://film/crew/input/1.0",
  outputSchema: "schema://film/crew/output/1.0",
  execution,
  routing,
  quality,
})
