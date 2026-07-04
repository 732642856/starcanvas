import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoProviderDryRunPlan,
  getVideoProviderCapability,
  listVideoProviderCapabilities,
  resolveVideoProviderId,
} from "./video-provider-capabilities.ts";

describe("video-provider-capabilities", () => {
  it("lists production video providers without constructing runtime clients", () => {
    const ids = listVideoProviderCapabilities().map((capability) => capability.id);

    assert.deepEqual(
      ids,
      ["vidu", "seedance", "kling", "runway", "openai-sora", "ltx-video", "mock"],
    );
    assert.equal(getVideoProviderCapability("vidu")?.implementationStatus, "implemented");
    assert.equal(getVideoProviderCapability("vidu")?.evidenceLevel, "local-implementation");
    assert.equal(getVideoProviderCapability("sora-2-pro")?.id, "openai-sora");
  });

  it("resolves common provider and model aliases", () => {
    assert.equal(resolveVideoProviderId("dashscope"), "vidu");
    assert.equal(resolveVideoProviderId("vidu-q3-turbo-i2v"), "vidu");
    assert.equal(resolveVideoProviderId("vidu/viduq3-turbo_img2video"), "vidu");
    assert.equal(resolveVideoProviderId("gen4_turbo"), "runway");
    assert.equal(resolveVideoProviderId("doubao-seedance-2-0"), "seedance");
    assert.equal(resolveVideoProviderId("unknown"), undefined);
  });

  it("tracks the Vidu route-supported endpoint model family", () => {
    const capability = getVideoProviderCapability("vidu");

    assert.ok(capability);
    assert.equal(capability.supportsEndFrame, true);
    assert.equal(capability.maxReferenceImages, 7);
    assert.deepEqual(
      capability.models,
      [
        "viduq3-turbo",
        "viduq3-pro",
        "viduq3-pro-fast",
        "viduq3",
        "viduq3-mix",
        "viduq2",
        "viduq2-pro",
        "viduq2-pro-fast",
        "viduq2-turbo",
        "viduq1",
        "viduq1-classic",
        "vidu2.0",
      ],
    );
  });

  it("accepts the current Vidu image-to-video contract", () => {
    const plan = buildVideoProviderDryRunPlan({
      providerId: "vidu",
      mode: "image-to-video",
      prompt: "slow cinematic push-in through mist, soft backlight",
      imageUrl: "https://example.com/frame.png",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.normalized.providerId, "vidu");
    assert.equal(plan.normalized.model, "viduq3-turbo");
    assert.equal(plan.execution.willCallNetwork, false);
  });

  it("blocks mismatched provider route before real video request is attempted", () => {
    const plan = buildVideoProviderDryRunPlan({
      providerId: "runway",
      model: "vidu",
      mode: "image-to-video",
      prompt: "slow cinematic push-in through mist, soft backlight",
      imageUrl: "https://example.com/frame.png",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.issues.some((issue) => issue.code === "unsupported-provider-route"), true);
    assert.match(
      plan.issues.find((issue) => issue.code === "unsupported-provider-route")?.message ?? "",
      /Vidu|路由|DashScope/,
    );
  });

  it("accepts Vidu start/end-frame plans covered by the local route and ArcReel reference", () => {
    const plan = buildVideoProviderDryRunPlan({
      providerId: "vidu-q3-turbo-i2v",
      mode: "image-to-video",
      prompt: "slow cinematic push-in through mist, soft backlight",
      startFrameUrl: "https://example.com/start.png",
      endFrameUrl: "https://example.com/end.png",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "1080p",
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.issues.some((issue) => issue.code === "unsupported-end-frame"), false);
  });

  it("blocks image-to-video requests that do not have an image", () => {
    const plan = buildVideoProviderDryRunPlan({
      providerId: "vidu",
      mode: "image-to-video",
      prompt: "slow cinematic push-in through mist, soft backlight",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.issues.some((issue) => issue.code === "missing-image"), true);
  });

  it("blocks unsupported duration, aspect ratio and resolution before calling a provider", () => {
    const plan = buildVideoProviderDryRunPlan({
      providerId: "vidu",
      mode: "image-to-video",
      prompt: "slow cinematic push-in through mist, soft backlight",
      imageUrl: "https://example.com/frame.png",
      durationSeconds: 20,
      aspectRatio: "4:3",
      resolution: "4k",
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.issues.some((issue) => issue.code === "unsupported-duration"), true);
    assert.equal(plan.issues.some((issue) => issue.code === "unsupported-aspect-ratio"), true);
    assert.equal(plan.issues.some((issue) => issue.code === "unsupported-resolution"), true);
  });

  it("keeps Sora as a dry-run-only provider with official Videos API semantics", () => {
    const plan = buildVideoProviderDryRunPlan({
      providerId: "sora-2-pro",
      mode: "image-to-video",
      prompt: "wide tracking shot, character walks through lantern-lit street, rain reflections",
      imageUrl: "https://example.com/reference.webp",
      durationSeconds: 20,
      aspectRatio: "9:16",
      resolution: "1080p",
      characterIds: ["char-a", "char-b", "char-c"],
    });

    assert.equal(plan.normalized.providerId, "openai-sora");
    assert.equal(plan.provider?.supportsBatch, true);
    assert.equal(plan.provider?.evidenceLevel, "official-doc");
    assert.equal(plan.issues.some((issue) => issue.code === "backend-not-implemented"), true);
    assert.equal(plan.issues.some((issue) => issue.code === "too-many-characters"), true);
    assert.equal(plan.ok, false);
  });

  it("requires explicit opt-in for mock video plans", () => {
    const blocked = buildVideoProviderDryRunPlan({
      providerId: "mock",
      mode: "image-to-video",
      prompt: "local preview motion",
      imageUrl: "data:image/png;base64,frame",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    });
    const allowed = buildVideoProviderDryRunPlan({
      providerId: "mock",
      mode: "image-to-video",
      prompt: "local preview motion",
      imageUrl: "data:image/png;base64,frame",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      allowMock: true,
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.issues.some((issue) => issue.code === "mock-disabled"), true);
    assert.equal(allowed.ok, true);
  });
});
