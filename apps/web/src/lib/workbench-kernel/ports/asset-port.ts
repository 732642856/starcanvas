import type { ResourceRef } from "../contracts/resource.ts"

export type ArtifactVersionStatus = "candidate" | "promoted" | "rejected"

export interface ArtifactInput {
  id: string
  type: string
  projectId: string
  metadata?: Record<string, unknown>
}

export interface ArtifactVersionInput {
  contentRef: ResourceRef
  inputRefs?: ResourceRef[]
  runId?: string
  qualityRef?: ResourceRef
  metadata?: Record<string, unknown>
}

export interface ArtifactVersion extends ArtifactVersionInput {
  version: number
  status: ArtifactVersionStatus
  approvalRef?: ResourceRef
  rejectionReason?: string
  rollbackOf?: number
  rollbackLineage?: number[]
}

export interface ArtifactRecord extends ArtifactInput {
  headVersion: number
  versions: ArtifactVersion[]
  links: string[]
}

export interface AssetPort {
  resolve<T = ArtifactRecord | ArtifactVersion>(ref: ResourceRef): Promise<T | null>
  putArtifact(input: ArtifactInput): Promise<ArtifactRecord>
  createCandidateVersion(
    artifactId: string,
    input: ArtifactVersionInput,
    expectedHeadVersion?: number,
  ): Promise<ArtifactVersion>
  promoteVersion(
    artifactId: string,
    version: number,
    approvalRef: ResourceRef,
    expectedHeadVersion: number,
  ): Promise<ArtifactVersion>
  rejectVersion(artifactId: string, version: number, reason: string): Promise<ArtifactVersion>
  rollbackByNewVersion(
    artifactId: string,
    version: number,
    expectedHeadVersion: number,
  ): Promise<ArtifactVersion>
  linkAssets(artifactId: string, linkedArtifactId: string): Promise<ArtifactRecord>
}
