import type { ResourceRef } from "../../contracts/resource.ts"
import type {
  ArtifactInput,
  ArtifactRecord,
  ArtifactVersion,
  ArtifactVersionInput,
  AssetPort,
} from "../../ports/asset-port.ts"

export type AssetStoreErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "DUPLICATE_ARTIFACT"
  | "HEAD_VERSION_CONFLICT"
  | "INVALID_APPROVAL_REF"
  | "INVALID_VERSION_STATE"
  | "UNSUPPORTED_RESOURCE_REF"
  | "PROJECT_MISMATCH"
  | "STALE_CANDIDATE_VERSION"

export class AssetStoreError extends Error {
  readonly code: AssetStoreErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: AssetStoreErrorCode, details?: Record<string, unknown>) {
    super(code)
    this.name = "AssetStoreError"
    this.code = code
    this.details = details === undefined ? undefined : clone(details)
  }
}

const ARTIFACT_REF = /^asset:\/\/artifacts\/([^/]+)$/
const VERSION_REF = /^asset:\/\/artifacts\/([^/]+)\/versions\/(\d+)$/

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class InMemoryAssetAdapter implements AssetPort {
  private readonly artifacts = new Map<string, ArtifactRecord>()

  async resolve<T = ArtifactRecord | ArtifactVersion>(ref: ResourceRef): Promise<T | null> {
    const versionMatch = VERSION_REF.exec(ref)
    if (versionMatch !== null) {
      const artifact = this.artifacts.get(versionMatch[1])
      const version = artifact?.versions.find((item) => item.version === Number(versionMatch[2]))
      return version === undefined ? null : clone(version) as T
    }

    const artifactMatch = ARTIFACT_REF.exec(ref)
    if (artifactMatch !== null) {
      const artifact = this.artifacts.get(artifactMatch[1])
      return artifact === undefined ? null : clone(artifact) as T
    }

    throw new AssetStoreError("UNSUPPORTED_RESOURCE_REF", { ref })
  }

  async putArtifact(input: ArtifactInput): Promise<ArtifactRecord> {
    if (this.artifacts.has(input.id)) {
      throw new AssetStoreError("DUPLICATE_ARTIFACT", { artifactId: input.id })
    }
    const record: ArtifactRecord = {
      ...clone(input),
      headVersion: 0,
      versions: [],
      links: [],
    }
    this.artifacts.set(record.id, record)
    return clone(record)
  }

  async createCandidateVersion(
    artifactId: string,
    input: ArtifactVersionInput,
    expectedHeadVersion?: number,
  ): Promise<ArtifactVersion> {
    const artifact = this.requireArtifact(artifactId)
    if (expectedHeadVersion !== undefined) {
      this.requireExpectedHead(artifact, expectedHeadVersion)
    }
    const version: ArtifactVersion = {
      ...clone(input),
      version: artifact.versions.length + 1,
      status: "candidate",
    }
    artifact.versions.push(version)
    return clone(version)
  }

  async promoteVersion(
    artifactId: string,
    version: number,
    approvalRef: ResourceRef,
    expectedHeadVersion: number,
  ): Promise<ArtifactVersion> {
    const artifact = this.requireArtifact(artifactId)
    this.requireExpectedHead(artifact, expectedHeadVersion)
    if (!approvalRef.startsWith("review://")) {
      throw new AssetStoreError("INVALID_APPROVAL_REF", { approvalRef })
    }
    const stored = this.requireVersion(artifact, version)
    this.requireCandidate(artifactId, stored)
    if (version < artifact.headVersion) {
      throw new AssetStoreError("STALE_CANDIDATE_VERSION", {
        artifactId,
        version,
        headVersion: artifact.headVersion,
      })
    }
    stored.status = "promoted"
    stored.approvalRef = approvalRef
    artifact.headVersion = version
    return clone(stored)
  }

  async rejectVersion(
    artifactId: string,
    version: number,
    reason: string,
  ): Promise<ArtifactVersion> {
    const artifact = this.requireArtifact(artifactId)
    const stored = this.requireVersion(artifact, version)
    this.requireCandidate(artifactId, stored)
    stored.status = "rejected"
    stored.rejectionReason = reason
    return clone(stored)
  }

  async rollbackByNewVersion(
    artifactId: string,
    version: number,
    expectedHeadVersion: number,
  ): Promise<ArtifactVersion> {
    const artifact = this.requireArtifact(artifactId)
    this.requireExpectedHead(artifact, expectedHeadVersion)
    const source = this.requireVersion(artifact, version)
    if (source.status !== "promoted" || version === artifact.headVersion) {
      throw new AssetStoreError("INVALID_VERSION_STATE", {
        artifactId,
        version,
        expected: "old promoted",
        actual: source.status,
      })
    }
    const {
      approvalRef: _approvalRef,
      rejectionReason: _rejectionReason,
      rollbackOf: _rollbackOf,
      rollbackLineage: _rollbackLineage,
      ...input
    } = source
    const rollback: ArtifactVersion = {
      ...clone(input),
      version: artifact.versions.length + 1,
      status: "promoted",
      rollbackOf: version,
      rollbackLineage: [...(source.rollbackLineage ?? []), version],
    }
    artifact.versions.push(rollback)
    artifact.headVersion = rollback.version
    return clone(rollback)
  }

  async linkAssets(artifactId: string, linkedArtifactId: string): Promise<ArtifactRecord> {
    const artifact = this.requireArtifact(artifactId)
    const linkedArtifact = this.requireArtifact(linkedArtifactId)
    if (artifact.projectId !== linkedArtifact.projectId) {
      throw new AssetStoreError("PROJECT_MISMATCH", {
        artifactId,
        artifactProjectId: artifact.projectId,
        linkedArtifactId,
        linkedArtifactProjectId: linkedArtifact.projectId,
      })
    }
    if (!artifact.links.includes(linkedArtifactId)) artifact.links.push(linkedArtifactId)
    return clone(artifact)
  }

  private requireArtifact(artifactId: string): ArtifactRecord {
    const artifact = this.artifacts.get(artifactId)
    if (artifact === undefined) {
      throw new AssetStoreError("ARTIFACT_NOT_FOUND", { artifactId })
    }
    return artifact
  }

  private requireVersion(artifact: ArtifactRecord, version: number): ArtifactVersion {
    const stored = artifact.versions.find((item) => item.version === version)
    if (stored === undefined) {
      throw new AssetStoreError("VERSION_NOT_FOUND", { artifactId: artifact.id, version })
    }
    return stored
  }

  private requireExpectedHead(artifact: ArtifactRecord, expectedHeadVersion: number): void {
    if (artifact.headVersion !== expectedHeadVersion) {
      throw new AssetStoreError("HEAD_VERSION_CONFLICT", {
        artifactId: artifact.id,
        expectedHeadVersion,
        actualHeadVersion: artifact.headVersion,
      })
    }
  }

  private requireCandidate(artifactId: string, version: ArtifactVersion): void {
    if (version.status !== "candidate") {
      throw new AssetStoreError("INVALID_VERSION_STATE", {
        artifactId,
        version: version.version,
        expected: "candidate",
        actual: version.status,
      })
    }
  }
}
