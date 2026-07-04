import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestTalkingPhoto, TalkingPhotoError } from "./talkingPhotoService.ts";

describe("requestTalkingPhoto", () => {
  void it("sends image and text to the talking-photo API", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const result = await requestTalkingPhoto(
      {
        imageUrl: "blob:http://localhost/avatar",
        imageAssetId: "asset-avatar",
        text: "欢迎来到星轨画布。",
      },
      {
        imageUrlToBase64Fn: async (url, assetId) => {
          assert.equal(url, "blob:http://localhost/avatar");
          assert.equal(assetId, "asset-avatar");
          return "data:image/png;base64,AVATAR";
        },
        fetchImpl: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body ?? "{}"));
          return new Response(JSON.stringify({
            status: "completed",
            videoUrl: "https://cdn.example.com/talking.mp4",
            durationMs: 2400,
            message: "done",
          }));
        },
      },
    );

    assert.equal(requestBody?.image, "data:image/png;base64,AVATAR");
    assert.equal(requestBody?.text, "欢迎来到星轨画布。");
    assert.equal(requestBody?.mode, "lip-sync");
    assert.equal(requestBody?.audioSource, "text-to-speech");
    assert.deepEqual(result, {
      status: "ready",
      videoUrl: "https://cdn.example.com/talking.mp4",
      durationMs: 2400,
      message: "done",
    });
  });

  void it("returns not-ready deployment guidance without fake success", async () => {
    const result = await requestTalkingPhoto(
      {
        imageUrl: "data:image/png;base64,AVATAR",
        text: "你好",
      },
      {
        imageUrlToBase64Fn: async (url) => url,
        fetchImpl: async () => new Response(JSON.stringify({
          status: "not_ready",
          message: "数字人服务未部署",
          guide: "部署 MuseTalk/SadTalker",
          recommendedNextSteps: ["设置 TALKING_PHOTO_SERVICE_URL"],
        })),
      },
    );

    assert.equal(result.status, "not_ready");
    assert.equal(result.message, "数字人服务未部署");
    assert.deepEqual(result.recommendedNextSteps, ["设置 TALKING_PHOTO_SERVICE_URL"]);
  });

  void it("rejects missing text when no audio input is provided", async () => {
    await assert.rejects(
      () => requestTalkingPhoto(
        { imageUrl: "data:image/png;base64,AVATAR" },
        {
          imageUrlToBase64Fn: async (url) => url,
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof TalkingPhotoError);
        assert.match(error.message, /缺少口播台词/);
        return true;
      },
    );
  });

  void it("normalizes raw base64 video responses to data URLs", async () => {
    const result = await requestTalkingPhoto(
      {
        imageUrl: "data:image/png;base64,AVATAR",
        text: "你好",
      },
      {
        imageUrlToBase64Fn: async (url) => url,
        fetchImpl: async () => new Response(JSON.stringify({
          status: "completed",
          videoBase64: "VIDEO_BASE64",
        })),
      },
    );

    assert.equal(result.status, "ready");
    assert.equal(result.videoUrl, "data:video/mp4;base64,VIDEO_BASE64");
  });

  void it("rejects non-image avatar inputs before calling the API", async () => {
    await assert.rejects(
      () => requestTalkingPhoto(
        { imageUrl: "blob:http://localhost/video", text: "hello" },
        {
          imageUrlToBase64Fn: async () => "data:video/webm;base64,VIDEO",
          fetchImpl: async () => {
            throw new Error("fetch should not be called");
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof TalkingPhotoError);
        assert.match(error.message, /只支持图片头像输入/);
        return true;
      },
    );
  });
});
