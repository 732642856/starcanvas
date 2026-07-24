import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildJianyingCompatiblePackage } from "./jianyingDraftExport.ts";

describe("buildJianyingCompatiblePackage", () => {
  it("rejects a shot whose video URL has no completed durable asset id", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/mp4" }),
    })) as typeof fetch;
    try {
      await assert.rejects(
        () =>
          buildJianyingCompatiblePackage(
            [
              {
                id: "shot-1",
                title: "Shot 1",
                videoUrl: "https://temporary/video.mp4",
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
            [],
            [],
          ),
        /completed durable video asset/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

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
                videoAssetId: "asset-missing-video",
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
            videoAssetId: "asset-video",
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

      const draft = JSON.parse(
        await zip.file("JianYingCompatible/draft_content.json")!.async("string"),
      ) as {
        materials: {
          videos: Record<string, { path: string }>;
          audios: Record<string, { path: string }>;
        };
        tracks: Array<{ segments: Array<{ materialId: string }> }>;
      };
      const videoMaterialIds = Object.keys(draft.materials.videos);
      const audioMaterialIds = Object.keys(draft.materials.audios);
      assert.equal(videoMaterialIds.length, 1);
      assert.equal(audioMaterialIds.length, 1);
      assert.equal(draft.materials.videos[videoMaterialIds[0]]?.path, "/absolute/path/to/video.mp4");
      assert.equal(draft.materials.audios[audioMaterialIds[0]]?.path, "/absolute/path/to/audio.mp3");
      assert.ok(entryNames.includes("JianYingCompatible/videos/video.mp4"));
      assert.ok(entryNames.includes("JianYingCompatible/audios/audio.mp3"));

      const referencedMaterialIds = new Set(
        draft.tracks.flatMap((track) => track.segments.map((segment) => segment.materialId)),
      );
      assert.ok(referencedMaterialIds.has(videoMaterialIds[0]));
      assert.ok(referencedMaterialIds.has(audioMaterialIds[0]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deduplicates colliding exported media file names and keeps draft paths aligned", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        blob: async () =>
          new Blob([new Uint8Array(url.includes("audio") ? [4, 5, 6] : [0, 1, 2, 3])], {
            type: url.includes("audio") ? "audio/mpeg" : "video/mp4",
          }),
      } as Response;
    }) as typeof fetch;

    try {
      const pkg = await buildJianyingCompatiblePackage(
        [
          {
            id: "video-1",
            title: "视频 1",
            videoUrl: "https://cdn.example.com/video-a.mp4",
            videoAssetId: "asset-video-a",
            durationSeconds: 3,
            width: 1280,
            height: 720,
            fileName: "same.mp4",
          },
          {
            id: "video-2",
            title: "视频 2",
            videoUrl: "https://cdn.example.com/video-b.mp4",
            videoAssetId: "asset-video-b",
            durationSeconds: 3,
            width: 1280,
            height: 720,
            fileName: "same.mp4",
          },
        ],
        [
          {
            id: "audio-1",
            title: "音频 1",
            audioUrl: "https://cdn.example.com/audio-a.mp3",
            durationSeconds: 3,
            fileName: "voice.mp3",
          },
          {
            id: "audio-2",
            title: "音频 2",
            audioUrl: "https://cdn.example.com/audio-b.mp3",
            durationSeconds: 3,
            fileName: "voice.mp3",
          },
        ],
        [],
      );

      const zip = await JSZip.loadAsync(pkg.zipBuffer);
      const entryNames = Object.keys(zip.files).sort();
      assert.ok(entryNames.includes("JianYingCompatible/videos/same.mp4"));
      assert.ok(entryNames.includes("JianYingCompatible/videos/same-2.mp4"));
      assert.ok(entryNames.includes("JianYingCompatible/audios/voice.mp3"));
      assert.ok(entryNames.includes("JianYingCompatible/audios/voice-2.mp3"));

      const draft = JSON.parse(
        await zip.file("JianYingCompatible/draft_content.json")!.async("string"),
      ) as {
        materials: {
          videos: Record<string, { path: string }>;
          audios: Record<string, { path: string }>;
        };
      };
      assert.deepEqual(
        Object.values(draft.materials.videos).map((material) => material.path).sort(),
        ["/absolute/path/to/same-2.mp4", "/absolute/path/to/same.mp4"],
      );
      assert.deepEqual(
        Object.values(draft.materials.audios).map((material) => material.path).sort(),
        ["/absolute/path/to/voice-2.mp3", "/absolute/path/to/voice.mp3"],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sanitizes exported media file names for handoff zip paths", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        blob: async () =>
          new Blob([new Uint8Array(url.includes("audio") ? [4, 5, 6] : [0, 1, 2, 3])], {
            type: url.includes("audio") ? "audio/mpeg" : "video/mp4",
          }),
      } as Response;
    }) as typeof fetch;

    try {
      const pkg = await buildJianyingCompatiblePackage(
        [
          {
            id: "video-1",
            title: "非法文件名视频",
            videoUrl: "https://cdn.example.com/%E6%B5%8B%E8%AF%95%20fallback.mp4",
            videoAssetId: "asset-video-bad-name",
            durationSeconds: 3,
            width: 1280,
            height: 720,
            fileName: "bad:/\\*?\"<>|name",
          },
          {
            id: "video-2",
            title: "URL fallback 视频",
            videoUrl: "https://cdn.example.com/%E6%B5%8B%E8%AF%95%20fallback.mp4",
            videoAssetId: "asset-video-url-fallback",
            durationSeconds: 3,
            width: 1280,
            height: 720,
          },
        ],
        [
          {
            id: "audio-1",
            title: "保留名音频",
            audioUrl: "https://cdn.example.com/audio-a.mp3",
            durationSeconds: 3,
            fileName: "CON",
          },
        ],
        [],
      );

      const zip = await JSZip.loadAsync(pkg.zipBuffer);
      const entryNames = Object.keys(zip.files).sort();
      assert.ok(entryNames.includes("JianYingCompatible/videos/bad_name.mp4"));
      assert.ok(entryNames.includes("JianYingCompatible/videos/测试 fallback.mp4"));
      assert.ok(entryNames.includes("JianYingCompatible/audios/CON_.mp3"));

      const draft = JSON.parse(
        await zip.file("JianYingCompatible/draft_content.json")!.async("string"),
      ) as {
        materials: {
          videos: Record<string, { path: string }>;
          audios: Record<string, { path: string }>;
        };
      };
      assert.deepEqual(
        Object.values(draft.materials.videos).map((material) => material.path).sort(),
        ["/absolute/path/to/bad_name.mp4", "/absolute/path/to/测试 fallback.mp4"],
      );
      assert.deepEqual(
        Object.values(draft.materials.audios).map((material) => material.path),
        ["/absolute/path/to/CON_.mp3"],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the fallback video name for data URLs instead of embedding the payload in the path", async () => {
    const pkg = await buildJianyingCompatiblePackage(
      [{
        id: "video-data-url",
        title: "Mock 视频",
        videoUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
        videoAssetId: "asset-video-data-url",
        durationSeconds: 1,
        width: 1280,
        height: 720,
        startOffsetSeconds: 0,
        volume: 1,
        scale: 1,
        transformX: 0,
        transformY: 0,
        rotation: 0,
      }],
      [],
      [],
    );

    const zip = await JSZip.loadAsync(pkg.zipBuffer);
    assert.ok(zip.file("JianYingCompatible/videos/video_1.mp4"));
  });
});
