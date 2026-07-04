"use client";

import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Clapperboard, Palette, Save, Sparkles, UserRound, X, ImageIcon } from "lucide-react";
import type { CharacterAssetLibraryItem, CharacterAssetLibraryPatch } from "@/lib/storyboard/characterAssetLibrary";
import { formatCharacterIdentityListInput, parseCharacterIdentityListInput } from "@/lib/storyboard/characterIdentitySummary";
import { CharacterViewPanel as CharacterViewModal } from "../canvas/CharacterViewModal";
import { DESIGN_TOKENS } from "../../styles/designSystem";

export type ProjectSceneBibleItem = {
  id: string;
  sceneNumber?: number;
  location: string;
  timeOfDay?: string;
  characters: string[];
  summary?: string;
  atmosphere?: string;
  lightingStyle?: string;
  colorPalette?: string[];
  shotCount: number;
  shotTitles: string[];
};

export type ProjectSceneBiblePatch = Partial<Pick<
  ProjectSceneBibleItem,
  "location" | "timeOfDay" | "summary" | "atmosphere" | "lightingStyle" | "colorPalette"
>>;

export type ProjectVisualBible = {
  name: string;
  description: string;
  colorPalette: string[];
  lightingStyle: string;
  cameraNotes: string;
  aspectRatio: string;
  stylePrompt: string;
  sourceCount: number;
};

export type ProjectVisualBiblePatch = Partial<Pick<
  ProjectVisualBible,
  "name" | "description" | "colorPalette" | "lightingStyle" | "cameraNotes" | "aspectRatio" | "stylePrompt"
>>;

type ProjectBiblePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  characterItems: CharacterAssetLibraryItem[];
  sceneItems: ProjectSceneBibleItem[];
  visualBible: ProjectVisualBible;
  onApplyCharacterPatch: (assetKey: string, patch: CharacterAssetLibraryPatch) => void;
  onApplyScenePatch: (sceneId: string, patch: ProjectSceneBiblePatch) => void;
  onApplyVisualPatch: (patch: ProjectVisualBiblePatch) => void;
};

type BibleTab = "characters" | "scenes" | "visual";

type CharacterDraft = {
  name: string;
  role: string;
  visualSignature: string;
  costume: string;
  props: string;
};

type SceneDraft = {
  location: string;
  timeOfDay: string;
  summary: string;
  atmosphere: string;
  lightingStyle: string;
  colorPalette: string;
};

type VisualDraft = {
  name: string;
  description: string;
  colorPalette: string;
  lightingStyle: string;
  cameraNotes: string;
  aspectRatio: string;
  stylePrompt: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinList(values: string[] | undefined): string {
  return (values ?? []).filter(Boolean).join("、");
}

function splitList(value: string): string[] | undefined {
  const list = value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
  return list.length > 0 ? [...new Set(list)] : undefined;
}

function getCharacterKey(item: CharacterAssetLibraryItem): string {
  return item.referenceAssetId || item.id || item.name;
}

function createCharacterDraft(item: CharacterAssetLibraryItem): CharacterDraft {
  return {
    name: item.name || "",
    role: item.role || "",
    visualSignature: item.visualSignature || "",
    costume: item.costume || "",
    props: formatCharacterIdentityListInput(item.props),
  };
}

function createSceneDraft(item: ProjectSceneBibleItem): SceneDraft {
  return {
    location: item.location || "",
    timeOfDay: item.timeOfDay || "",
    summary: item.summary || "",
    atmosphere: item.atmosphere || "",
    lightingStyle: item.lightingStyle || "",
    colorPalette: joinList(item.colorPalette),
  };
}

function createVisualDraft(item: ProjectVisualBible): VisualDraft {
  return {
    name: item.name || "",
    description: item.description || "",
    colorPalette: joinList(item.colorPalette),
    lightingStyle: item.lightingStyle || "",
    cameraNotes: item.cameraNotes || "",
    aspectRatio: item.aspectRatio || "",
    stylePrompt: item.stylePrompt || "",
  };
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border px-4 py-8 text-center text-sm" style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textMuted }}>
      {children}
    </div>
  );
}

