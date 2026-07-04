import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractAudioNodesFromCanvas,
  extractSubtitleNodesFromCanvas,
  extractVideoNodesFromCanvas,
} from "./jianyingDraftExport.ts";

describe("jianyingDraftExport canvas extraction", () => {
  it("extracts video, independent TTS audio, and SRT subtitle nodes created by the production queue", () => {
    const nodes = [
      {
        id: "video-1",
        data: {
          title: "PQ镜头 1 视频",
          nodeKind: "video-result",
          resultUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
          duration: "3s",
          videoWidth: 1280,
          videoHeight: 720,
          videoFps: 24,
        },
      },
      {
        id: "audio-1",
        data: {
          title: "PQ镜头 1 配音",
          nodeKind: "tts-audio",
          audioUrl: "blob:http://localhost/audio-1",
          audioAssetId: "media-audio-1",
          durationSeconds: 3,
          fileName: "PQ镜头 1-voice.wav",
        },
      },
      {
        id: "subtitle-1",
        data: {
          title: "PQ镜头 1 字幕",
          nodeKind: "subtitle-srt",
          srtContent: "1\n00:00:00,000 --> 00:00:03,000\n今天的阳光真好。",
          segments: [{ index: 1, start: 0, end: 3, text: "今天的阳光真好。" }],
        },
      },
    ];

    const videos = extractVideoNodesFromCanvas(nodes);
    const audios = extractAudioNodesFromCanvas(nodes);
    const subtitles = extractSubtitleNodesFromCanvas(nodes);

    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.title, "PQ镜头 1 视频");
    assert.equal(videos[0]?.videoUrl, "data:image/svg+xml,%3Csvg%3E%3C/svg%3E");
    assert.equal(videos[0]?.durationSeconds, 3);

    assert.equal(audios.length, 1);
    assert.equal(audios[0]?.title, "PQ镜头 1 配音");
    assert.equal(audios[0]?.audioUrl, "blob:http://localhost/audio-1");
    assert.equal(audios[0]?.durationSeconds, 3);
    assert.equal(audios[0]?.fileName, "PQ镜头 1-voice.wav");

    assert.equal(subtitles.length, 1);
    assert.equal(subtitles[0]?.title, "PQ镜头 1 字幕");
    assert.equal(subtitles[0]?.segments[0]?.text, "今天的阳光真好。");
  });

  it("keeps exporting legacy shot voiceAudioUrl nodes", () => {
    const audios = extractAudioNodesFromCanvas([
      {
        id: "shot-1",
        data: {
          title: "镜头 1",
          shot: {
            voiceAudioUrl: "blob:http://localhost/legacy-shot-audio",
            voiceConfig: { text: "旧链路配音" },
          },
        },
      },
    ]);

    assert.equal(audios.length, 1);
    assert.equal(audios[0]?.id, "shot-1");
    assert.equal(audios[0]?.audioUrl, "blob:http://localhost/legacy-shot-audio");
  });

  it("extracts video nodes from assetUrl and imageUrl fallbacks used by preflight", () => {
    const videos = extractVideoNodesFromCanvas([
      {
        id: "video-asset",
        data: {
          title: "上传视频",
          nodeKind: "uploaded-video",
          assetUrl: "blob:http://localhost/uploaded-video",
          videoDurationMs: 2400,
          fileName: "uploaded.mp4",
        },
      },
      {
        id: "video-image-fallback",
        data: {
          title: "图片占位视频",
          nodeKind: "video-result",
          imageUrl: "https://cdn.example.com/fallback.mp4",
          duration: "4s",
        },
      },
    ]);

    assert.equal(videos.length, 2);
    assert.equal(videos[0]?.videoUrl, "blob:http://localhost/uploaded-video");
    assert.equal(videos[0]?.durationSeconds, 2.4);
    assert.equal(videos[0]?.fileName, "uploaded.mp4");
    assert.equal(videos[1]?.videoUrl, "https://cdn.example.com/fallback.mp4");
    assert.equal(videos[1]?.durationSeconds, 4);
  });

  it("extracts subtitle nodes from srtContent and text fallbacks used by preflight", () => {
    const subtitles = extractSubtitleNodesFromCanvas([
      {
        id: "subtitle-srt-only",
        data: {
          title: "仅 SRT 字幕",
          nodeKind: "subtitle-srt",
          srtContent: "1\n00:00:00,000 --> 00:00:02,000\n第一句。",
        },
      },
      {
        id: "subtitle-text-only",
        data: {
          title: "仅文本字幕",
          nodeKind: "subtitle-srt",
          text: "第二句。",
          durationSeconds: 3,
        },
      },
    ]);

    assert.equal(subtitles.length, 2);
    assert.equal(
      subtitles[0]?.srtContent,
      "1\n00:00:00,000 --> 00:00:02,000\n第一句。",
    );
    assert.equal(subtitles[0]?.segments[0]?.text, "第一句。");
    assert.equal(subtitles[1]?.segments[0]?.text, "第二句。");
    assert.equal(subtitles[1]?.segments[0]?.endSeconds, 3);
  });

  it("accepts numeric duration values produced by shot planning bridge flows", () => {
    const videos = extractVideoNodesFromCanvas([
      {
        id: "shot-planning-image-1",
        data: {
          title: "镜头 1 图",
          nodeKind: "ai-generated-image",
          imageUrl: "data:image/png;base64,AAAA",
          duration: 5,
          fileName: "video_1.mp4",
        },
      },
    ]);

    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.title, "镜头 1 图");
    assert.equal(videos[0]?.durationSeconds, 5);
    assert.equal(videos[0]?.fileName, "video_1.mp4");
  });
});
