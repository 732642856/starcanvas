import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AssetKind } from "@prisma/client"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import { extname, join } from "path"
import { PrismaService } from "../../prisma/prisma.service"

export type UploadedAssetKind = "image" | "video" | "audio" | "document" | "unknown"

export type UploadedAssetPayload = {
  id: string
  projectId?: string
  kind: UploadedAssetKind
  originalName: string
  fileName: string
  mimeType: string
  size: number
  storagePath: string
  url: string
  uploadedAt: string
}

export type RegisterRemoteAssetInput = {
  projectId?: string
  kind: Exclude<UploadedAssetKind, "unknown">
  originalName: string
  fileName?: string
  mimeType: string
  size?: number
  storagePath?: string
  url: string
}

const documentMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
])

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".md"])
const maxUploadSize = 100 * 1024 * 1024

@Injectable()
export class AssetsService {
  private readonly uploadRoot = join(process.cwd(), "uploads")

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async saveUpload(file: Express.Multer.File, input: { projectId?: string } = {}): Promise<UploadedAssetPayload> {
    if (!file) {
      throw new BadRequestException("Missing uploaded file")
    }

    if (file.size > maxUploadSize) {
      throw new BadRequestException("File is larger than 100MB")
    }

    const originalName = this.normalizeOriginalName(file.originalname)
    const kind = this.detectAssetKind(file.mimetype, originalName)
    if (kind === "unknown") {
      throw new BadRequestException("Unsupported file type")
    }
    if (input.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true },
      })
      if (!project) {
        throw new NotFoundException("Project not found")
      }
    }

    const id = randomUUID()
    const extension = this.getSafeExtension(originalName, file.mimetype)
    const fileName = `${id}${extension}`
    const targetDir = join(this.uploadRoot, kind)
    const targetPath = join(targetDir, fileName)

    await mkdir(targetDir, { recursive: true })
    await writeFile(targetPath, file.buffer)
    const url = this.buildPublicUrl(kind, fileName)
    const asset = await this.prisma.asset.create({
      data: {
        id,
        projectId: input.projectId,
        kind: this.toAssetKind(kind),
        originalName,
        fileName,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: targetPath,
        url,
      },
    })

    return {
      id: asset.id,
      projectId: asset.projectId ?? undefined,
      kind,
      originalName,
      fileName,
      mimeType: file.mimetype,
      size: file.size,
      storagePath: targetPath,
      url,
      uploadedAt: asset.createdAt.toISOString(),
    }
  }

  async registerRemoteAsset(input: RegisterRemoteAssetInput): Promise<UploadedAssetPayload> {
    if (input.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true },
      })
      if (!project) {
        throw new NotFoundException("Project not found")
      }
    }
    const id = randomUUID()
    const fileName = input.fileName || `${id}${this.getSafeExtension(input.originalName, input.mimeType)}`
    const asset = await this.prisma.asset.create({
      data: {
        id,
        projectId: input.projectId,
        kind: this.toAssetKind(input.kind),
        originalName: input.originalName,
        fileName,
        mimeType: input.mimeType,
        size: input.size ?? 0,
        storagePath: input.storagePath ?? input.url,
        url: input.url,
      },
    })
    return {
      id: asset.id,
      projectId: asset.projectId ?? undefined,
      kind: input.kind,
      originalName: asset.originalName,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.size,
      storagePath: asset.storagePath,
      url: asset.url,
      uploadedAt: asset.createdAt.toISOString(),
    }
  }

  detectAssetKind(mimeType: string, originalName: string): UploadedAssetKind {
    if (mimeType.startsWith("image/")) return "image"
    if (mimeType.startsWith("video/")) return "video"
    if (mimeType.startsWith("audio/")) return "audio"
    if (documentMimeTypes.has(mimeType)) return "document"

    const extension = extname(originalName).toLowerCase()
    if (allowedExtensions.has(extension)) return "document"

    return "unknown"
  }

  private normalizeOriginalName(originalName: string) {
    if (!originalName) return "untitled"
    const utf8Name = Buffer.from(originalName, "latin1").toString("utf8")
    const candidate = utf8Name.includes("�") ? originalName : utf8Name
    return candidate.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").trim() || "untitled"
  }

  private getSafeExtension(originalName: string, mimeType: string) {
    const extension = extname(originalName).toLowerCase()
    if (extension && /^[a-z0-9.]+$/.test(extension)) return extension

    if (mimeType === "image/png") return ".png"
    if (mimeType === "image/jpeg") return ".jpg"
    if (mimeType === "image/webp") return ".webp"
    if (mimeType === "video/mp4") return ".mp4"
    if (mimeType === "audio/mpeg") return ".mp3"
    if (mimeType === "audio/wav") return ".wav"
    if (mimeType === "application/pdf") return ".pdf"
    if (mimeType === "text/plain") return ".txt"
    if (mimeType === "text/markdown") return ".md"

    return ""
  }

  private buildPublicUrl(kind: UploadedAssetKind, fileName: string) {
    const configuredPublicUrl = this.config.get<string>("PUBLIC_API_URL")
    const apiPort = this.config.get<string>("API_PORT") ?? "4000"
    const baseUrl = configuredPublicUrl ?? `http://localhost:${apiPort}`
    return `${baseUrl}/uploads/${kind}/${fileName}`
  }

  private toAssetKind(kind: UploadedAssetKind): AssetKind {
    if (kind === "image") return AssetKind.IMAGE
    if (kind === "video") return AssetKind.VIDEO
    if (kind === "audio") return AssetKind.AUDIO
    if (kind === "document") return AssetKind.DOCUMENT
    return AssetKind.UNKNOWN
  }
}
