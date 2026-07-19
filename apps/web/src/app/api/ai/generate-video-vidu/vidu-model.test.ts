import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveViduModel } from "./vidu-model.ts";

describe("resolveViduModel", () => {
  it("defaults provider aliases to the q3 turbo text-to-video model", () => {
    assert.equal(resolveViduModel(undefined, "t2v"), "vidu/viduq3-turbo_text2video");
    assert.equal(resolveViduModel("vidu", "t2v"), "vidu/viduq3-turbo_text2video");
    assert.equal(resolveViduModel("dashscope", "t2v"), "vidu/viduq3-turbo_text2video");
  });

  it("normalizes family aliases and route aliases to image-driven endpoint models", () => {
    assert.equal(resolveViduModel("viduq3-turbo", "i2v"), "vidu/viduq3-turbo_img2video");
    assert.equal(resolveViduModel("vidu-q2-pro-t2v", "i2v"), "vidu/viduq2-pro_img2video");
  });

  it("keeps the same model family when switching between text and image modes", () => {
    assert.equal(
      resolveViduModel("vidu/viduq3-pro_text2video", "i2v"),
      "vidu/viduq3-pro_img2video",
    );
    assert.equal(
      resolveViduModel("vidu/viduq2-turbo_img2video", "t2v"),
      "vidu/viduq2-turbo_text2video",
    );
  });

  it("defaults start-end mode to the image model family and leaves unknown models unchanged", () => {
    assert.equal(resolveViduModel(undefined, "start-end"), "vidu/viduq3-turbo_img2video");
    assert.equal(resolveViduModel("custom-vidu-model", "t2v"), "custom-vidu-model");
  });

  it("resolves Vidu reference-video models without falling back to text-to-video", () => {
    assert.equal(resolveViduModel(undefined, "r2v"), "vidu/viduq3-turbo_reference2video");
    assert.equal(resolveViduModel("viduq3-turbo", "r2v"), "vidu/viduq3-turbo_reference2video");
    assert.equal(
      resolveViduModel("vidu/viduq3-drama_reference2video", "r2v"),
      "vidu/viduq3-drama_reference2video",
    );
  });
});
