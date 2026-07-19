import assert from "node:assert/strict";
import test from "node:test";
import { getLocalSkillsResponse } from "./route-core.ts";

const registry = {
  async snapshot() {
    return {
      enabled: true,
      contentInjectionEnabled: false,
      skills: [{ skillId: "local:codex:director" }],
    } as any;
  },
};

test("Local Skill API rejects cloud and non-loopback requests", async () => {
  const cloud = await getLocalSkillsResponse({
    host: "localhost:3183",
    registry,
    environment: { NODE_ENV: "production", STARCANVAS_LOCAL_SKILL_REGISTRY: "1" },
  });
  const remote = await getLocalSkillsResponse({
    host: "starcanvas.example",
    registry,
    environment: { NODE_ENV: "development", STARCANVAS_LOCAL_SKILL_REGISTRY: "1" },
  });

  assert.equal(cloud.status, 403);
  assert.equal(remote.status, 403);
});

test("Local Skill API returns metadata snapshot only for enabled loopback", async () => {
  const response = await getLocalSkillsResponse({
    host: "127.0.0.1:3183",
    registry,
    environment: { NODE_ENV: "development", STARCANVAS_LOCAL_SKILL_REGISTRY: "1" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    enabled: true,
    contentInjectionEnabled: false,
    skills: [{ skillId: "local:codex:director" }],
  });
});
