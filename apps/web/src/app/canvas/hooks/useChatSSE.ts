// ============================================================================
// useChatSSE - Hook for Server-Sent Events streaming chat
// ============================================================================
"use client"

import { useCallback, useRef, useState } from "react"

// ============================================================================
// CANVAS ACTION TYPES — import from canonical source
// ============================================================================
export {
  type ChatCanvasAction,
  type ChatCanvasActionType,
  type CreateNodeAction,
  type UpdateNodeAction,
  type ConnectNodesAction,
  type SelectNodeAction,
  type FocusNodeAction,
  type RunNodeAction,
  type DeleteNodeAction,
  type ApplyActionResult,
  type ApplyActionStatus,
  type ApplyActionsReport,
  extractActionNodeId,
} from "../features/canvas/actions/chatActions"

import type { ChatCanvasAction } from "../features/canvas/actions/chatActions"

// Backward-compat aliases (deprecated — prefer ChatCanvasAction)
/** @deprecated Use ChatCanvasAction from features/canvas/actions/chatActions */
export type CanvasActionType = ChatCanvasAction["action"]
/** @deprecated Use ChatCanvasAction from features/canvas/actions/chatActions */
export type CanvasAction = ChatCanvasAction

/**
 * Parse ```canvas-actions ... ``` blocks from the AI's full response.
 * Returns the actions array, or null if not found / invalid.
 */
export function parseCanvasActions(content: string): ChatCanvasAction[] | null {
  const match = content.match(/```canvas-actions\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (Array.isArray(parsed?.actions)) {
      return parsed.actions as ChatCanvasAction[]
    }
  } catch {
    // ignore JSON parse errors
  }
  return null
}

/**
 * Strip the ```canvas-actions ... ``` block from a message, returning clean text.
 */
export function stripCanvasActions(content: string): string {
  return content.replace(/```canvas-actions[\s\S]*?```/g, "").trim()
}

interface UseChatSSEOptions {
  onMessage?: (content: string) => void
  onComplete?: (fullContent: string) => void
  onError?: (error: Error) => void
  onImageGenerated?: (data: { imageUrl: string; prompt: string; model: string; revisedPrompt?: string }) => void
  onActions?: (actions: ChatCanvasAction[]) => void
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void
}

interface UseChatSSEReturn {
  sendMessage: (message: string, context?: Record<string, any>) => Promise<string>
  isStreaming: boolean
  streamingContent: string
  abort: () => void
}

export function useChatSSE(options: UseChatSSEOptions = {}): UseChatSSEReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsStreaming(false)
    }
  }, [])

  const sendMessage = useCallback(
    async (message: string, context?: Record<string, any>): Promise<string> => {
      // Abort any existing stream
      abort()

      setIsStreaming(true)
      setStreamingContent("")
      let fullContent = ""

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const response = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            model: context?.model ?? "gpt-5.5",
            context: { ...context },
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
          throw new Error("Response body is null")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        // Cross-chunk buffer: prevent SSE JSON lines from being split by TCP framing
        let sseBuffer = ""
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            // Flush remaining buffer
            if (sseBuffer.trim()) {
              const trimmed = sseBuffer.trim()
              if (trimmed.startsWith("data: ")) {
                const data = trimmed.slice(6)
                if (data !== "[DONE]") {
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.content) {
                      fullContent += parsed.content
                      setStreamingContent(fullContent)
                      options.onMessage?.(parsed.content)
                    }
                    if (parsed.usage) {
                      options.onUsage?.(parsed.usage)
                    }
                    if (parsed.type === "image_generated" && parsed.imageUrl) {
                      options.onImageGenerated?.({
                        imageUrl: parsed.imageUrl,
                        prompt: parsed.prompt || "",
                        model: parsed.model || "",
                        revisedPrompt: parsed.revisedPrompt,
                      })
                    }
                    if (parsed.error) {
                      throw new Error(parsed.error)
                    }
                  } catch (e) {
                    console.warn("[SSE] Parse error (final buffer):", e)
                  }
                }
              }
            }
            break
          }

          sseBuffer += decoder.decode(value, { stream: true })
          const lines = sseBuffer.split("\n")
          sseBuffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)

              if (data === "[DONE]") {
                continue
              }

              try {
                const parsed = JSON.parse(data)

                if (parsed.content) {
                  fullContent += parsed.content
                  setStreamingContent(fullContent)
                  options.onMessage?.(parsed.content)
                }

                // Handle usage metadata (token consumption from API)
                if (parsed.usage) {
                  options.onUsage?.(parsed.usage)
                }

                // Handle image generation events
                if (parsed.type === "image_generated" && parsed.imageUrl) {
                  options.onImageGenerated?.({
                    imageUrl: parsed.imageUrl,
                    prompt: parsed.prompt || "",
                    model: parsed.model || "",
                    revisedPrompt: parsed.revisedPrompt,
                  })
                }

                if (parsed.error) {
                  throw new Error(parsed.error)
                }
              } catch (e) {
                // Ignore parse errors for incomplete JSON
                console.warn("[SSE] Parse error:", e)
              }
            }
          }
        }

        setIsStreaming(false)
        options.onComplete?.(fullContent)
        // Parse and fire canvas actions if present
        const actions = parseCanvasActions(fullContent)
        if (actions && actions.length > 0) {
          options.onActions?.(actions)
        }
        return fullContent
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("[SSE] Stream aborted")
        } else {
          console.error("[SSE] Error:", error)
          setIsStreaming(false)
          setStreamingContent("")
          options.onError?.(error)
        }
        throw error
      } finally {
        abortControllerRef.current = null
      }
    },
    [abort, options]
  )

  return {
    sendMessage,
    isStreaming,
    streamingContent,
    abort,
  }
}

export default useChatSSE
