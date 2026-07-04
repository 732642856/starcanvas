import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildJianyingCompatiblePackage } from "./jianyingDraftExport.ts";

describe("buildJianyingCompatiblePackage", () => {
  it("fails clearly when requested media files cannot be fetched", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      blob: async () => new Blob([]),
    })) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          buildJianyingCompatiblePackage(
            [
              {
                id: "video-1",
                title: "丢失视频",
                videoUrl: "https://cdn.example.com/missing-video.mp4",
                durationSeconds: 3,
                width: 1280,
                height: 720,
                startOffsetSeconds: 0,
                volume: 1,
                scale: 1,
                transformX: 0,
                transformY: 0,
                rotation: 0,
              },
            ],
            [
              {
                id: "audio-1",
                title: "丢失配音",
                audioUrl: "https://cdn.example.com/missing-voice.wav",
                durationSeconds: 3,
                startOffsetSeconds: 0,
                volume: 1,
              },
            ],
            [],
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /剪映兼容包素材下载失败/);
          assert.match(error.message, /丢失视频/);
          assert.match(error.message, /丢失配音/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("produces a readable zip that contains all declared files", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(".mp4")) {
        return {
          ok: true,
          blob: async () => new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/mp4" }),
        } as Response;
      }
      return {
        ok: true,
        blob: async () => new Blob([new Uint8Array([4, 5, 6])], { type: "audio/mpeg" }),
      } as Response;
    }) as typeof fetch;

    try {
      const pkg = await buildJianyingCompatiblePackage(
        [
          {
            id: "video-1",
            title: "测试视频",
            videoUrl: "https://cdn.example.com/video.mp4",
            durationSeconds: 3,
            width: 1280,
            height: 720,
            startOffsetSeconds: 0,
            volume: 1,
            scale: 1,
            transformX: 0,
            transformY: 0,
            rotation: 0,
            fileName: "video.mp4",
          },
        ],
        [
          {
            id: "audio-1",
            title: "测试音频",
            audioUrl: "https://cdn.example.com/audio.mp3",
            durationSeconds: 3,
            startOffsetSeconds: 0,
            volume: 1,
            fileName: "audio.mp3",
          },
        ],
        [
          {
            id: "subtitle-1",
            title: "测试字幕",
            segments: [{ startSeconds: 0, endSeconds: 3, text: "hello" }],
            srtContent: "1\n00:00:00,000 --> 00:00:03,000\nhello",
          },
        ],
      );

      const zip = await JSZip.loadAsync(pkg.zipBuffer);
      const entryNames = Object.keys(zip.files).sort();

      assert.deepEqual(
        entryNames,
        [
          "JianYingCompatible/",
          "JianYingCompatible/README.txt",
          "JianYingCompatible/audios/",
          "JianYingCompatible/audios/audio.mp3",
          "JianYingCompatible/draft_content.json",
          "JianYingCompatible/subtitles.srt",
          "JianYingCompatible/videos/",
          "JianYingCompatible/videos/video.mp4",
        ],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
