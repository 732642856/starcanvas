/**
 * useChatAttachments - Chat 输入框附件管理
 */

import { useCallback, useState, type ChangeEvent } from "react"
import { generateId } from "../utils/generateId"
import { parseDocument } from "../utils/fileParser"

export interface ChatAttachment {
  id: string
  type: "image" | "video" | "audio" | "file"
  file?: File // Optional for AI-generated images that don't have a File object
  src: string
  assetId?: string
  name: string
  size: number
  mimeType: string
  width?: number
  height?: number
  /** 文档文件解析后的文本内容 */
  textContent?: string
}

const MAX_FILE_SIZE = 80 * 1024 * 1024 // 80MB

function getAttachmentType(file: File): ChatAttachment["type"] {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return "file"
}

export function useChatAttachments() {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  // 添加附件
  const addAttachments = useCallback((files: File[]) => {
    setError(null)

    // 文档类文件先异步解析文本，解析完成后才加入列表
    const documentFiles: File[] = []
    const immediateFiles: File[] = []

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setError("文件过大，请控制在 80MB 以内")
        continue
      }
      const type = getAttachmentType(file)
      if (type === "file") {
        documentFiles.push(file)
      } else {
        immediateFiles.push(file)
      }
    }

    // 立即添加媒体类附件（图片、视频、音频）
    for (const file of immediateFiles) {
      const src = URL.createObjectURL(file)
      const type = getAttachmentType(file)

      if (type !== "image") {
        // 视频、音频直接加入
        setAttachments((prev) => [
          ...prev,
          {
            id: generateId(),
            type,
            file,
            src,
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
          },
        ])
        continue
      }

      // 图片需等待 Image 加载后获取尺寸
      const img = new Image()
      img.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            id: generateId(),
            type: "image",
            file,
            src,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            width: img.naturalWidth,
            height: img.naturalHeight,
          },
        ])
      }
      img.onerror = () => {
        URL.revokeObjectURL(src)
        setError("图片读取失败，请换一张再试")
      }
      img.src = src
    }

    // 异步解析文档类文件，解析完成后再加入列表
    if (documentFiles.length > 0) {
      setIsParsing(true)
      Promise.allSettled(
        documentFiles.map(async (file) => {
          try {
            const src = URL.createObjectURL(file)
            const result = await parseDocument(file)
            return {
              id: generateId(),
              type: "file" as const,
              file,
              src,
              name: file.name,
              size: file.size,
              mimeType: file.type || "application/octet-stream",
              textContent: result.text.slice(0, 12000),
            } satisfies ChatAttachment
          } catch {
            // 解析失败则以无文本内容的形式加入
            const src = URL.createObjectURL(file)
            return {
              id: generateId(),
              type: "file" as const,
              file,
              src,
              name: file.name,
              size: file.size,
              mimeType: file.type || "application/octet-stream",
            } satisfies ChatAttachment
          }
        }),
      ).then((results) => {
        const parsed: ChatAttachment[] = []
        for (const r of results) {
          if (r.status === "fulfilled") parsed.push(r.value)
        }
        setAttachments((prev) => [...prev, ...parsed])
        setIsParsing(false)
      })
    }
  }, [])

  // 删除附件
  const removeAttachment = useCallback(
    (id: string) => {
      setAttachments((prev) => {
        const removed = prev.find((a) => a.id === id)
        if (removed) {
          URL.revokeObjectURL(removed.src)
        }
        return prev.filter((a) => a.id !== id)
      })
    },
    []
  )

  // 清除所有附件
  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => URL.revokeObjectURL(a.src))
    setAttachments([])
  }, [attachments])

  // 处理文件选择
  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        addAttachments(files)
      }
      // 重置 input
      e.target.value = ""
    },
    [addAttachments]
  )

  // 处理拖拽到输入框
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const files = Array.from(e.dataTransfer.files)

      if (files.length > 0) {
        addAttachments(files)
      }
    },
    [addAttachments]
  )

  return {
    attachments,
    error,
    isParsing,
    addAttachments,
    removeAttachment,
    clearAttachments,
    handleFileSelect,
    handleDragOver,
    handleDrop,
    setError,
  }
}
