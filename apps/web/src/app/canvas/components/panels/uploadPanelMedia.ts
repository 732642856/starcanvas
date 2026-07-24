import { isProjectPackageJsonFile } from "../../utils/projectPackageImport.ts";

export const UPLOAD_PANEL_MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
export const UPLOAD_PANEL_MAX_VIDEO_SIZE = 500 * 1024 * 1024;

export const UPLOAD_PANEL_ACCEPT = [
  ".docx",
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "application/json",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "video/*",
].join(",");

export type UploadPanelFileKind = "document" | "video" | "project-package" | "unsupported";

export type UploadPanelFileClassification = {
  kind: UploadPanelFileKind;
  reason?: string;
};

function isSupportedDocumentFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    ext === "docx" ||
    ext === "pdf" ||
    ext === "txt" ||
    ext === "md" ||
    ext === "markdown" ||
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type === "text/x-markdown"
  );
}

export function classifyUploadPanelFile(file: File): UploadPanelFileClassification {
  if (isProjectPackageJsonFile(file)) {
    if (file.size > UPLOAD_PANEL_MAX_DOCUMENT_SIZE) {
      return { kind: "unsupported", reason: "项目包过大，限制 50MB" };
    }
    return { kind: "project-package" };
  }

  if (file.type.startsWith("video/")) {
    if (file.size > UPLOAD_PANEL_MAX_VIDEO_SIZE) {
      return { kind: "unsupported", reason: "视频过大，限制 500MB" };
    }
    return { kind: "video" };
  }

  if (isSupportedDocumentFile(file)) {
    if (file.size > UPLOAD_PANEL_MAX_DOCUMENT_SIZE) {
      return { kind: "unsupported", reason: "文件过大，限制 50MB" };
    }
    return { kind: "document" };
  }

  return { kind: "unsupported", reason: "不支持的文件格式" };
}
