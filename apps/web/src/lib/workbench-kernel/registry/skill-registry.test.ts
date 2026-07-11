import test from "node:test"
import assert from "node:assert/strict"
import type { SkillDefinition } from "../contracts/registry.ts"
import { SkillRegistry, SkillRegistryError } from "./skill-registry.ts"

const primary: SkillDefinition = {
  id: "film.story.orchestrator",
  version: "1.0.0",
  name: "影视故事总控",
  layer: "L1",
  role: "primary",
  domains: ["film", "story"],
  intents: ["story.draft"],
  inputSchema: "schema://film/story/input/1.0",
  outputSchema: "schema://film/story/output/1.0",
  execution: { type: "prompt", entrypoint: "skill://film.story.orchestrator" },
  routing: { priority: 100, requiredContext: [] },
  quality: { contractTests: [], examples: [], regressionSet: "regression://film/story/v1" },
}

function specialist(id: string, priority: number, domains = ["film"]): SkillDefinition {
  return {
    ...primary,
    id,
    role: "specialist",
    domains,
    routing: { priority, requiredContext: [] },
  }
}

function assertRegistryError(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof SkillRegistryError)
    assert.equal(error.code, code)
    assert.equal(error.name, "SkillRegistryError")
    return true
  })
}

test("同一 id 和 version 只允许注册一次", () => {
  const registry = new SkillRegistry([primary])
  assertRegistryError(() => registry.register(primary), "DUPLICATE_SKILL_VERSION")
})

test("只接受 x.y.z 格式的 semver", () => {
  const registry = new SkillRegistry()
  assertRegistryError(() => registry.register({ ...primary, version: "1.0" }), "INVALID_VERSION")
})

test("intents 必须非空", () => {
  const registry = new SkillRegistry()
  assertRegistryError(() => registry.register({ ...primary, intents: [] }), "EMPTY_INTENTS")
})

test("priority 必须为整数", () => {
  const registry = new SkillRegistry()
  assertRegistryError(
    () => registry.register({ ...primary, routing: { ...primary.routing, priority: 1.5 } }),
    "INVALID_PRIORITY",
  )
})

test("同一 intent 只允许一个 primary", () => {
  const registry = new SkillRegistry([primary])
  assertRegistryError(
    () => registry.register({ ...primary, id: "film.story.other" }),
    "PRIMARY_CONFLICT",
  )
})

test("conflictsWith 不允许包含自身", () => {
  const registry = new SkillRegistry()
  assertRegistryError(
    () => registry.register({
      ...primary,
      routing: { ...primary.routing, conflictsWith: [primary.id] },
    }),
    "SELF_CONFLICT",
  )
})

test("routeIntent 按 primary、priority 降序、id 字典序稳定排序", () => {
  const registry = new SkillRegistry([
    specialist("film.story.zeta", 200),
    specialist("film.story.beta", 100),
    primary,
    specialist("film.story.alpha", 100),
  ])

  const result = registry.routeIntent({ type: "story.draft" }, {})

  assert.equal(result.skill.id, primary.id)
  assert.equal(result.reason, "primary-match")
  assert.deepEqual(result.candidates, [
    primary.id,
    "film.story.zeta",
    "film.story.alpha",
    "film.story.beta",
  ])
})

test("routeIntent 支持 allowedDomains 和 excludedSkillIds", () => {
  const film = specialist("film.story.specialist", 100)
  const audio = specialist("audio.story.specialist", 200, ["audio"])
  const registry = new SkillRegistry([film, audio])

  const result = registry.routeIntent(
    { type: "story.draft" },
    { allowedDomains: ["film"], excludedSkillIds: ["film.story.excluded"] },
  )
  assert.equal(result.skill.id, film.id)
  assert.deepEqual(result.candidates, [film.id])

  assertRegistryError(
    () => registry.routeIntent(
      { type: "story.draft" },
      { allowedDomains: ["film"], excludedSkillIds: [film.id] },
    ),
    "NO_ROUTING_CANDIDATE",
  )
})

test("无候选抛出具有稳定 code 和 details 的结构化错误", () => {
  const registry = new SkillRegistry([primary])

  assert.throws(
    () => registry.routeIntent({ type: "unknown.intent" }, {}),
    (error: unknown) => {
      assert.ok(error instanceof SkillRegistryError)
      assert.equal(error.code, "NO_ROUTING_CANDIDATE")
      assert.deepEqual(error.details, { intent: "unknown.intent" })
      return true
    },
  )
})

test("getSkill 可按明确版本重放，未指定版本返回最高 semver", () => {
  const oldVersion = { ...primary, version: "1.9.0" }
  const newVersion = { ...primary, version: "1.10.0" }
  const registry = new SkillRegistry([oldVersion, newVersion])

  assert.equal(registry.getSkill(primary.id, "1.9.0"), oldVersion)
  assert.equal(registry.getSkill(primary.id)?.version, "1.10.0")
  assert.equal(registry.getSkill(primary.id, "2.0.0"), null)
})

test("listSkills 按 domain、intent、role 过滤并稳定排序", () => {
  const registry = new SkillRegistry([
    specialist("film.story.zeta", 100),
    primary,
    specialist("audio.story.alpha", 100, ["audio"]),
  ])

  assert.deepEqual(
    registry.listSkills({ domain: "film", intent: "story.draft", role: "specialist" })
      .map((skill) => skill.id),
    ["film.story.zeta"],
  )
})
