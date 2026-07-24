import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  importProjectPackageToCanvas,
  isProjectPackageJsonFile,
} from "./projectPackageImport.ts";

describe("importProjectPackageToCanvas", () => {
  it("restores nodes, edges, and viewport from a StarCanvas project package", () => {
    const result = importProjectPackageToCanvas({
      schema: "startrails-project-package/v1",
      projectName: "测试项目",
      assets: [
        { id: "video-asset-1", dataUrl: "data:video/mp4;base64,AAAA" },
        { id: "audio-asset-1", dataUrl: "data:audio/mpeg;base64,BBBB" },
      ],
      canvas: {
        viewport: { x: -120, y: -80, zoom: 0.75 },
        nodes: [
          {
            id: "video-1",
            type: "video",
            position: { x: 10, y: 20 },
            data: {
              title: "镜头视频",
              nodeKind: "uploaded-video",
              assetId: "video-asset-1",
              persistence: "indexeddb",
              loadError: "asset-not-found",
            },
          },
          {
            id: "audio-1",
            type: "audio",
            position: { x: 360, y: 20 },
            data: {
              title: "旁白",
              nodeKind: "tts-audio",
              audioAssetId: "audio-asset-1",
              durationSeconds: 4,
            },
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "video-1",
            target: "audio-1",
            type: "smoothstep",
            animated: true,
          },
        ],
      },
    });

    assert.equal(result.projectName, "测试项目");
    assert.deepEqual(result.viewport, { x: -120, y: -80, zoom: 0.75 });
    assert.deepEqual(result.assets, [
      { id: "video-asset-1", dataUrl: "data:video/mp4;base64,AAAA" },
      { id: "audio-asset-1", dataUrl: "data:audio/mpeg;base64,BBBB" },
    ]);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes[0]?.id, "video-1");
    assert.equal(result.nodes[0]?.type, "video");
    assert.deepEqual(result.nodes[0]?.position, { x: 10, y: 20 });
    assert.equal(result.nodes[0]?.data.assetId, "video-asset-1");
    assert.equal(result.nodes[0]?.data.persistence, "indexeddb");
    assert.equal(result.nodes[0]?.data.assetUrl, "data:video/mp4;base64,AAAA");
    assert.equal(result.nodes[0]?.data.resultUrl, "data:video/mp4;base64,AAAA");
    assert.equal((result.nodes[1]?.data as any).audioAssetId, "audio-asset-1");
    assert.equal((result.nodes[1]?.data as any).audioUrl, "data:audio/mpeg;base64,BBBB");
    assert.equal(result.edges[0]?.source, "video-1");
    assert.equal(result.edges[0]?.target, "audio-1");
  });

  it("recovers invalid node positions instead of importing invisible nodes", () => {
    const result = importProjectPackageToCanvas({
      schema: "startrails-project-package/v1",
      canvas: {
        nodes: [
          {
            id: "node-without-position",
            type: "default",
            position: { x: Number.NaN, y: Number.NaN },
            data: { title: "无坐标节点", nodeKind: "text" },
          },
        ],
        edges: [],
      },
    });

    assert.deepEqual(result.nodes[0]?.position, { x: 120, y: 120 });
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /位置无效/);
  });

  it("rejects non project-package json", () => {
    assert.throws(
      () => importProjectPackageToCanvas({ schema: "other-schema", canvas: {} }),
      /不是有效的星轨项目包/,
    );
  });

  it("recognizes project package json files for drag-and-drop import", () => {
    assert.equal(
      isProjectPackageJsonFile(new File(["{}"], "startrails-project-2026-06-23.json", { type: "" })),
      true,
    );
    assert.equal(
      isProjectPackageJsonFile(new File(["{}"], "package.dat", { type: "application/json" })),
      true,
    );
    assert.equal(
      isProjectPackageJsonFile(new File(["story"], "story.txt", { type: "text/plain" })),
      false,
    );
  });

  it("keeps generated shot image linkage pointing at imported image node metadata", () => {
    const result = importProjectPackageToCanvas({
      schema: "startrails-project-package/v1",
      projectName: "分镜首图回写项目",
      canvas: {
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "shot-1",
            type: "shot",
            position: { x: 10, y: 20 },
            data: {
              title: "镜头 1",
              nodeKind: "shot",
              shot: {
                id: "shot-1",
                order: 1,
                title: "镜头 1",
                visualPrompt: "cinematic opening frame",
                generatedImageNodeId: "image-node-1",
                generatedImageAssetId: "image-asset-1",
                generatedImageUrl: "blob:http://localhost/generated-image",
              },
            },
          },
          {
            id: "image-node-1",
            type: "image",
            position: { x: 420, y: 20 },
            data: {
              title: "镜头 1 图片",
              nodeKind: "ai-generated-image",
              imageUrl: "blob:http://localhost/generated-image",
              assetId: "image-asset-1",
              persistence: "indexeddb",
              sourceType: "shot",
              sourceShotId: "shot-1",
            },
          },
        ],
        edges: [
          {
            id: "edge-generated-image-shot-1-image-node-1",
            source: "shot-1",
            target: "image-node-1",
            type: "creative",
            data: { relation: "generated-image" },
          },
        ],
      },
    });

    const shotNode = result.nodes.find((node) => node.id === "shot-1");
    const imageNode = result.nodes.find((node) => node.id === "image-node-1");

    assert.ok(shotNode);
    assert.ok(imageNode);
    assert.equal(shotNode.data.shot?.generatedImageNodeId, imageNode.id);
    assert.equal(shotNode.data.shot?.generatedImageAssetId, imageNode.data.assetId);
    assert.equal(shotNode.data.shot?.generatedImageUrl, undefined);
    assert.equal(imageNode.data.imageUrl, undefined);
    assert.equal(imageNode.data.assetId, "image-asset-1");
    assert.equal(imageNode.data.persistence, "indexeddb");
    assert.equal(result.edges[0]?.source, "shot-1");
    assert.equal(result.edges[0]?.target, "image-node-1");
  });

  it("restores project package asset bytes back onto imported image and shot nodes", () => {
    const result = importProjectPackageToCanvas({
      schema: "startrails-project-package/v1",
      version: 1,
      assets: [
        { id: "image-asset-1", dataUrl: "data:image/png;base64,AAAA" },
      ],
      canvas: {
        nodes: [
          {
            id: "shot-1",
            type: "shot",
            position: { x: 0, y: 0 },
            data: {
              nodeKind: "shot",
              title: "镜头 1",
              shot: {
                id: "shot-1",
                order: 1,
                title: "镜头 1",
                generatedImageNodeId: "image-node-1",
                generatedImageAssetId: "image-asset-1",
              },
            },
          },
          {
            id: "image-node-1",
            type: "image",
            position: { x: 400, y: 0 },
            data: {
              nodeKind: "ai-generated-image",
              title: "镜头 1 图片",
              assetId: "image-asset-1",
              generatedImageUrl: "https://e2e.invalid/stale-generated-image.png",
              persistence: "indexeddb",
            },
          },
        ],
        edges: [],
      },
    });

    const shotNode = result.nodes.find((node) => node.id === "shot-1");
    const imageNode = result.nodes.find((node) => node.id === "image-node-1");
    assert.equal(shotNode?.data.shot?.generatedImageUrl, "data:image/png;base64,AAAA");
    assert.equal(imageNode?.data.imageUrl, "data:image/png;base64,AAAA");
    assert.equal(imageNode?.data.resultUrl, "data:image/png;base64,AAAA");
    assert.equal(imageNode?.data.generatedImageUrl, "data:image/png;base64,AAAA");
    assert.equal(imageNode?.data.persistence, "indexeddb");
  });
});
