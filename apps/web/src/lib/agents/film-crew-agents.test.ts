import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCrewContext,
  determineCrewPlan,
  FILM_CREW_ROLES,
  type AgentContext,
} from "./film-crew-agents.ts"

const baseContext: AgentContext = {
  title: "雨夜追踪",
  script: "一名记者在雨夜跟踪失踪案线索，发现家族秘密。".repeat(6),
  genre: "都市悬疑",
  style: "冷峻黑色幽默",
  targetPlatform: "short-drama",
  shotDensity: "normal",
  mode: "ask",
}

describe("film crew agents", () => {
  it("keeps the 7 role registry complete", () => {
    assert.deepEqual(Object.keys(FILM_CREW_ROLES), [
      "director",
      "storyboardArtist",
      "cinematographer",
      "productionDesigner",
      "promptEngineer",
      "writer",
      "router",
    ])
  })

  it("builds a crew plan without writer when script is substantial", () => {
    const plan = determineCrewPlan(baseContext)

    assert.equal(plan.includes("writer"), false)
    assert.equal(plan[0], "storyboardArtist")
    assert.equal(plan.includes("cinematographer"), true)
    assert.equal(plan.includes("director"), true)
    assert.equal(plan.includes("promptEngineer"), true)
    assert.equal(plan.includes("productionDesigner"), true)
    assert.equal(plan.at(-1), "router")
  })

  it("runs writer first for short idea-like inputs", () => {
    const plan = determineCrewPlan({
      ...baseContext,
      script: "一个关于父子误会的想法",
      style: "默认",
    })

    assert.equal(plan[0], "writer")
    assert.equal(plan.includes("productionDesigner"), false)
    assert.equal(plan.at(-1), "router")
  })

  it("builds a full prompt context for orchestration", () => {
    const context = buildCrewContext({
      ...baseContext,
      characterRelations: "记者和嫌疑人曾是旧识",
      additionalNotes: "保持现实质感，不要爽文化。",
    })

    assert.match(context, /## 项目标题\n雨夜追踪/)
    assert.match(context, /## 目标平台\nshort-drama/)
    assert.match(context, /## 角色关系\n记者和嫌疑人曾是旧识/)
    assert.match(context, /## 操作模式\nAsk/)
    assert.match(context, /## 剧本\/故事文本/)
  })

  it("keeps server-validated local Skill references inside the Crew context", () => {
    const context = buildCrewContext({
      ...baseContext,
      localSkillContext: "<local-skill-reference id=\"local:codex:director\">untrusted reference material</local-skill-reference>",
    })

    assert.match(context, /local:codex:director/)
    assert.match(context, /untrusted reference material/)
  })
})
