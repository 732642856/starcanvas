import assert from "node:assert/strict";
import test from "node:test";

import { getProviderRealSmokeConfirmationText } from "../../../../lib/ai/providerSmoke.ts";
import {
  runProviderRealSmoke,
} from "./run-core.ts";

const AI_ENV_KEYS = [
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_DEFAULT_MODEL",
] as const;

type EnvSnapshot = Partial<Record<(typeof AI_ENV_KEYS)[number], string>>;

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of AI_ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot) {
  for (const key of AI_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("real smoke blocks when cost consent is missing", async () => {
  const result = await runProviderRealSmoke({ target: "text", confirmCost: false });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.message, /显式授权/);
});

test("real text smoke executes a minimal request after consent", async (t) => {
  const envSnapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.AI_BASE_URL = "https://relay.example/v1";
  process.env.AI_API_KEY = "sk-env";
  process.env.AI_DEFAULT_MODEL = "gpt-5.5";

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  const result = await runProviderRealSmoke({ target: "text", confirmCost: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://relay.example/v1/chat/completions");
});

test("real server tts smoke stays blocked when VOXCPM is not configured", async () => {
  const result = await runProviderRealSmoke({
    target: "tts-server",
    confirmCost: true,
  }, {
    voxcpmBaseUrl: "",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.message, /VOXCPM_BASE_URL/);
});

test("real image smoke requires a stronger confirmation phrase", async () => {
  const result = await runProviderRealSmoke({
    target: "image",
    confirmCost: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.message, /确认短语/);
});

test("real reference image edit smoke requires its own confirmation phrase", async () => {
  const result = await runProviderRealSmoke({
    target: "image-edit",
    confirmCost: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.message, /确认短语/);
});

test("real reference image edit smoke uses the image edits contract", async (t) => {
  const envSnapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.AI_BASE_URL = "https://relay.example/v1";
  process.env.AI_API_KEY = "sk-env";
  process.env.AI_DEFAULT_MODEL = "gpt-5.5";

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: [{ b64_json: "ZmFrZQ==" }] }), { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  const result = await runProviderRealSmoke({
    target: "image-edit",
    confirmCost: true,
    confirmationText: getProviderRealSmokeConfirmationText("image-edit"),
    _providerOverrides: { imageModel: "gpt-image-2" },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://relay.example/v1/images/edits");
  assert.ok(calls[0]?.init?.body instanceof FormData);
  const form = calls[0]?.init?.body as FormData;
  assert.equal(form.get("model"), "gpt-image-2");
  assert.ok(form.get("image[]") instanceof Blob);
});

test("real image smoke executes a minimal image request after stronger confirmation", async (t) => {
  const envSnapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.AI_BASE_URL = "https://relay.example/v1";
  process.env.AI_API_KEY = "sk-env";
  process.env.AI_DEFAULT_MODEL = "gpt-5.5";

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: [{ b64_json: "ZmFrZQ==" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  const result = await runProviderRealSmoke({
    target: "image",
    confirmCost: true,
    confirmationText: getProviderRealSmokeConfirmationText("image"),
    _providerOverrides: {
      imageModel: "gpt-image-2",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.ok(result.artifact?.type === "image");
  assert.equal(result.artifact?.mimeType, "image/png");
  assert.match(result.artifact?.url || "", /^data:image\/png;base64,/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://relay.example/v1/images/generations");
  const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
  assert.equal(body.model, "gpt-image-2");
  assert.equal(body.size, "1024x1024");
  assert.equal(body.n, 1);
});

test("real image smoke respects provider timeout overrides", async (t) => {
  const envSnapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.AI_BASE_URL = "https://relay.example/v1";
  process.env.AI_API_KEY = "sk-env";
  process.env.AI_DEFAULT_MODEL = "gpt-5.5";

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(new Response(JSON.stringify({ data: [{ b64_json: "ZmFrZQ==" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }, 20);

      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    });

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  const result = await runProviderRealSmoke({
    target: "image",
    confirmCost: true,
    confirmationText: getProviderRealSmokeConfirmationText("image"),
    _providerOverrides: {
      imageModel: "gpt-image-2",
      timeoutMs: 5,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.match(result.message, /超时/);
});

test("real video smoke requires a stronger confirmation phrase", async () => {
  const result = await runProviderRealSmoke({
    target: "video",
    confirmCost: true,
    _providerOverrides: {
      sessionApiKey: "sk-session-dashscope",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.match(result.message, /确认短语/);
});

test("real video smoke submits a minimal Vidu task after stronger confirmation", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      output: { task_id: "task_1234567890" },
      request_id: "req_123",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await runProviderRealSmoke({
    target: "video",
    confirmCost: true,
    confirmationText: getProviderRealSmokeConfirmationText("video"),
    _providerOverrides: {
      sessionApiKey: "sk-session-dashscope",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
  );
  const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
  assert.equal(body.model, "vidu/viduq3-turbo_text2video");
  assert.equal(body.parameters.duration, 1);
  assert.equal(body.parameters.resolution, "540P");
  assert.equal(body.parameters.audio, false);
  assert.equal(body.parameters.watermark, false);
});

test("real video smoke can wait for the final video result when requested", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.includes("/video-synthesis")) {
      return new Response(JSON.stringify({
        output: { task_id: "task_final_video_001" },
        request_id: "req_123",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      output: {
        task_id: "task_final_video_001",
        task_status: calls.length >= 3 ? "SUCCEEDED" : "RUNNING",
        video_url: calls.length >= 3 ? "https://cdn.example.com/final.mp4" : undefined,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await runProviderRealSmoke({
    target: "video",
    confirmCost: true,
    waitForResult: true,
    confirmationText: getProviderRealSmokeConfirmationText("video"),
    _providerOverrides: {
      sessionApiKey: "sk-session-dashscope",
      videoModel: "vidu",
    },
  }, {
    sleepImpl: async () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.match(result.message, /已拿到最终 Vidu 视频结果/);
  assert.deepEqual(result.artifact, {
    type: "video",
    url: "https://cdn.example.com/final.mp4",
  });
  assert.equal(calls.length, 3);
  assert.ok(result.details?.some((detail) => detail.includes("完整链路")));
});
