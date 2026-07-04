"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { ImageIcon, Sparkles } from "lucide-react";
import type { CharacterAssetLibraryItem, CharacterAssetLibraryPatch } from "@/lib/storyboard/characterAssetLibrary";
import { formatCharacterIdentityListInput, parseCharacterIdentityListInput } from "@/lib/storyboard/characterIdentitySummary";
import { applyFocusEdit } from "../../utils/focusEditService";
import { CharacterViewPanel as CharacterViewModal } from "./CharacterViewModal";
import { PoseReferenceEditor } from "./PoseReferenceEditor";

// FocusEditPanel uses react-canvas-masker which references browser "self" — load client-side only
const FocusEditPanel = dynamic(
  () => import("./FocusEditPanel").then((mod) => mod.FocusEditPanel),
  { ssr: false },
);

type CharacterAssetLibraryPanelProps = {
  items: CharacterAssetLibraryItem[];
  onClose?: () => void;
  onApplyAssetPatch?: (assetKey: string, patch: CharacterAssetLibraryPatch) => void;
};

type CharacterAssetDraft = {
  name: string;
  role: string;
  visualSignature: string;
  costume: string;
  props: string;
};

function compactDetails(item: CharacterAssetLibraryItem): string[] {
  return [
    item.role ? `定位 ${item.role}` : "",
    item.visualSignature ? `识别 ${item.visualSignature}` : "",
    item.costume ? `服装 ${item.costume}` : "",
    item.props?.length ? `道具 ${item.props.slice(0, 3).join("、")}` : "",
  ].filter(Boolean).slice(0, 4);
}

function getAssetKey(item: CharacterAssetLibraryItem): string {
  return item.referenceAssetId || item.id || item.name;
}

function createDraft(item: CharacterAssetLibraryItem): CharacterAssetDraft {
  return {
    name: item.name || "",
    role: item.role || "",
    visualSignature: item.visualSignature || "",
    costume: item.costume || "",
    props: formatCharacterIdentityListInput(item.props),
  };
}

