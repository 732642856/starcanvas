import test from "node:test"
import assert from "node:assert/strict"
import { GENERAL_WORKSPACE_PROFILE } from "./general.ts"
import { DIRECTOR_WORKSPACE_PROFILE } from "./director.ts"
import { getWorkspaceStorageKeys, PROFILES, resolveProfile } from "./registry.ts"

// ─── storage key isolation ──────────────────────────────────────────

test("双工作台隔离布局、历史、快照存储键", () => {
  const general = getWorkspaceStorageKeys("project-1", GENERAL_WORKSPACE_PROFILE)
  const director = getWorkspaceStorageKeys("project-1", DIRECTOR_WORKSPACE_PROFILE)

  assert.notEqual(general.layout, director.layout)
  assert.notEqual(general.history, director.history)
  assert.notEqual(general.snapshot, director.snapshot)
})

test("双工作台共享项目资产命名空间", () => {
  const general = getWorkspaceStorageKeys("project-1", GENERAL_WORKSPACE_PROFILE)
  const director = getWorkspaceStorageKeys("project-1", DIRECTOR_WORKSPACE_PROFILE)

  assert.equal(general.projectAssetNamespace, director.projectAssetNamespace)
})

test("不同项目存储键不同", () => {
  const a = getWorkspaceStorageKeys("project-a", GENERAL_WORKSPACE_PROFILE)
  const b = getWorkspaceStorageKeys("project-b", GENERAL_WORKSPACE_PROFILE)

  assert.notEqual(a.layout, b.layout)
  assert.notEqual(a.history, b.history)
  assert.notEqual(a.snapshot, b.snapshot)
  assert.notEqual(a.projectAssetNamespace, b.projectAssetNamespace)
})

test("同一项目同一工作台存储键稳定", () => {
  const first = getWorkspaceStorageKeys("stable-project", GENERAL_WORKSPACE_PROFILE)
  const second = getWorkspaceStorageKeys("stable-project", GENERAL_WORKSPACE_PROFILE)

  assert.deepEqual(first, second)
})

// ─── profile shape ───────────────────────────────────────────────────

test("GENERAL 工作台标识与标题", () => {
  assert.equal(GENERAL_WORKSPACE_PROFILE.id, "general")
  assert.equal(typeof GENERAL_WORKSPACE_PROFILE.title, "string")
  assert.ok(GENERAL_WORKSPACE_PROFILE.title.length > 0)
})

test("DIRECTOR 工作台标识与标题", () => {
  assert.equal(DIRECTOR_WORKSPACE_PROFILE.id, "director")
  assert.equal(typeof DIRECTOR_WORKSPACE_PROFILE.title, "string")
  assert.ok(DIRECTOR_WORKSPACE_PROFILE.title.length > 0)
})

// ─── domain isolation ───────────────────────────────────────────────

test("导演组只允许影视相关 Skill domain", () => {
  assert.equal(DIRECTOR_WORKSPACE_PROFILE.allowedSkillDomains.includes("film"), true)
  assert.equal(DIRECTOR_WORKSPACE_PROFILE.allowedSkillDomains.includes("storyboard"), true)
  assert.equal(DIRECTOR_WORKSPACE_PROFILE.allowedSkillDomains.includes("finance"), false)
})

test("通用工作台允许更广泛的 Skill domain", () => {
  assert.equal(GENERAL_WORKSPACE_PROFILE.allowedSkillDomains.includes("film"), true)
  assert.equal(GENERAL_WORKSPACE_PROFILE.allowedSkillDomains.includes("general"), true)
})

// ─── node kind isolation ────────────────────────────────────────────

test("导演组节点类型受工作台限制", () => {
  const directorKinds = DIRECTOR_WORKSPACE_PROFILE.allowedNodeKinds
  assert.equal(directorKinds.includes("asset"), true)
  assert.equal(directorKinds.includes("skill"), true)
  assert.equal(directorKinds.includes("department"), true)
  assert.equal(directorKinds.includes("review"), true)
  assert.equal(directorKinds.includes("workflow"), true)
  assert.equal(directorKinds.includes("delivery"), true)
})

test("通用工作台节点类型更广", () => {
  const generalKinds = GENERAL_WORKSPACE_PROFILE.allowedNodeKinds
  for (const kind of DIRECTOR_WORKSPACE_PROFILE.allowedNodeKinds) {
    assert.equal(generalKinds.includes(kind), true, `通用工作台应包含导演组的节点 kind: ${kind}`)
  }
})

// ─── panels and commands ────────────────────────────────────────────

test("导演组拥有影视专用面板", () => {
  const panels = DIRECTOR_WORKSPACE_PROFILE.panels
  assert.ok(panels.length > 0, "导演组应至少有一个面板")
})

