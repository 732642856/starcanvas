import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeCrewLocalSkillIds, resolveCrewLocalSkillContext } from "./crew-local-skill-context.ts";
import { LocalSkillRegistry } from "./local-skill-registry.ts";
import { LocalSkillSource } from "./local-skill-source.ts";

async function registry() {
  const root = await mkdtemp(path.join(tmpdir(), "starcanvas-crew-skills-"));
  const roots = Object.fromEntries(await Promise.all(["codex", "agents", "workbuddy"].map(async (source) => {
    const directory = path.join(root, source);
    await mkdir(path.join(directory, "director"), { recursive: true });
    return [source, directory];
  }))) as Record<"codex" | "agents" | "workbuddy", string>;
  await writeFile(path.join(roots.codex, "director", "SKILL.md"), "# Director\n\nCamera blocking guide.", "utf8");
  return new LocalSkillRegistry({
    source: new LocalSkillSource({ sourceRoots: roots }),
    environment: {
      NODE_ENV: "development",
      STARCANVAS_LOCAL_SKILL_REGISTRY: "1",
      STARCANVAS_LOCAL_SKILL_CONTENT_INJECTION: "0",
    },
  });
}

test("normalizes only fixed-source local Skill ids", () => {
  assert.deepEqual(normalizeCrewLocalSkillIds([
    "local:codex:director",
    "local:codex:director",
    "../../.env",
    "local:unknown:skill",
  ]), ["local:codex:director"]);
});

test("maps selected Skills to metadata-only Crew context and auditable records", async () => {
  const localRegistry = await registry();
  const result = await resolveCrewLocalSkillContext({
    skillIds: ["local:codex:director"],
    includeContent: true,
    host: "localhost:3183",
    registry: localRegistry,
    environment: {
      NODE_ENV: "development",
      STARCANVAS_LOCAL_SKILL_REGISTRY: "1",
      STARCANVAS_LOCAL_SKILL_CONTENT_INJECTION: "0",
    },
  });

  assert.match(result.prompt, /local-skill-reference/);
  assert.equal(result.audit[0]!.injection, "metadata");
  assert.equal(result.audit[0]!.skillBodySent, false);
  assert.match(result.audit[0]!.contentHash, /^sha256:/);
});

test("rejects selected Skills outside local-only request guard", async () => {
  await assert.rejects(
    async () => resolveCrewLocalSkillContext({
      skillIds: ["local:codex:director"],
      includeContent: false,
      host: "starcanvas.example",
      registry: await registry(),
      environment: { NODE_ENV: "development", STARCANVAS_LOCAL_SKILL_REGISTRY: "1" },
    }),
    /enabled loopback deployment/,
  );
});
