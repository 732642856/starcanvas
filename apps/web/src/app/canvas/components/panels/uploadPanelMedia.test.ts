import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyUploadPanelFile,
  UPLOAD_PANEL_ACCEPT,
  UPLOAD_PANEL_MAX_VIDEO_SIZE,
} from "./uploadPanelMedia.ts";

describe("uploadPanelMedia", () => {
  it("accepts documents and videos in the same picker contract", () => {
    assert.match(UPLOAD_PANEL_ACCEPT, /\.docx/);
    assert.match(UPLOAD_PANEL_ACCEPT, /\.json/);
    assert.match(UPLOAD_PANEL_ACCEPT, /video\/\*/);
  });

  it("classifies text documents, project packages, and video assets separately", () => {
    const documentFile = new File(["hello"], "story.md", { type: "text/markdown" });
    const projectPackageFile = new File(["{}"], "startrails-project.json", { type: "application/json" });
    const videoFile = new File(["video"], "clip.mp4", { type: "video/mp4" });

    assert.equal(classifyUploadPanelFile(documentFile).kind, "document");
    assert.equal(classifyUploadPanelFile(projectPackageFile).kind, "project-package");
    assert.equal(classifyUploadPanelFile(videoFile).kind, "video");
  });

  it("rejects oversized video files before persistence", () => {
    const videoFile = new File(["video"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(videoFile, "size", { value: UPLOAD_PANEL_MAX_VIDEO_SIZE + 1 });

    const result = classifyUploadPanelFile(videoFile);

    assert.equal(result.kind, "unsupported");
    assert.match(result.reason ?? "", /视频过大/);
  });
});
