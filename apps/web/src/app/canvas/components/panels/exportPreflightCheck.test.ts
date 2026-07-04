import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExportPreflightType,
  runExportPreflightCheck,
} from "./exportPreflightCheck.ts";

describe("runExportPreflightCheck", () => {
  it("flags missing local video and audio assets even when stale runtime urls remain", () => {
    const checks = runExportPreflightCheck([
      {
        id: "video-1",
        type: "video",
        data: {
          title: "丢失的视频",
          nodeKind: "uploaded-video",
          resultUrl: "blob:http://localhost/stale-video",
          persistence: "missing",
          loadError: "asset-not-found",
        },
      },
      {
        id: "audio-1",
        type: "audio",
        data: {
          title: "丢失的配音",
          nodeKind: "tts-audio",
          audioUrl: "blob:http://localhost/stale-audio",
          audioAssetId: "voice-asset-1",
          loadError: "asset-not-found",
        },
      },
    ]);

    const video = checks.find((check) => check.nodeId === "video-1");
    const audio = checks.find((check) => check.nodeId === "audio-1");

    assert.equal(video?.hasContent, false);
    assert.equal(video?.missingReason, "本地视频资产缺失，请重新上传或重新生成");
    assert.equal(audio?.hasContent, false);
    assert.equal(audio?.missingReason, "本地音频资产缺失，请重新生成配音或重新上传音频");
  });

  it("accepts production subtitle text fallback", () => {
    const checks = runExportPreflightCheck([
      {
        id: "subtitle-1",
        data: {
          title: "生产队列字幕",
          nodeKind: "subtitle-srt",
          text: "1\n00:00:00,000 --> 00:00:03,000\n今天的阳光真好。",
        },
      },
    ]);

    assert.equal(checks.length, 1);
    assert.equal(checks[0]?.type, "subtitle");
    assert.equal(checks[0]?.hasContent, true);
  });

  it("keeps ready remote media nodes available", () => {
    const checks = runExportPreflightCheck([
      {
        id: "video-remote",
        data: {
          title: "远端视频",
          nodeKind: "video-result",
          resultUrl: "https://cdn.example.com/video.mp4",
        },
      },
      {
        id: "audio-remote",
        data: {
          title: "远端音频",
          nodeKind: "tts-audio",
          audioUrl: "https://cdn.example.com/voice.wav",
        },
      },
    ]);

    assert.deepEqual(
      checks.map((check) => [check.nodeId, check.hasContent]),
      [
        ["video-remote", true],
        ["audio-remote", true],
      ],
    );
  });

  it("checks nodes outside timeline order after ordered timeline nodes", () => {
    const checks = runExportPreflightCheck(
      [
        {
          id: "audio-outside-timeline",
          data: {
            title: "时间线外配音",
            nodeKind: "tts-audio",
            audioUrl: "blob:http://localhost/audio",
          },
        },
        {
          id: "video-in-timeline",
          data: {
            title: "时间线视频",
            nodeKind: "video-result",
            resultUrl: "https://cdn.example.com/video.mp4",
          },
        },
      ],
      ["video-in-timeline"],
    );

    assert.deepEqual(
      checks.map((check) => check.nodeId),
      ["video-in-timeline", "audio-outside-timeline"],
    );
  });
});

describe("normalizeExportPreflightType", () => {
  it("keeps zip requests from toolbar entry points", () => {
    assert.equal(normalizeExportPreflightType("zip"), "zip");
    assert.equal(normalizeExportPreflightType("json"), "json");
  });

  it("falls back to json for missing or invalid values", () => {
    assert.equal(normalizeExportPreflightType(undefined), "json");
    assert.equal(normalizeExportPreflightType("other"), "json");
  });
});
