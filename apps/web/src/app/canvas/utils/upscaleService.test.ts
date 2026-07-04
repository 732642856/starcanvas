import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestImageUpscale, UpscaleError } from "./upscaleService.ts";

describe("requestImageUpscale", () => {
  void it("sends a data URL image to the upscale API", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const result = await requestImageUpscale(
      {
        imageUrl: "blob:http://localhost/source",
        assetId: "asset-source",
        scale: 4,
        faceEnhance: true,
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
            imageUrl: "data:image/png;base64,UPSCALED",
            message: "done",
          }));
        },
      },
    );

    assert.equal(requestBody?.image, "data:image/png;base64,SOURCE");
    assert.equal(requestBody?.scale, 4);
    assert.equal(requestBody?.faceEnhance, true);
    assert.deepEqual(result, {
      status: "ready",
      imageUrl: "data:image/png;base64,UPSCALED",
      message: "done",
    });
  });

  void it("returns a not-ready result with deployment guidance", async () => {
    const result = await requestImageUpscale(
      { imageUrl: "data:image/png;base64,SOURCE" },
      {
        imageUrlToBase64Fn: async (url) => url,
        fetchImpl: async () => new Response(JSON.stringify({
          status: "not_ready",
          message: "服务端高清放大模型尚未部署",
          clientFallback: { available: true, method: "canvas-bicubic", note: "预览可用" },
          recommendedNextSteps: ["部署 Real-ESRGAN"],
        })),
      },
    );

    assert.equal(result.status, "not_ready");
    assert.equal(result.message, "服务端高清放大模型尚未部署");
    assert.equal(result.clientFallback?.method, "canvas-bicubic");
    assert.deepEqual(result.recommendedNextSteps, ["部署 Real-ESRGAN"]);
  });

  void it("rejects non-image inputs before calling the API", async () => {
    await assert.rejects(
      () => requestImageUpscale(
        { imageUrl: "blob:http://localhost/video" },
        {
          imageUrlToBase64Fn: async () => "data:video/webm;base64,VIDEO",
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof UpscaleError);
        assert.match(error.message, /只支持图片输入/);
        return true;
      },
    );
  });
});
