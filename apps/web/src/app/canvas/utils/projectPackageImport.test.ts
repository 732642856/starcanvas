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
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes[0]?.id, "video-1");
    assert.equal(result.nodes[0]?.type, "video");
    assert.deepEqual(result.nodes[0]?.position, { x: 10, y: 20 });
    assert.equal(result.nodes[0]?.data.assetId, "video-asset-1");
    assert.equal(result.nodes[0]?.data.persistence, "indexeddb");
    assert.equal((result.nodes[1]?.data as any).audioAssetId, "audio-asset-1");
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
});
