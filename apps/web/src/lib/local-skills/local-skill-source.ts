import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  LocalSkillMetadata,
  LocalSkillRiskFlag,
  LocalSkillSourceId,
} from "./contracts.ts";

const SKILL_FILE_NAME = "SKILL.md";
const METADATA_READ_BYTES = 16 * 1024;

const DEFAULT_SOURCE_ROOTS: Record<LocalSkillSourceId, string> = {
  codex: ".codex/skills",
  agents: ".agents/skills",
  workbuddy: ".workbuddy/skills",
};

export type LocalSkillSourceOptions = {
  homeDirectory?: string;
  sourceRoots?: Partial<Record<LocalSkillSourceId, string>>;
};

export class LocalSkillSourceError extends Error {
  readonly code: "LOCAL_SKILL_NOT_FOUND" | "LOCAL_SKILL_PATH_REJECTED" | "LOCAL_SKILL_CHANGED";

  constructor(
    code: "LOCAL_SKILL_NOT_FOUND" | "LOCAL_SKILL_PATH_REJECTED" | "LOCAL_SKILL_CHANGED",
    message: string,
  ) {
    super(message);
    this.name = "LocalSkillSourceError";
    this.code = code;
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function compactText(value: string, limit: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return Array.from(compacted).slice(0, limit).join("");
}

function frontmatterValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}:\\s*[\"']?([^\\n\"']+)[\"']?\\s*$`, "mi"));
  return match?.[1]?.trim();
}

function parseTags(text: string, source: LocalSkillSourceId, relativePath: string): string[] {
  const frontmatter = frontmatterValue(text, "tags")
    ?.replace(/[\[\]]/g, "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase()) ?? [];
  const pathTags = path.dirname(relativePath)
    .split(path.sep)
    .filter((part) => part && part !== ".")
    .map((part) => part.toLowerCase());
  return [...new Set([source, ...frontmatter, ...pathTags])].slice(0, 12);
}

function detectRiskFlags(text: string): LocalSkillRiskFlag[] {
  const flags: LocalSkillRiskFlag[] = [];
  if (/ignore (all |any |the )?(previous|system)|override (the )?system|reveal (your )?(prompt|instructions)/i.test(text)) {
    flags.push("prompt-injection-pattern");
  }
  if (/\.env\b|api[_ -]?key|access[_ -]?token|read (all|the) (files|home)|run (this )?(script|command)|curl\b|npm install/i.test(text)) {
    flags.push("sensitive-access-pattern");
  }
  return flags;
}

function parseMetadataPreview(text: string, source: LocalSkillSourceId, relativePath: string): Pick<LocalSkillMetadata, "name" | "description" | "tags" | "riskFlags"> {
  const heading = text.match(/^#\s+(.+)$/m)?.[1];
  const name = compactText(frontmatterValue(text, "name") || heading || path.basename(path.dirname(relativePath)) || "Unnamed Skill", 120);
  const description = compactText(
    frontmatterValue(text, "description")
      || text.split("\n").find((line) => line.trim() && !line.trim().startsWith("#") && !line.trim().startsWith("---"))
      || "No description provided.",
    360,
  );
  return {
    name,
    description,
    tags: parseTags(text, source, relativePath),
    riskFlags: detectRiskFlags(text),
  };
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
  });
}

async function readPrefix(filePath: string, maxBytes: number): Promise<string> {
  const file = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await file.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

export class LocalSkillSource {
  private readonly homeDirectory: string;
  private readonly sourceRoots: Record<LocalSkillSourceId, string>;

  constructor(options: LocalSkillSourceOptions = {}) {
    this.homeDirectory = options.homeDirectory || homedir();
    this.sourceRoots = Object.fromEntries(
      Object.entries(DEFAULT_SOURCE_ROOTS).map(([source, relativeRoot]) => [
        source,
        options.sourceRoots?.[source as LocalSkillSourceId]
          || path.join(this.homeDirectory, relativeRoot),
      ]),
    ) as Record<LocalSkillSourceId, string>;
  }

  async index(): Promise<LocalSkillMetadata[]> {
    const indexed = await Promise.all(
      (Object.keys(this.sourceRoots) as LocalSkillSourceId[]).map((source) => this.indexSource(source)),
    );
    return indexed.flat().sort((a, b) => a.skillId.localeCompare(b.skillId));
  }

  async readContent(metadata: LocalSkillMetadata, maxChars: number): Promise<string> {
    const filePath = await this.resolveMetadataPath(metadata);
    const current = await stat(filePath);
    if (current.size !== metadata.sizeBytes || current.mtimeMs !== metadata.updatedAtMs) {
      throw new LocalSkillSourceError("LOCAL_SKILL_CHANGED", "Local Skill changed after indexing. Refresh the registry before using it.");
    }
    const maxBytes = Math.max(1, maxChars) * 4 + 4;
    const content = await readPrefix(filePath, maxBytes);
    return Array.from(content).slice(0, Math.max(0, maxChars)).join("");
  }

  private async indexSource(source: LocalSkillSourceId): Promise<LocalSkillMetadata[]> {
    const configuredRoot = path.resolve(this.sourceRoots[source]);
    const root = await realpath(configuredRoot).catch(() => null);
    if (!root) return [];

    const candidates = await this.findSkillFiles(root, root);
    return Promise.all(candidates.map((filePath) => this.createMetadata(source, root, filePath)));
  }

  private async findSkillFiles(root: string, currentDirectory: string): Promise<string[]> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.findSkillFiles(root, candidate));
      } else if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
        const resolved = await realpath(candidate);
        if (isWithin(root, resolved)) files.push(resolved);
      }
    }
    return files;
  }

  private async createMetadata(source: LocalSkillSourceId, root: string, filePath: string): Promise<LocalSkillMetadata> {
    const relativePath = path.relative(root, filePath);
    const file = await stat(filePath);
    const prefix = await readPrefix(filePath, METADATA_READ_BYTES);
    const parsed = parseMetadataPreview(prefix, source, relativePath);
    const relativeDirectory = toPosixPath(path.dirname(relativePath));
    return {
      skillId: `local:${source}:${relativeDirectory === "." ? "root" : relativeDirectory}`,
      source,
      relativePath: toPosixPath(relativePath),
      updatedAt: file.mtime.toISOString(),
      updatedAtMs: file.mtimeMs,
      sizeBytes: file.size,
      contentHash: await hashFile(filePath),
      ...parsed,
    };
  }

  private async resolveMetadataPath(metadata: LocalSkillMetadata): Promise<string> {
    const root = await realpath(path.resolve(this.sourceRoots[metadata.source])).catch(() => null);
    if (!root || path.basename(metadata.relativePath) !== SKILL_FILE_NAME) {
      throw new LocalSkillSourceError("LOCAL_SKILL_PATH_REJECTED", "Local Skill path is outside the fixed allowlist.");
    }
    const requested = path.resolve(root, metadata.relativePath);
    if (!isWithin(root, requested)) {
      throw new LocalSkillSourceError("LOCAL_SKILL_PATH_REJECTED", "Local Skill path is outside the fixed allowlist.");
    }
    const link = await lstat(requested).catch(() => null);
    if (!link || link.isSymbolicLink()) {
      throw new LocalSkillSourceError("LOCAL_SKILL_NOT_FOUND", "Local Skill is unavailable.");
    }
    const resolved = await realpath(requested);
    if (!isWithin(root, resolved)) {
      throw new LocalSkillSourceError("LOCAL_SKILL_PATH_REJECTED", "Local Skill path is outside the fixed allowlist.");
    }
    return resolved;
  }
}
