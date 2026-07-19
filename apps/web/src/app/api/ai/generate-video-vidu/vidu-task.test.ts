import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createViduTask, waitForViduTaskResult } from "./vidu-task.ts";

describe("createViduTask", () => {
  it("includes HappyHorse first_frame and media image inputs", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ output: { task_id: "task_happyhorse_001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      await createViduTask({
        mode: "i2v",
        model: "happyhorse-1.1-i2v",
        prompt: "raise a black wok",
        imageUrl: "https://example.com/prince.png",
      }, "sk-dashscope", "https://dashscope.aliyuncs.com/api/v1");
      const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
      assert.equal(body.model, "happyhorse-1.1-i2v");
      assert.equal(body.input.first_frame, "https://example.com/prince.png");
      assert.deepEqual(body.input.media, [{ type: "first_frame", url: "https://example.com/prince.png" }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes provider aliases like vidu into a real DashScope model before creating a task", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        output: { task_id: "task_alias_001" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const taskId = await createViduTask({
        mode: "t2v",
        model: "vidu",
        prompt: "minimal smoke video",
        duration: 1,
        resolution: "540P",
        audio: false,
        watermark: false,
      }, "sk-dashscope", "https://dashscope.aliyuncs.com/api/v1");

      assert.equal(taskId, "task_alias_001");
      const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
      assert.equal(body.model, "vidu/viduq3-turbo_text2video");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("submits multiple reference images through the reference-video media contract", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ output: { task_id: "task_reference_001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const taskId = await createViduTask({
        mode: "r2v",
        model: "viduq3-turbo",
        prompt: "A prince and palace maid share a tense moment.",
        referenceImageUrls: [
          "https://example.com/prince.png",
          "https://example.com/maid.png",
        ],
        duration: 3,
        resolution: "720P",
        size: "720*1280",
        watermark: false,
      }, "sk-dashscope", "https://dashscope.aliyuncs.com/api/v1");

      assert.equal(taskId, "task_reference_001");
      const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
      assert.equal(body.model, "vidu/viduq3-turbo_reference2video");
      assert.deepEqual(body.input.media, [
        { type: "image", url: "https://example.com/prince.png" },
        { type: "image", url: "https://example.com/maid.png" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uploads data url images to DashScope temporary OSS before creating an i2v task", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });

      if (String(input).includes("/api/v1/uploads?action=getPolicy")) {
        return new Response(JSON.stringify({
          data: {
            policy: "policy-1",
            signature: "sig-1",
            upload_dir: "dashscope-instant/test/dir",
            upload_host: "https://dashscope-file-example.oss-cn-beijing.aliyuncs.com",
            oss_access_key_id: "AKID",
            x_oss_object_acl: "private",
            x_oss_forbid_overwrite: "true",
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (String(input) === "https://dashscope-file-example.oss-cn-beijing.aliyuncs.com") {
        return new Response("", { status: 200 });
      }

      return new Response(JSON.stringify({
        output: { task_id: "task_i2v_oss_001" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const taskId = await createViduTask({
        mode: "i2v",
        model: "vidu",
        prompt: "make the still image breathe",
        imageUrl: "data:image/png;base64,QUJDRA==",
        duration: 1,
        resolution: "540P",
        audio: false,
        watermark: false,
      }, "sk-dashscope", "https://dashscope.aliyuncs.com/api/v1");

      assert.equal(taskId, "task_i2v_oss_001");
      assert.equal(calls[0]?.url, "https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=qwen-vl-plus");
      assert.equal(calls[1]?.url, "https://dashscope-file-example.oss-cn-beijing.aliyuncs.com");

      const body = JSON.parse(String(calls[2]?.init?.body || "{}"));
      assert.equal(body.model, "vidu/viduq3-turbo_img2video");
      assert.match(String(body.input?.media?.[0]?.url || ""), /^oss:\/\/dashscope-instant\/test\/dir\/starcanvas-vidu-i2v-/);
      assert.equal(
        (calls[2]?.init?.headers as Record<string, string> | undefined)?.["X-DashScope-OssResourceResolve"],
        "enable",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("waitForViduTaskResult", () => {
  it("retries a transient task query network failure before succeeding", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new Error("fetch failed");
      return new Response(JSON.stringify({
        output: { task_status: "SUCCEEDED", video_url: "https://cdn.example.com/recovered.mp4" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const result = await waitForViduTaskResult({
        taskId: "task_recover_001",
        apiKey: "sk-dashscope",
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
        pollIntervalMs: 1,
        maxPollMinutes: 1,
      }, { sleep: async () => {} });
      assert.equal(result.ok, true);
      assert.equal(result.videoUrl, "https://cdn.example.com/recovered.mp4");
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("waits until the final videoUrl is available", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const pollIndex = calls.length;
      if (pollIndex === 1) {
        return new Response(JSON.stringify({
          output: {
            task_id: "task_wait_001",
            task_status: "RUNNING",
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        output: {
          task_id: "task_wait_001",
          task_status: "SUCCEEDED",
          video_url: "https://cdn.example.com/final.mp4",
          orig_prompt: "minimal smoke video",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await waitForViduTaskResult({
        taskId: "task_wait_001",
        apiKey: "sk-dashscope",
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
        pollIntervalMs: 1,
        maxPollMinutes: 1,
      }, {
        sleep: async () => {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "SUCCEEDED");
      assert.equal(result.videoUrl, "https://cdn.example.com/final.mp4");
      assert.equal(result.pollCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