export function ProjectBiblePanel({
  isOpen,
  onClose,
  characterItems,
  sceneItems,
  visualBible,
  onApplyCharacterPatch,
  onApplyScenePatch,
  onApplyVisualPatch,
}: ProjectBiblePanelProps) {
  const [tab, setTab] = useState<BibleTab>("characters");
  const [editingCharacterKey, setEditingCharacterKey] = useState<string | null>(null);
  const [characterDrafts, setCharacterDrafts] = useState<Record<string, CharacterDraft>>({});
  const [characterViewKey, setCharacterViewKey] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, SceneDraft>>({});
  const [visualDraft, setVisualDraft] = useState<VisualDraft>(() => createVisualDraft(visualBible));

  const tabs = useMemo(() => [
    { id: "characters" as const, label: `角色 ${characterItems.length}`, icon: UserRound },
    { id: "scenes" as const, label: `场景 ${sceneItems.length}`, icon: Clapperboard },
    { id: "visual" as const, label: "视觉", icon: Palette },
  ], [characterItems.length, sceneItems.length]);

  const startEditCharacter = useCallback((item: CharacterAssetLibraryItem) => {
    const key = getCharacterKey(item);
    setEditingCharacterKey(key);
    setCharacterDrafts((drafts) => ({ ...drafts, [key]: createCharacterDraft(item) }));
  }, []);

  const applyCharacterDraft = useCallback((item: CharacterAssetLibraryItem) => {
    const key = getCharacterKey(item);
    const draft = characterDrafts[key] ?? createCharacterDraft(item);
    onApplyCharacterPatch(key, {
      name: cleanText(draft.name) || item.name,
      role: cleanText(draft.role) || undefined,
      visualSignature: cleanText(draft.visualSignature) || undefined,
      costume: cleanText(draft.costume) || undefined,
      props: parseCharacterIdentityListInput(draft.props),
    });
    setEditingCharacterKey(null);
  }, [characterDrafts, onApplyCharacterPatch]);

  const activeCharacterViewItem = characterViewKey
    ? characterItems.find((item) => getCharacterKey(item) === characterViewKey) ?? null
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
      onApplyCharacterPatch(characterViewKey, patch);
    }
  }, [characterViewKey, onApplyCharacterPatch]);

  const startEditScene = useCallback((item: ProjectSceneBibleItem) => {
    setEditingSceneId(item.id);
    setSceneDrafts((drafts) => ({ ...drafts, [item.id]: createSceneDraft(item) }));
  }, []);

  const applySceneDraft = useCallback((item: ProjectSceneBibleItem) => {
    const draft = sceneDrafts[item.id] ?? createSceneDraft(item);
    onApplyScenePatch(item.id, {
      location: cleanText(draft.location) || item.location,
      timeOfDay: cleanText(draft.timeOfDay) || undefined,
      summary: cleanText(draft.summary) || undefined,
      atmosphere: cleanText(draft.atmosphere) || undefined,
      lightingStyle: cleanText(draft.lightingStyle) || undefined,
      colorPalette: splitList(draft.colorPalette),
    });
    setEditingSceneId(null);
  }, [onApplyScenePatch, sceneDrafts]);

  const refreshVisualDraft = useCallback(() => {
    setVisualDraft(createVisualDraft(visualBible));
  }, [visualBible]);

  const applyVisualDraft = useCallback(() => {
    onApplyVisualPatch({
      name: cleanText(visualDraft.name) || "项目视觉风格",
      description: cleanText(visualDraft.description) || undefined,
      colorPalette: splitList(visualDraft.colorPalette),
      lightingStyle: cleanText(visualDraft.lightingStyle) || undefined,
      cameraNotes: cleanText(visualDraft.cameraNotes) || undefined,
      aspectRatio: cleanText(visualDraft.aspectRatio) || undefined,
      stylePrompt: cleanText(visualDraft.stylePrompt) || undefined,
    });
  }, [onApplyVisualPatch, visualDraft]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <aside
      className="fixed right-5 top-20 z-50 flex max-h-[82vh] w-[420px] flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl"
      style={{
        backgroundColor: "rgba(10, 12, 18, 0.94)",
        borderColor: "rgba(148, 163, 184, 0.2)",
        boxShadow: DESIGN_TOKENS.shadowPanel,
      }}
      data-testid="project-bible-panel"
    >
      <header className="border-b px-4 py-4" style={{ borderColor: DESIGN_TOKENS.border }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-400/10 text-purple-100">
              <BookOpen size={18} strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-purple-200/75">Project Bible</div>
              <h2 className="mt-1 text-base font-semibold text-white">角色 / 场景 / 视觉圣经</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">从当前 Shot 与分镜源节点实时汇总，编辑会同步回画布数据。</p>
            </div>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10" onClick={onClose} title="收起">
            <X size={16} strokeWidth={1.7} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className="flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2 text-xs transition hover:bg-white/10"
                style={{
                  borderColor: active ? "rgba(196, 181, 253, 0.42)" : DESIGN_TOKENS.border,
                  backgroundColor: active ? "rgba(168, 85, 247, 0.18)" : "rgba(255,255,255,0.03)",
                  color: active ? "rgb(237, 233, 254)" : DESIGN_TOKENS.textSecondary,
                }}
              >
                <Icon size={13} />
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "characters" ? (
          <div className="space-y-3">
            {characterItems.length === 0 ? (
              <EmptyState>当前还没有角色资产。先导入剧本并拆分 Shot，或在 ShotNode 中添加角色一致性。</EmptyState>
            ) : characterItems.map((item) => {
              const key = getCharacterKey(item);
              const isEditing = editingCharacterKey === key;
              const draft = characterDrafts[key] ?? createCharacterDraft(item);
              return (
                <article key={key} className="rounded-2xl border bg-slate-950/55 p-3" style={{ borderColor: DESIGN_TOKENS.border }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{item.name || "未命名角色"}</h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">引用 {item.shotCount} 个镜头</p>
                    </div>
                    <button type="button" className="rounded-full border border-purple-200/20 px-2 py-1 text-[10px] text-purple-100 transition hover:bg-purple-200/10" onClick={() => isEditing ? setEditingCharacterKey(null) : startEditCharacter(item)}>
                      {isEditing ? "取消" : "编辑"}
                    </button>
                  </div>
                  {isEditing ? (
                    <div className="mt-3 space-y-2 rounded-xl border border-purple-200/15 bg-purple-300/5 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/85 outline-none" value={draft.name} onChange={(event) => setCharacterDrafts((drafts) => ({ ...drafts, [key]: { ...draft, name: event.target.value } }))} placeholder="角色名" />
                        <input className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/85 outline-none" value={draft.role} onChange={(event) => setCharacterDrafts((drafts) => ({ ...drafts, [key]: { ...draft, role: event.target.value } }))} placeholder="角色定位" />
                      </div>
                      <textarea className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.visualSignature} onChange={(event) => setCharacterDrafts((drafts) => ({ ...drafts, [key]: { ...draft, visualSignature: event.target.value } }))} placeholder="脸、发型、体态、标志性特征" />
                      <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.costume} onChange={(event) => setCharacterDrafts((drafts) => ({ ...drafts, [key]: { ...draft, costume: event.target.value } }))} placeholder="服装 / 造型" />
                      <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.props} onChange={(event) => setCharacterDrafts((drafts) => ({ ...drafts, [key]: { ...draft, props: event.target.value } }))} placeholder="道具，用顿号或逗号分隔" />
                      <button type="button" className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-purple-200/20 px-2 py-1.5 text-[11px] text-purple-100 transition hover:bg-purple-200/10" onClick={() => applyCharacterDraft(item)}>
                        <Save size={12} />同步到 {item.shotCount} 个引用镜头
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "正面", imageUrl: item.frontViewUrl },
                          { label: "侧面", imageUrl: item.sideViewUrl },
                          { label: "背面", imageUrl: item.backViewUrl },
                        ].map((view) => (
                          <div key={view.label} className="overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/70">
                            <div className="flex aspect-square items-center justify-center overflow-hidden">
                              {view.imageUrl ? (
                                <img
                                  src={view.imageUrl}
                                  alt={`${item.name || "角色"}${view.label}视图`}
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
                            <div className="border-t border-slate-800/90 px-1.5 py-1 text-center text-[10px] text-slate-400">
                              {view.label}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[item.role, item.visualSignature, item.costume, ...(item.props ?? []).slice(0, 3)].filter(Boolean).map((detail) => (
                          <span key={detail} className="rounded-md bg-purple-400/10 px-1.5 py-0.5 text-[10px] text-purple-100/85">{detail}</span>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-purple-200/20 px-2 py-1.5 text-[11px] text-purple-100 transition hover:bg-purple-200/10"
                        data-testid="project-bible-open-character-view"
                        onClick={() => setCharacterViewKey(key)}
                      >
                        <Sparkles size={12} />
                        打开真实三视图生成
                      </button>
                      <p className="line-clamp-2 text-[11px] text-slate-500">镜头：{item.shotTitles.slice(0, 5).join("、")}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}

        {tab === "scenes" ? (
          <div className="space-y-3">
            {sceneItems.length === 0 ? (
              <EmptyState>当前还没有场景信息。导入结构化分镜或用 AI 分析后，Scene Bible 会自动汇总。</EmptyState>
            ) : sceneItems.map((item) => {
              const isEditing = editingSceneId === item.id;
              const draft = sceneDrafts[item.id] ?? createSceneDraft(item);
              return (
                <article key={item.id} className="rounded-2xl border bg-slate-950/55 p-3" style={{ borderColor: DESIGN_TOKENS.border }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{item.location || `场景 ${item.sceneNumber ?? ""}`}</h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">{item.timeOfDay || "未设定时间"} · {item.shotCount} 个镜头</p>
                    </div>
                    <button type="button" className="rounded-full border border-sky-200/20 px-2 py-1 text-[10px] text-sky-100 transition hover:bg-sky-200/10" onClick={() => isEditing ? setEditingSceneId(null) : startEditScene(item)}>
                      {isEditing ? "取消" : "编辑"}
                    </button>
                  </div>
                  {isEditing ? (
                    <div className="mt-3 space-y-2 rounded-xl border border-sky-200/15 bg-sky-300/5 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/85 outline-none" value={draft.location} onChange={(event) => setSceneDrafts((drafts) => ({ ...drafts, [item.id]: { ...draft, location: event.target.value } }))} placeholder="地点" />
                        <input className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/85 outline-none" value={draft.timeOfDay} onChange={(event) => setSceneDrafts((drafts) => ({ ...drafts, [item.id]: { ...draft, timeOfDay: event.target.value } }))} placeholder="时间段" />
                      </div>
                      <textarea className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.summary} onChange={(event) => setSceneDrafts((drafts) => ({ ...drafts, [item.id]: { ...draft, summary: event.target.value } }))} placeholder="场景剧情功能 / 摘要" />
                      <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.atmosphere} onChange={(event) => setSceneDrafts((drafts) => ({ ...drafts, [item.id]: { ...draft, atmosphere: event.target.value } }))} placeholder="氛围" />
                      <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.lightingStyle} onChange={(event) => setSceneDrafts((drafts) => ({ ...drafts, [item.id]: { ...draft, lightingStyle: event.target.value } }))} placeholder="光影风格" />
                      <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={draft.colorPalette} onChange={(event) => setSceneDrafts((drafts) => ({ ...drafts, [item.id]: { ...draft, colorPalette: event.target.value } }))} placeholder="色彩基调，用顿号或逗号分隔" />
                      <button type="button" className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200/20 px-2 py-1.5 text-[11px] text-sky-100 transition hover:bg-sky-200/10" onClick={() => applySceneDraft(item)}>
                        <Save size={12} />同步到 {item.shotCount} 个场景镜头
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-[11px] leading-5 text-slate-400">{item.summary || item.atmosphere || "暂无场景摘要"}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...(item.characters ?? []), item.lightingStyle, ...(item.colorPalette ?? [])].filter(Boolean).slice(0, 8).map((detail) => (
                          <span key={detail} className="rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-100/85">{detail}</span>
                        ))}
                      </div>
                      <p className="line-clamp-2 text-[11px] text-slate-500">镜头：{item.shotTitles.slice(0, 5).join("、")}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}

        {tab === "visual" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border bg-slate-950/55 p-3" style={{ borderColor: DESIGN_TOKENS.border }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{visualBible.name || "项目视觉风格"}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">汇总 {visualBible.sourceCount} 个画布来源</p>
                </div>
                <button type="button" className="rounded-full border border-amber-200/20 px-2 py-1 text-[10px] text-amber-100 transition hover:bg-amber-200/10" onClick={refreshVisualDraft}>
                  重置草稿
                </button>
              </div>
              <div className="mt-3 space-y-2 rounded-xl border border-amber-200/15 bg-amber-300/5 p-2">
                <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/85 outline-none" value={visualDraft.name} onChange={(event) => setVisualDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="风格名称" />
                <textarea className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={visualDraft.description} onChange={(event) => setVisualDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="整体视觉风格描述" />
                <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={visualDraft.colorPalette} onChange={(event) => setVisualDraft((draft) => ({ ...draft, colorPalette: event.target.value }))} placeholder="色彩基调，用顿号或逗号分隔" />
                <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={visualDraft.lightingStyle} onChange={(event) => setVisualDraft((draft) => ({ ...draft, lightingStyle: event.target.value }))} placeholder="光影风格" />
                <input className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={visualDraft.aspectRatio} onChange={(event) => setVisualDraft((draft) => ({ ...draft, aspectRatio: event.target.value }))} placeholder="画幅比例，如 16:9 / 2.35:1" />
                <textarea className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={visualDraft.cameraNotes} onChange={(event) => setVisualDraft((draft) => ({ ...draft, cameraNotes: event.target.value }))} placeholder="摄影机 / 运镜偏好" />
                <textarea className="w-full min-h-24 resize-none rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-[11px] text-white/80 outline-none" value={visualDraft.stylePrompt} onChange={(event) => setVisualDraft((draft) => ({ ...draft, stylePrompt: event.target.value }))} placeholder="追加到分镜合成图的全局风格 Prompt" />
                <button type="button" className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200/20 px-2 py-1.5 text-[11px] text-amber-100 transition hover:bg-amber-200/10" onClick={applyVisualDraft}>
                  <Sparkles size={12} />同步到分镜源节点和合成设置
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
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
    </aside>,
    document.body,
  );
}
