"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { Handle, Position, NodeResizer, type NodeProps, useReactFlow } from "@xyflow/react"
import { pushUndo } from "../../StarCanvas"
import { Camera, Loader2, Wand2 } from "lucide-react"
import type { CanvasNodeData } from "../canvas/types"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import {
  getSlashCommandsForTarget,
  parseSlashQuery,
  removeSlashCommandFromText,
  type SlashCommand,
  type SlashQuery,
} from "@/lib/slashCommands/slashCommands"
import { runSlashTextCommand } from "@/lib/slashCommands/runSlashTextCommand"
import {
  appendDefaultCharacterIdentity,
  formatCharacterIdentityListInput,
  summarizeCharacterIdentities,
  updateCharacterIdentityField,
} from "@/lib/storyboard/characterIdentitySummary"
import { InlineSlashCommandMenu } from "../menus/InlineSlashCommandMenu"
import { VoicePanel } from "./VoicePanel"
import { buildVideoPromptDirection } from "@/lib/storyboard/videoPromptDirector"

interface ShotNodeProps extends NodeProps {
  data: CanvasNodeData
}

export const ShotNode = memo(function ShotNode({ id, data, selected, width, height }: ShotNodeProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const [slashQuery, setSlashQuery] = useState<SlashQuery | null>(null)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [slashError, setSlashError] = useState<string | null>(null)
  const [isEditingCharacters, setIsEditingCharacters] = useState(false)
  const shot = data.shot
  const nodeWidth = typeof width === "number" ? width : data.displayWidth || 340
  const nodeHeight = typeof height === "number" ? height : data.displayHeight || 360
  const isGenerating = shot?.status === "generating" || shot?.generationStatus === "generating" || shot?.generationStatus === "retrying"
  const hasGeneratedImage = Boolean(shot?.generatedImageUrl || shot?.generatedImageAssetId || shot?.generatedImageNodeId)
  const generationError = shot?.errorMessage || shot?.generationError
  const canRetry = shot?.generationRetryable !== false
  const hasVisualPrompt = Boolean(shot?.visualPrompt?.trim())
  const showPromptEditor = selected || hasVisualPrompt || Boolean(generationError)
  const videoDirection = useMemo(
    () => buildVideoPromptDirection({
      action: shot?.description?.trim() || shot?.visualPrompt?.trim(),
      shotType: shot?.shotType,
      cameraMovement: shot?.cameraMovement,
      hasReferenceFrame: hasGeneratedImage,
    }),
    [hasGeneratedImage, shot?.cameraMovement, shot?.description, shot?.shotType, shot?.visualPrompt],
  )
  const cinematicShot = shot?.cinematicShot
  const continuityWarnings = shot?.continuityWarnings ?? []
  const videoReferenceWarning = shot?.videoReferenceWarning?.trim()
  const characterSummaries = useMemo(
    () => summarizeCharacterIdentities(shot?.characterIdentities),
    [shot?.characterIdentities],
  )
  const pipelineCharacterBindings = useMemo(() => {
    const bindings = shot?.sourceMeta?.characterBindings
    if (!Array.isArray(bindings)) return []
    return bindings
      .map((binding: any) => ({
        id: String(binding.characterId || binding.name || "").trim(),
        name: String(binding.name || binding.characterId || "").trim(),
        viewSetId: String(binding.viewSetId || "").trim(),
        referenceCount: Array.isArray(binding.referenceAssetIds) ? binding.referenceAssetIds.length : 0,
        faceLock: Boolean(binding.faceLock),
        costumeLock: Boolean(binding.costumeLock),
      }))
      .filter((binding) => binding.id || binding.name)
      .slice(0, 4)
  }, [shot?.sourceMeta])
  const hiddenCharacterCount = Math.max((shot?.characterIdentities?.length ?? 0) - characterSummaries.length, 0)
  const slashCommands = useMemo(
    () => getSlashCommandsForTarget("shot", slashQuery?.query ?? ""),
    [slashQuery],
  )
  const statusLabel = isGenerating
    ? "生成中"
    : shot?.generationStatus === "failed" || shot?.status === "error"
      ? "失败"
      : hasGeneratedImage
        ? "已出图"
        : "待生成"

  const updateShot = useCallback((patch: Partial<NonNullable<CanvasNodeData["shot"]>>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                shot: node.data.shot ? { ...node.data.shot, ...patch } : node.data.shot,
                content: patch.description ?? node.data.content,
                prompt: patch.visualPrompt ?? node.data.prompt,
              },
            }
          : node
      )
    )
  }, [id, setNodes])

  const updateSlashQueryFromTextarea = useCallback((value: string, cursor: number) => {
    const parsed = parseSlashQuery(value, cursor)
    setSlashQuery(parsed)
    setSlashActiveIndex(0)
  }, [])

  const executeSlashCommand = useCallback(async (command: SlashCommand) => {
    const currentQuery = slashQuery
    const currentText = shot?.description || ""
    const cleanedText = currentQuery
      ? removeSlashCommandFromText(currentText, currentQuery.range)
      : currentText

    setSlashQuery(null)
    setSlashError(null)

    if (command.id === "generate-image") {
      updateShot({ description: cleanedText })
      window.dispatchEvent(new CustomEvent("starcanvas:generate-shot", { detail: { nodeId: id } }))
      return
    }

    if (!["summarize", "expand", "rewrite"].includes(command.id)) return

    updateShot({ status: "generating", description: cleanedText })
    try {
      const result = await runSlashTextCommand({
        commandId: command.id as "summarize" | "expand" | "rewrite",
        nodeText: cleanedText,
      })
      updateShot({ description: result, status: "ready", generationStatus: shot?.generationStatus || "idle" })
    } catch (error: any) {
      setSlashError(error?.message || "命令执行失败")
      updateShot({ description: currentText, status: shot?.status || "draft" })
    }
  }, [id, shot?.description, shot?.generationStatus, shot?.status, slashQuery, updateShot])

  const updateCharacterIdentity = useCallback((
    index: number,
    field: "name" | "role" | "visualSignature" | "costume" | "props",
    value: string,
  ) => {
    updateShot({
      characterIdentities: updateCharacterIdentityField(shot?.characterIdentities, index, field, value),
    })
  }, [shot?.characterIdentities, updateShot])

  const addCharacterIdentity = useCallback(() => {
    updateShot({ characterIdentities: appendDefaultCharacterIdentity(shot?.characterIdentities) })
    setIsEditingCharacters(true)
  }, [shot?.characterIdentities, updateShot])

  const removeCharacterIdentity = useCallback((index: number) => {
    const next = [...(shot?.characterIdentities ?? [])]
    next.splice(index, 1)
    updateShot({ characterIdentities: next.length > 0 ? next : undefined })
  }, [shot?.characterIdentities, updateShot])

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slashQuery || slashCommands.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSlashActiveIndex((index) => (index + 1) % slashCommands.length)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSlashActiveIndex((index) =>
        index === 0 ? slashCommands.length - 1 : index - 1,
      )
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      setSlashQuery(null)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const command = slashCommands[slashActiveIndex]
      if (command) executeSlashCommand(command)
    }
  }, [executeSlashCommand, slashActiveIndex, slashCommands, slashQuery])

  return (
    <>
      {selected && (
        <NodeResizer
          minWidth={300}
          minHeight={320}
          handleStyle={{ background: DESIGN_TOKENS.nodeHandle, border: "2px solid rgba(255,255,255,0.3)", borderRadius: "4px" }}
          lineStyle={{ stroke: DESIGN_TOKENS.nodeHandle, strokeWidth: 1.5, strokeDasharray: "6 3" }}
        />
      )}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />

      <div
        className="flex flex-col overflow-hidden rounded-2xl border transition-all"
        style={{
          width: nodeWidth,
          height: nodeHeight,
          minWidth: 300,
          minHeight: 320,
          backgroundColor: DESIGN_TOKENS.panelSolid,
          borderColor: selected ? "rgba(148, 163, 184, 0.4)" : DESIGN_TOKENS.border,
          boxShadow: selected ? DESIGN_TOKENS.shadowNode : "none",
        }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(0,0,0,0.18)" }}>
          <div className="flex items-center gap-2">
            <Camera size={14} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accentHover }} />
            <span className="text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>{shot?.title || data.title || "镜头"}</span>
          </div>
          <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{statusLabel}</span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <div className="flex flex-wrap gap-1.5 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            {shot?.shotType && <span className="max-w-[120px] truncate rounded-md bg-white/5 px-1.5 py-0.5" title={shot.shotType}>{shot.shotType}</span>}
            {shot?.cameraMovement && <span className="max-w-[120px] truncate rounded-md bg-white/5 px-1.5 py-0.5" title={shot.cameraMovement}>{shot.cameraMovement}</span>}
            {shot?.duration && <span className="rounded-md bg-white/5 px-1.5 py-0.5">{shot.duration}</span>}
          </div>

          {(characterSummaries.length > 0 || selected) && (
            <section data-testid="shot-character-identities" className="space-y-2 rounded-xl border p-2" style={{ borderColor: "rgba(168, 85, 247, 0.24)", backgroundColor: "rgba(168, 85, 247, 0.07)" }}>
              <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                <span>角色一致性</span>
                <div className="flex items-center gap-2">
                  <span>{characterSummaries.length}{hiddenCharacterCount > 0 ? ` +${hiddenCharacterCount}` : ""} 个资产</span>
                  {selected && (
                    <button
                      type="button"
                      data-testid="shot-character-edit-toggle"
                      className="nodrag nopan rounded-md border border-purple-200/20 px-1.5 py-0.5 text-[10px] text-purple-100 transition-colors hover:bg-purple-200/10"
                      onClick={() => setIsEditingCharacters((editing) => !editing)}
                    >
                      {isEditingCharacters ? "收起" : "编辑"}
                    </button>
                  )}
                </div>
              </div>

              {characterSummaries.length > 0 ? (
                <div className="space-y-1.5">
                  {characterSummaries.map((character) => (
                    <div key={character.id} className="rounded-lg px-2 py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                      <div data-testid="shot-character-identity-name" className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
                        {character.headline}
                      </div>
                      {character.details.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {character.details.map((detail) => (
                            <span key={detail} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ color: "rgba(233, 213, 255, 0.82)", backgroundColor: "rgba(168, 85, 247, 0.12)" }}>
                              {detail}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg px-2 py-1.5 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted, backgroundColor: "rgba(255,255,255,0.04)" }}>
                  尚未绑定角色资产。添加后会进入多格图角色一致性约束。
                </div>
              )}

              {videoReferenceWarning && (
                <div data-testid="shot-video-reference-warning" className="rounded-lg px-2 py-1.5 text-[11px] leading-relaxed" style={{ color: "rgba(253, 230, 138, 0.92)", backgroundColor: "rgba(245, 158, 11, 0.1)" }}>
                  {videoReferenceWarning}
                </div>
              )}
              {selected && isEditingCharacters && (
                <div data-testid="shot-character-editor" className="space-y-2 rounded-lg border p-2" style={{ borderColor: "rgba(168, 85, 247, 0.18)", backgroundColor: "rgba(15, 23, 42, 0.35)" }}>
                  {(shot?.characterIdentities ?? []).map((identity, index) => (
                    <div key={identity.id || index} className="space-y-1.5 rounded-lg p-2" style={{ backgroundColor: "rgba(255,255,255,0.035)" }}>
                      <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                        <span>角色 {index + 1}</span>
                        <button
                          type="button"
                          className="nodrag nopan rounded-md px-1.5 py-0.5 text-[10px] text-red-200/80 transition-colors hover:bg-red-300/10"
                          onClick={() => removeCharacterIdentity(index)}
                        >
                          移除
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          data-testid="shot-character-name-input"
                          value={identity.name || ""}
                          onChange={(e) => updateCharacterIdentity(index, "name", e.target.value)}
                          className="nodrag nopan rounded-lg border bg-transparent px-2 py-1 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
                          style={{ borderColor: DESIGN_TOKENS.border }}
                          placeholder="角色名"
                        />
                        <input
                          value={identity.role || ""}
                          onChange={(e) => updateCharacterIdentity(index, "role", e.target.value)}
                          className="nodrag nopan rounded-lg border bg-transparent px-2 py-1 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
                          style={{ borderColor: DESIGN_TOKENS.border }}
                          placeholder="角色定位"
                        />
                      </div>
                      <textarea
                        value={identity.visualSignature || ""}
                        onChange={(e) => updateCharacterIdentity(index, "visualSignature", e.target.value)}
                        className="nodrag nopan nowheel w-full resize-none rounded-lg border bg-transparent px-2 py-1 text-[11px] leading-relaxed text-white/75 placeholder:text-white/25 focus:outline-none"
                        style={{ borderColor: DESIGN_TOKENS.border, minHeight: 52 }}
                        placeholder="脸型、发型、身形、标志性特征"
                      />
                      <input
                        value={identity.costume || ""}
                        onChange={(e) => updateCharacterIdentity(index, "costume", e.target.value)}
                        className="nodrag nopan w-full rounded-lg border bg-transparent px-2 py-1 text-[11px] text-white/75 placeholder:text-white/25 focus:outline-none"
                        style={{ borderColor: DESIGN_TOKENS.border }}
                        placeholder="服装 / 造型"
                      />
                      <input
                        value={formatCharacterIdentityListInput(identity.props)}
                        onChange={(e) => updateCharacterIdentity(index, "props", e.target.value)}
                        className="nodrag nopan w-full rounded-lg border bg-transparent px-2 py-1 text-[11px] text-white/75 placeholder:text-white/25 focus:outline-none"
                        style={{ borderColor: DESIGN_TOKENS.border }}
                        placeholder="道具，用顿号或逗号分隔"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    data-testid="shot-character-add"
                    className="nodrag nopan w-full rounded-lg border border-purple-200/20 px-2 py-1 text-[11px] text-purple-100 transition-colors hover:bg-purple-200/10"
                    onClick={addCharacterIdentity}
                  >
                    添加角色资产
                  </button>
                </div>
              )}
            </section>
          )}

          {cinematicShot && (
            <section className="space-y-2 rounded-xl border p-2" style={{ borderColor: "rgba(56, 189, 248, 0.22)", backgroundColor: "rgba(14, 165, 233, 0.06)" }}>
              <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                <span>导演层</span>
                <span>{cinematicShot.emotionalState} · 权重 {cinematicShot.dramaticWeight}</span>
              </div>
              <div className="text-[11px] leading-5" style={{ color: DESIGN_TOKENS.textSecondary }}>
                <div><span className="text-white/45">节拍：</span>{cinematicShot.dramaticBeat}</div>
                <div><span className="text-white/45">动机：</span>{cinematicShot.shotPurpose}</div>
                <div><span className="text-white/45">构图：</span>{cinematicShot.composition}</div>
                <div><span className="text-white/45">调度：</span>{cinematicShot.blocking}</div>
                {cinematicShot.voiceIntent && <div><span className="text-white/45">声画：</span>{cinematicShot.voiceIntent}</div>}
              </div>
              {continuityWarnings.length > 0 && (
                <div className="space-y-1 rounded-lg px-2 py-1.5 text-[10px]" style={{ color: "rgba(253, 230, 138, 0.88)", backgroundColor: "rgba(245, 158, 11, 0.1)" }}>
                  {continuityWarnings.slice(0, 2).map((warning, index) => (
                    <div key={`${warning.type}-${index}`}>{warning.severity}：{warning.message}</div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="relative space-y-1 rounded-xl border p-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center justify-between text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
              <span>1. 剧本文本</span>
              <span>镜头画面原文</span>
            </div>
            <textarea
              value={shot?.description || ""}
              onChange={(e) => {
                updateShot({ description: e.target.value })
                updateSlashQueryFromTextarea(e.target.value, e.target.selectionStart)
              }}
              onKeyDown={handleDescriptionKeyDown}
              onSelect={(e) =>
                updateSlashQueryFromTextarea(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart,
                )
              }
              onFocus={() => {
                pushUndo({ nodes: getNodes(), edges: getEdges() }, "edit-shot")
              }}
              className="nodrag nopan nowheel w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-xs leading-relaxed text-white/80 placeholder:text-white/25 focus:outline-none"
              style={{ borderColor: DESIGN_TOKENS.border, minHeight: 112 }}
              placeholder="镜头画面描述，可输入 / 调用改写、扩写、生成图片"
            />
            {slashQuery && slashCommands.length > 0 && (
              <InlineSlashCommandMenu
                commands={slashCommands}
                activeIndex={slashActiveIndex}
                onSelect={executeSlashCommand}
              />
            )}
            {slashError && (
              <div className="absolute left-3 top-full z-50 mt-2 rounded-lg px-2 py-1 text-[11px] text-red-300" style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
                {slashError}
              </div>
            )}
          </section>

          {showPromptEditor ? (
            <section className="space-y-1 rounded-xl border p-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                <span>2. 生图 Prompt</span>
                <span>优先用于生成；为空时使用剧本文本</span>
              </div>
              <textarea
                value={shot?.visualPrompt || ""}
                onChange={(e) => updateShot({ visualPrompt: e.target.value })}
                onFocus={() => {
                  pushUndo({ nodes: getNodes(), edges: getEdges() }, "edit-shot")
                }}
                className="nodrag nopan nowheel w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-xs leading-relaxed text-white/70 placeholder:text-white/25 focus:outline-none"
                style={{ borderColor: DESIGN_TOKENS.border, minHeight: selected ? 112 : 72 }}
                placeholder="生图提示词，留空时使用剧本文本"
              />
              <div className="space-y-1 rounded-lg border p-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(0,0,0,0.12)" }}>
                <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  <span>视频导演 Prompt</span>
                  <span>{videoDirection.controlPlan.splitShotRecommended ? "建议拆镜 + 白模预演" : videoDirection.controlPlan.whiteboxPrevisRecommended ? "建议白模预演" : "可直接 I2V"}</span>
                </div>
                <textarea
                  data-testid={`shot-video-direction-${id}`}
                  readOnly
                  value={videoDirection.prompt}
                  className="nodrag nopan nowheel w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-[10px] leading-relaxed text-white/60 focus:outline-none"
                  style={{ borderColor: DESIGN_TOKENS.border, minHeight: 82 }}
                />
                {videoDirection.controlPlan.whiteboxPrevisRecommended && (
                  <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    {videoDirection.controlPlan.pose ? "姿态" : ""}{videoDirection.controlPlan.pose && videoDirection.controlPlan.depth ? " + " : ""}{videoDirection.controlPlan.depth ? "深度" : ""} 控制建议先走白模预演。
                  </div>
                )}
                {videoDirection.controlPlan.splitShotRecommended && (
                  <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    检测到连续动作，当前视频只保留第一个动作；后续动作建议拆成下一镜。
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border px-3 py-2 text-[11px] leading-5" style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textMuted, backgroundColor: "rgba(255,255,255,0.02)" }}>
              生图 Prompt 默认使用上方镜头文本。选中节点后可展开编辑。
            </section>
          )}

          {pipelineCharacterBindings.length > 0 && (
            <section className="space-y-2 rounded-xl border p-2" style={{ borderColor: "rgba(168, 85, 247, 0.24)", backgroundColor: "rgba(88, 28, 135, 0.10)" }}>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/45">
                <span>角色锁定</span>
                <span>{pipelineCharacterBindings.length} 个绑定</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pipelineCharacterBindings.map((binding) => (
                  <span
                    key={binding.id || binding.name}
                    className="rounded-full border px-2 py-1 text-[10px]"
                    style={{ borderColor: "rgba(168,85,247,0.28)", color: "#ddd6fe", backgroundColor: "rgba(168,85,247,0.10)" }}
                    title={[
                      binding.viewSetId ? `三视图：${binding.viewSetId}` : "",
                      binding.referenceCount ? `参考资产：${binding.referenceCount}` : "",
                      binding.faceLock ? "脸部锁定" : "",
                      binding.costumeLock ? "服装锁定" : "",
                    ].filter(Boolean).join(" · ")}
                  >
                    {binding.name}
                    {binding.viewSetId ? " · 三视图" : ""}
                    {binding.faceLock || binding.costumeLock ? " · 锁定" : ""}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2 rounded-xl border p-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center justify-between text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
              <span>3. 输出状态</span>
              <span>{statusLabel}</span>
            </div>

            {isGenerating && (
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]" style={{ color: DESIGN_TOKENS.textSecondary, backgroundColor: "rgba(148, 163, 184, 0.08)" }}>
                <Loader2 size={12} className="animate-spin" />
                <span>正在生成图片，最多可能需要 1 分钟；超时会自动转为失败，可重试。</span>
              </div>
            )}

            {generationError && !isGenerating && (
              <div className="space-y-2 rounded-lg px-2 py-1.5 text-[11px] text-amber-200/80" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}>
                <div>生成失败：{generationError}</div>
                {shot?.generationErrorCode && (
                  <div className="text-[10px] text-amber-100/45">错误码：{shot.generationErrorCode}</div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-amber-100/55">
                    {canRetry ? "可以直接重试；如连续失败，再调整 Prompt。" : "请先修改 Prompt 后再重试。"}
                  </span>
                  {canRetry && (
                    <button
                      type="button"
                      className="nodrag nopan rounded-md border border-amber-200/20 px-2 py-0.5 text-[10px] text-amber-100 transition-colors hover:bg-amber-200/10"
                      onClick={() => window.dispatchEvent(new CustomEvent("starcanvas:generate-shot", { detail: { nodeId: id } }))}
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasGeneratedImage && !isGenerating && (
              <div className="space-y-1">
                <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  已生成右侧图片节点{shot?.generatedImageNodeId ? "" : ""}
                </div>
                {shot?.generatedImageUrl && (
                  <div className="overflow-hidden rounded-xl border" style={{ borderColor: DESIGN_TOKENS.border }}>
                    <img src={shot.generatedImageUrl} alt={shot.title || "分镜图片"} className="h-24 w-full object-cover" />
                  </div>
                )}
              </div>
            )}

            {!hasGeneratedImage && !isGenerating && !generationError && (
              <div className="rounded-lg px-2 py-1.5 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted, backgroundColor: "rgba(148, 163, 184, 0.06)" }}>
                尚未生成图片。点击下方按钮后，会在本镜头右侧创建图片节点。
              </div>
            )}
          </section>

          {/* AI 配音面板 */}
          <VoicePanel
            nodeId={id}
            shot={shot}
            dialogue={shot?.dialogue}
            voiceConfig={shot?.voiceConfig}
            voiceAudioUrl={shot?.voiceAudioUrl}
            voiceGenerationStatus={shot?.voiceGenerationStatus}
            voiceGenerationError={shot?.voiceGenerationError}
            onUpdateShot={updateShot}
          />
        </div>

        <div className="shrink-0 flex items-center justify-end border-t px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border }}>
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: DESIGN_TOKENS.textSecondary }}
            disabled={isGenerating}
            onClick={() => window.dispatchEvent(new CustomEvent("starcanvas:generate-shot", { detail: { nodeId: id } }))}
          >
            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            <span>{shot?.generatedImageUrl ? "重新生成" : "生成图片"}</span>
          </button>
        </div>
      </div>
    </>
  )
})

export default ShotNode