test("通用工作台拥有通用面板", () => {
  const panels = GENERAL_WORKSPACE_PROFILE.panels
  assert.ok(panels.length > 0, "通用工作台应至少有一个面板")
})

test("两个工作台的面板列表不相等", () => {
  assert.notDeepEqual(DIRECTOR_WORKSPACE_PROFILE.panels, GENERAL_WORKSPACE_PROFILE.panels)
})

test("导演组有默认工作流", () => {
  assert.equal(typeof DIRECTOR_WORKSPACE_PROFILE.defaultWorkflowId, "string")
  assert.ok(DIRECTOR_WORKSPACE_PROFILE.defaultWorkflowId.length > 0)
})

// ─── profile registry ──────────────────────────────────────────────

test("PROFILES 包含全部两种工作台", () => {
  assert.equal(PROFILES.length, 2)
  const ids = PROFILES.map((p) => p.id)
  assert.deepEqual(ids.sort(), ["director", "general"])
})

test("resolveProfile 按 id 解析", () => {
  assert.equal(resolveProfile("general").id, "general")
  assert.equal(resolveProfile("director").id, "director")
})

test("resolveProfile 对未知 id 抛结构化错误", () => {
  try {
    resolveProfile("unknown-workspace" as any)
    assert.fail("expected error")
  } catch (e: any) {
    assert.equal(e.name, "WorkspaceProfileError")
    assert.equal(e.code, "UNKNOWN_PROFILE")
    assert.equal(e.profileId, "unknown-workspace")
  }
})

test("getWorkspaceStorageKeys 拒绝空 projectId", () => {
  try {
    getWorkspaceStorageKeys("", GENERAL_WORKSPACE_PROFILE)
    assert.fail("expected error")
  } catch (e: any) {
    assert.equal(e.name, "WorkspaceProfileError")
    assert.equal(e.code, "INVALID_PROJECT_ID")
  }
})

test("getWorkspaceStorageKeys 拒绝纯空格 projectId", () => {
  try {
    getWorkspaceStorageKeys("   ", GENERAL_WORKSPACE_PROFILE)
    assert.fail("expected error")
  } catch (e: any) {
    assert.equal(e.name, "WorkspaceProfileError")
    assert.equal(e.code, "INVALID_PROJECT_ID")
  }
})

test("getWorkspaceStorageKeys 正确处理特殊字符 projectId", () => {
  const keys = getWorkspaceStorageKeys("my:project/has spaces", GENERAL_WORKSPACE_PROFILE)
  assert.ok(!keys.layout.includes(" "), "空格应被编码")
  assert.ok(keys.layout.includes("%"))
})

// ─── prefix format ──────────────────────────────────────────────────

test("存储键以工作台 id 开头", () => {
  const general = getWorkspaceStorageKeys("p1", GENERAL_WORKSPACE_PROFILE)
  const director = getWorkspaceStorageKeys("p1", DIRECTOR_WORKSPACE_PROFILE)

  assert.ok(general.layout.startsWith("ws:general:lay:"), `布局键应以 ws:general:lay: 开头，实际为: ${general.layout}`)
  assert.ok(general.history.startsWith("ws:general:his:"))
  assert.ok(general.snapshot.startsWith("ws:general:snap:"))
  assert.ok(director.layout.startsWith("ws:director:lay:"))
  assert.ok(director.history.startsWith("ws:director:his:"))
  assert.ok(director.snapshot.startsWith("ws:director:snap:"))
})

test("getWorkspaceStorageKeys 返回值运行时不可变", () => {
  const keys: any = getWorkspaceStorageKeys("p1", GENERAL_WORKSPACE_PROFILE)
  assert.throws(
    () => { keys.layout = "hacked" },
    /Cannot assign to read only property/,
  )
  assert.throws(
    () => { keys.history = "hacked" },
    /Cannot assign to read only property/,
  )
})

// ─── profile immutability ───────────────────────────────────────────

test("profile 只读引用不可变", () => {
  const copy: any = GENERAL_WORKSPACE_PROFILE
  assert.throws(() => {
    copy.id = "hacked"
  }, /Cannot assign to read only property/)
  assert.throws(() => {
    copy.allowedNodeKinds = []
  }, /Cannot assign to read only property/)
})

test("profile 内部数组深层冻结", () => {
  assert.throws(
    () => (GENERAL_WORKSPACE_PROFILE.allowedNodeKinds as any).push("extra"),
    /Cannot add property|not extensible|read only/,
  )
  assert.throws(
    () => (DIRECTOR_WORKSPACE_PROFILE.allowedSkillDomains as any).push("finance"),
    /Cannot add property|not extensible|read only/,
  )
})