export function CharacterAssetLibraryPanel({
  items,
  onClose,
  onApplyAssetPatch,
}: CharacterAssetLibraryPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [poseEditorKey, setPoseEditorKey] = useState<string | null>(null);
  const [focusEditKey, setFocusEditKey] = useState<string | null>(null);
  const [characterViewKey, setCharacterViewKey] = useState<string | null>(null);
  const [focusEditStateByKey, setFocusEditStateByKey] = useState<Record<string, { status: "applying" | "error"; message?: string }>>({});
  const [draftByKey, setDraftByKey] = useState<Record<string, CharacterAssetDraft>>({});
  const totalReferences = items.reduce((sum, item) => sum + item.shotCount, 0);

  const startEditing = useCallback((item: CharacterAssetLibraryItem) => {
    const key = getAssetKey(item);
    setEditingKey(key);
    setDraftByKey((drafts) => ({ ...drafts, [key]: createDraft(item) }));
  }, []);

  const updateDraft = useCallback((key: string, field: keyof CharacterAssetDraft, value: string) => {
    setDraftByKey((drafts) => ({
      ...drafts,
      [key]: {
        ...(drafts[key] ?? { name: "", role: "", visualSignature: "", costume: "", props: "" }),
        [field]: value,
      },
    }));
  }, []);

  const applyDraft = useCallback((item: CharacterAssetLibraryItem) => {
    const key = getAssetKey(item);
    const draft = draftByKey[key] ?? createDraft(item);
    onApplyAssetPatch?.(key, {
      name: draft.name,
      role: draft.role,
      visualSignature: draft.visualSignature,
      costume: draft.costume,
      props: parseCharacterIdentityListInput(draft.props),
    });
    setEditingKey(null);
  }, [draftByKey, onApplyAssetPatch]);

  const applyFocusEditToAsset = useCallback(async (
    item: CharacterAssetLibraryItem,
    key: string,
    imgUrl: string,
    maskDataUrl: string,
    prompt: string,
  ) => {
    setFocusEditStateByKey((state) => ({
      ...state,
      [key]: { status: "applying", message: "正在局部精修..." },
    }));

    try {
      const result = await applyFocusEdit({
        imageUrl: imgUrl,
        maskDataUrl,
        prompt,
        sourceAssetId: item.frontViewAssetId,
        requestId: `focus-edit-${key}-${Date.now()}`,
      });
      onApplyAssetPatch?.(key, {
        frontViewUrl: result.imageUrl,
        frontViewAssetId: result.assetId,
      });
      setFocusEditStateByKey((state) => {
        const next = { ...state };
        delete next[key];
        return next;
      });
      setFocusEditKey(null);
    } catch (error: any) {
      setFocusEditStateByKey((state) => ({
        ...state,
        [key]: {
          status: "error",
          message: error?.message || "局部精修失败，请重试。",
        },
      }));
    }
  }, [onApplyAssetPatch]);

  const activeCharacterViewItem = characterViewKey
    ? items.find((item) => getAssetKey(item) === characterViewKey) ?? null
    : null;

  const handleCharacterViewGenerated = useCallback((
    imageUrl: string,
    perspective: "front" | "side" | "back" | "all",
  ) => {
    if (!characterViewKey) return;
    const patch: CharacterAssetLibraryPatch =
      perspective === "front"
        ? { frontViewUrl: imageUrl }
        : perspective === "side"
          ? { sideViewUrl: imageUrl }
          : perspective === "back"
            ? { backViewUrl: imageUrl }
            : {};

    if (Object.keys(patch).length > 0) {
      onApplyAssetPatch?.(characterViewKey, patch);
    }
  }, [characterViewKey, onApplyAssetPatch]);

  return (
    <aside
      className="fixed right-5 top-24 z-40 w-[360px] rounded-2xl border border-purple-300/20 bg-slate-950/90 p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
      data-testid="character-asset-library-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-purple-300/80">
            Character Library
          </div>
          <div className="mt-1 text-base font-semibold text-white">
            全局角色资产库
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {items.length} 个角色资产 · {totalReferences} 个镜头引用
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
            onClick={onClose}
          >
            收起
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-400">
          当前画布还没有角色一致性资产。先从分镜生成或在 ShotNode 中添加角色资产。
        </div>
      ) : (
        <div className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const key = getAssetKey(item);
            const isEditing = editingKey === key;
            const draft = draftByKey[key] ?? createDraft(item);

            return (
              <article
                key={key}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                data-testid="character-asset-library-item"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100" data-testid="character-asset-library-name">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      引用 {item.shotCount} 个镜头
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.referenceAssetId ? (
                      <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] text-purple-200">
                        linked
                      </span>
                    ) : null}
                    {onApplyAssetPatch ? (
                      <button
                        type="button"
                        className="rounded-full border border-purple-200/20 px-2 py-0.5 text-[10px] text-purple-100 transition hover:bg-purple-200/10"
                        data-testid="character-asset-library-edit"
                        onClick={() => isEditing ? setEditingKey(null) : startEditing(item)}
                      >
                        {isEditing ? "取消" : "编辑"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div data-testid="character-asset-library-editor" className="mt-3 space-y-2 rounded-lg border border-purple-200/15 bg-purple-300/5 p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
                        data-testid="character-asset-library-name-input"
                        value={draft.name}
                        onChange={(event) => updateDraft(key, "name", event.target.value)}
                        placeholder="角色名"
                      />
                      <input
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
                        data-testid="character-asset-library-role-input"
                        value={draft.role}
                        onChange={(event) => updateDraft(key, "role", event.target.value)}
                        placeholder="角色定位"
                      />
                    </div>
                    <textarea
                      className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] leading-relaxed text-white/75 placeholder:text-white/25 focus:outline-none"
                      data-testid="character-asset-library-visual-input"
                      value={draft.visualSignature}
                      onChange={(event) => updateDraft(key, "visualSignature", event.target.value)}
                      placeholder="脸型、发型、身形、标志性特征"
                    />
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-white/75 placeholder:text-white/25 focus:outline-none"
                      data-testid="character-asset-library-costume-input"
                      value={draft.costume}
                      onChange={(event) => updateDraft(key, "costume", event.target.value)}
                      placeholder="服装 / 造型"
                    />
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-white/75 placeholder:text-white/25 focus:outline-none"
                      data-testid="character-asset-library-props-input"
                      value={draft.props}
                      onChange={(event) => updateDraft(key, "props", event.target.value)}
                      placeholder="道具，用顿号或逗号分隔"
                    />
                    <button
                      type="button"
                      className="w-full rounded-lg border border-purple-200/20 px-2 py-1 text-[11px] text-purple-100 transition hover:bg-purple-200/10"
                      data-testid="character-asset-library-apply"
                      onClick={() => applyDraft(item)}
                    >
                      同步到 {item.shotCount} 个引用镜头
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {compactDetails(item).map((detail) => (
                        <span
                          key={detail}
                          className="line-clamp-1 max-w-full rounded-md bg-purple-400/10 px-1.5 py-0.5 text-[10px] text-purple-100/85"
                        >
                          {detail}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {[
                        { label: "正面", imageUrl: item.frontViewUrl },
                        { label: "侧面", imageUrl: item.sideViewUrl },
                        { label: "背面", imageUrl: item.backViewUrl },
                      ].map((view) => (
                        <div
                          key={view.label}
                          className="overflow-hidden rounded-lg border"
                          style={{ borderColor: "rgba(148,163,184,0.18)", backgroundColor: "rgba(15,23,42,0.68)" }}
                        >
                          <div className="flex aspect-square items-center justify-center overflow-hidden">
                            {view.imageUrl ? (
                              <img
                                src={view.imageUrl}
                                alt={`${item.name}${view.label}视图`}
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-[10px] text-slate-500">
                                <ImageIcon size={14} />
                                <span>待生成</span>
                              </div>
                            )}
                          </div>
                          <div className="border-t px-1.5 py-1 text-center text-[10px] text-slate-400" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
                            {view.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] text-purple-100 transition hover:bg-purple-200/10"
                      style={{ borderColor: "rgba(196,181,253,0.28)" }}
                      data-testid="character-asset-library-open-character-view"
                      onClick={() => setCharacterViewKey(key)}
                    >
                      <Sparkles size={12} />
                      打开真实三视图生成
                    </button>

                    {/* PoseReferenceEditor — 姿势参考 */}
                    {poseEditorKey === key && (
                      <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "rgba(99,102,241,0.2)", backgroundColor: "rgba(99,102,241,0.04)" }}>
                        <PoseReferenceEditor onPoseData={(data) => {
                          console.log("[PoseReference] Generated pose data:", data)
                          setPoseEditorKey(null)
                        }} />
                      </div>
                    )}

                    {/* FocusEditPanel — 焦点编辑 */}
                    {focusEditKey === key && item.frontViewUrl && (
                      <div className="mt-2">
                        <FocusEditPanel
                          imageUrl={item.frontViewUrl}
                          onApplyEdit={(imgUrl, mask, prompt) => applyFocusEditToAsset(item, key, imgUrl, mask, prompt)}
                          onClose={() => setFocusEditKey(null)}
                          isApplying={focusEditStateByKey[key]?.status === "applying"}
                          errorMessage={focusEditStateByKey[key]?.status === "error" ? focusEditStateByKey[key]?.message : undefined}
                        />
                      </div>
                    )}

                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border px-2 py-0.5 text-[10px] transition-colors hover:bg-white/10"
                        style={{ borderColor: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}
                        onClick={() => setPoseEditorKey(poseEditorKey === key ? null : key)}
                      >
                        {poseEditorKey === key ? "收起姿势" : "姿势参考"}
                      </button>
                      {item.frontViewUrl && (
                        <button
                          type="button"
                          className="rounded-md border px-2 py-0.5 text-[10px] transition-colors hover:bg-white/10"
                          style={{ borderColor: "rgba(168,85,247,0.3)", color: "#d8b4fe" }}
                          onClick={() => setFocusEditKey(focusEditKey === key ? null : key)}
                        >
                          {focusEditKey === key ? "收起" : "焦点编辑"}
                        </button>
                      )}
                    </div>

                    <div className="mt-2 line-clamp-2 text-[11px] text-slate-500">
                      镜头：{item.shotTitles.slice(0, 4).join("、")}{item.shotTitles.length > 4 ? ` 等 ${item.shotTitles.length} 个` : ""}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {activeCharacterViewItem ? (
        <CharacterViewModal
          isOpen={true}
          onClose={() => setCharacterViewKey(null)}
          characterName={activeCharacterViewItem.name}
          characterDescription={[
            activeCharacterViewItem.role,
            activeCharacterViewItem.visualSignature,
            activeCharacterViewItem.costume,
            activeCharacterViewItem.props?.length ? `道具：${activeCharacterViewItem.props.join("、")}` : "",
          ].filter(Boolean).join("，")}
          referenceImageUrl={activeCharacterViewItem.frontViewUrl}
          onImageGenerated={handleCharacterViewGenerated}
        />
      ) : null}
    </aside>
  );
}
