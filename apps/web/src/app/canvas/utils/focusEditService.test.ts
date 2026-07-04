import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyFocusEdit, FocusEditError } from "./focusEditService.ts";

describe("applyFocusEdit", () => {
  void it("sends source image, mask, instruction and persists data URL results", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const result = await applyFocusEdit(
      {
        imageUrl: "blob:http://localhost/source",
        maskDataUrl: "data:image/png;base64,MASK",
        prompt: "  把外套改成红色   ",
        sourceAssetId: "asset-source",
        requestId: "focus-1",
        timeoutMs: 10_000,
      },
      {
        imageUrlToBase64Fn: async (url, assetId) => {
          assert.equal(url, "blob:http://localhost/source");
          assert.equal(assetId, "asset-source");
          return "data:image/png;base64,SOURCE";
        },
        fetchImpl: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body ?? "{}"));
          return new Response(JSON.stringify({
            ok: true,
            imageUrl: "data:image/png;base64,RESULT",
            requestId: "focus-1",
            attempts: 1,
            model: "gpt-image-2",
          }));
        },
        persistImageDataUrlFn: async (dataUrl) => {
          assert.equal(dataUrl, "data:image/png;base64,RESULT");
          return {
            assetId: "asset-result",
            objectUrl: "blob:http://localhost/result",
            blob: new Blob(["result"], { type: "image/png" }),
          };
        },
      },
    );

    assert.equal(requestBody?.imageUrl, "data:image/png;base64,SOURCE");
    assert.equal(requestBody?.maskBase64, "data:image/png;base64,MASK");
    assert.equal(requestBody?.instruction, "把外套改成红色");
    assert.equal(requestBody?.model, "gpt-image-2");
    assert.equal(requestBody?.requestId, "focus-1");
    assert.deepEqual(result, {
      imageUrl: "blob:http://localhost/result",
      assetId: "asset-result",
      requestId: "focus-1",
      attempts: 1,
      model: "gpt-image-2",
    });
  });

  void it("throws a readable error when the API returns structured failure", async () => {
    await assert.rejects(
      () => applyFocusEdit(
        {
          imageUrl: "data:image/png;base64,SOURCE",
          maskDataUrl: "data:image/png;base64,MASK",
          prompt: "改成蓝色",
        },
        {
          imageUrlToBase64Fn: async (url) => url,
          fetchImpl: async () => new Response(JSON.stringify({
            ok: false,
            requestId: "focus-err",
            attempts: 2,
            error: {
              userMessage: "局部精修失败",
              detail: "上游返回 502",
            },
          }), { status: 502 }),
          persistImageDataUrlFn: async () => {
            throw new Error("should not persist failed result");
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof FocusEditError);
        assert.equal(error.status, 502);
        assert.equal(error.requestId, "focus-err");
        assert.equal(error.attempts, 2);
        assert.match(error.message, /局部精修失败/);
        assert.match(error.message, /上游返回 502/);
        return true;
      },
    );
  });

  void it("validates prompt and mask before making a network request", async () => {
    await assert.rejects(
      () => applyFocusEdit(
        {
          imageUrl: "data:image/png;base64,SOURCE",
          maskDataUrl: "",
          prompt: "",
        },
        {
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        },
      ),
      /请先描述要局部修改的内容/,
    );
  });
});
