import type { CharacterIdentityAsset, StoryboardShotData } from "@/app/canvas/components/canvas/types";

export type CharacterAssetLibrary = {
  assets: CharacterIdentityAsset[];
};

export type CharacterAssetLibraryItem = CharacterIdentityAsset & {
  shotCount: number;
  shotTitles: string[];
};

export type CharacterAssetSeed = {
  id: string;
  name: string;
  role: string;
  notes?: string;
};

export type CharacterAssetLibraryPatch = Partial<Pick<
  CharacterIdentityAsset,
  | "name"
  | "role"
  | "visualSignature"
  | "costume"
  | "props"
  | "physicalTraits"
  | "colorPalette"
  | "notes"
  | "frontViewUrl"
  | "sideViewUrl"
  | "backViewUrl"
  | "frontViewAssetId"
  | "sideViewAssetId"
  | "backViewAssetId"
>>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeIdentityKey(identity: Pick<CharacterIdentityAsset, "id" | "name" | "referenceAssetId">): string {
  return cleanText(identity.referenceAssetId) || cleanText(identity.id) || cleanText(identity.name).toLowerCase();
}

function uniqueStrings(values: string[] | undefined): string[] | undefined {
  const unique = [...new Set((values ?? []).map(cleanText).filter(Boolean))];
  return unique.length > 0 ? unique : undefined;
}

function cleanStringList(values: string[] | undefined): string[] | undefined {
  return uniqueStrings(values);
}

function mergeText(preferred: string | undefined, fallback: string | undefined): string | undefined {
  return cleanText(preferred) || cleanText(fallback) || undefined;
}

export function mergeCharacterIdentityAsset(
  base: CharacterIdentityAsset,
  override: CharacterIdentityAsset,
): CharacterIdentityAsset {
  return {
    ...base,
    ...override,
    id: mergeText(override.id, base.id) ?? base.id,
    name: mergeText(override.name, base.name) ?? base.name,
    aliases: uniqueStrings([...(base.aliases ?? []), ...(override.aliases ?? [])]),
    role: mergeText(override.role, base.role),
    visualSignature: mergeText(override.visualSignature, base.visualSignature),
    costume: mergeText(override.costume, base.costume),
    props: uniqueStrings([...(base.props ?? []), ...(override.props ?? [])]),
    physicalTraits: uniqueStrings([...(base.physicalTraits ?? []), ...(override.physicalTraits ?? [])]),
    colorPalette: uniqueStrings([...(base.colorPalette ?? []), ...(override.colorPalette ?? [])]),
    referenceAssetId: mergeText(override.referenceAssetId, base.referenceAssetId),
    frontViewUrl: mergeText(override.frontViewUrl, base.frontViewUrl),
    sideViewUrl: mergeText(override.sideViewUrl, base.sideViewUrl),
    backViewUrl: mergeText(override.backViewUrl, base.backViewUrl),
    frontViewAssetId: mergeText(override.frontViewAssetId, base.frontViewAssetId),
    sideViewAssetId: mergeText(override.sideViewAssetId, base.sideViewAssetId),
    backViewAssetId: mergeText(override.backViewAssetId, base.backViewAssetId),
    notes: mergeText(override.notes, base.notes),
  };
}

export function collectCharacterAssetLibraryFromShots(shots: StoryboardShotData[]): CharacterAssetLibrary {
  const assetByKey = new Map<string, CharacterIdentityAsset>();

  for (const shot of shots) {
    for (const identity of shot.characterIdentities ?? []) {
      const key = normalizeIdentityKey(identity);
      if (!key) continue;
      const existing = assetByKey.get(key);
      assetByKey.set(key, existing ? mergeCharacterIdentityAsset(existing, identity) : identity);
    }
  }

  return { assets: [...assetByKey.values()] };
}

export function collectCharacterAssetLibraryItemsFromShots(shots: StoryboardShotData[]): CharacterAssetLibraryItem[] {
  const itemByKey = new Map<string, CharacterAssetLibraryItem>();

  for (const shot of shots) {
    const shotTitle = cleanText(shot.title) || `镜头 ${shot.order}`;
    for (const identity of shot.characterIdentities ?? []) {
      const key = normalizeIdentityKey(identity);
      if (!key) continue;
      const existing = itemByKey.get(key);
      if (existing) {
        const merged = mergeCharacterIdentityAsset(existing, identity);
        itemByKey.set(key, {
          ...merged,
          shotCount: existing.shotTitles.includes(shotTitle) ? existing.shotCount : existing.shotCount + 1,
          shotTitles: existing.shotTitles.includes(shotTitle)
            ? existing.shotTitles
            : [...existing.shotTitles, shotTitle],
        });
      } else {
        itemByKey.set(key, {
          ...identity,
          shotCount: 1,
          shotTitles: [shotTitle],
        });
      }
    }
  }

  return [...itemByKey.values()].sort((a, b) => b.shotCount - a.shotCount || a.name.localeCompare(b.name));
}

export function collectCharacterAssetLibraryItemsFromSeeds(seeds: CharacterAssetSeed[]): CharacterAssetLibraryItem[] {
  return seeds
    .map((seed) => ({
      id: cleanText(seed.id) || cleanText(seed.name),
      name: cleanText(seed.name) || "未命名角色",
      role: cleanText(seed.role) || undefined,
      notes: cleanText(seed.notes) || undefined,
      shotCount: 0,
      shotTitles: [],
    }))
    .filter((item) => Boolean(item.id || item.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeCharacterAssetLibraryItems(
  primary: CharacterAssetLibraryItem[],
  secondary: CharacterAssetLibraryItem[],
): CharacterAssetLibraryItem[] {
  const itemByKey = new Map<string, CharacterAssetLibraryItem>();

  for (const item of [...primary, ...secondary]) {
    const key = normalizeIdentityKey(item);
    if (!key) continue;
    const existing = itemByKey.get(key);
    if (existing) {
      const merged = mergeCharacterIdentityAsset(existing, item);
      itemByKey.set(key, {
        ...merged,
        shotCount: Math.max(existing.shotCount, item.shotCount),
        shotTitles: [...new Set([...(existing.shotTitles ?? []), ...(item.shotTitles ?? [])])],
      });
      continue;
    }
    itemByKey.set(key, item);
  }

  return [...itemByKey.values()].sort((a, b) => b.shotCount - a.shotCount || a.name.localeCompare(b.name));
}

export function resolveCharacterIdentityAsset(
  identity: CharacterIdentityAsset,
  library: CharacterAssetLibrary | undefined,
): CharacterIdentityAsset {
  const assets = library?.assets ?? [];
  const referenceKey = cleanText(identity.referenceAssetId);
  const nameKey = cleanText(identity.name).toLowerCase();
  const matched = assets.find((asset) => {
    const assetId = cleanText(asset.id);
    const assetReference = cleanText(asset.referenceAssetId);
    const assetName = cleanText(asset.name).toLowerCase();
    return Boolean(
      (referenceKey && (assetId === referenceKey || assetReference === referenceKey)) ||
      (nameKey && assetName === nameKey),
    );
  });

  return matched ? mergeCharacterIdentityAsset(identity, matched) : identity;
}

export function applyCharacterAssetLibraryToShot(
  shot: StoryboardShotData,
  library: CharacterAssetLibrary | undefined,
): StoryboardShotData {
  if (!shot.characterIdentities?.length || !library?.assets.length) return shot;

  return {
    ...shot,
    characterIdentities: shot.characterIdentities.map((identity) =>
      resolveCharacterIdentityAsset(identity, library),
    ),
  };
}

export function applyCharacterAssetLibraryToShots(
  shots: StoryboardShotData[],
  library: CharacterAssetLibrary | undefined,
): StoryboardShotData[] {
  return shots.map((shot) => applyCharacterAssetLibraryToShot(shot, library));
}

export function applyCharacterAssetLibraryPatchToShots(
  shots: StoryboardShotData[],
  assetKey: string,
  patch: CharacterAssetLibraryPatch,
): StoryboardShotData[] {
  const normalizedKey = cleanText(assetKey).toLowerCase();
  if (!normalizedKey) return shots;

  return shots.map((shot) => {
    if (!shot.characterIdentities?.length) return shot;
    let changed = false;
    const characterIdentities = shot.characterIdentities.map((identity) => {
      const identityKeys = [identity.referenceAssetId, identity.id, identity.name]
        .map((value) => cleanText(value).toLowerCase())
        .filter(Boolean);
      if (!identityKeys.includes(normalizedKey)) return identity;

      changed = true;
      return {
        ...identity,
        ...(patch.name !== undefined ? { name: cleanText(patch.name) || identity.name } : {}),
        ...(patch.role !== undefined ? { role: cleanText(patch.role) || undefined } : {}),
        ...(patch.visualSignature !== undefined ? { visualSignature: cleanText(patch.visualSignature) || undefined } : {}),
        ...(patch.costume !== undefined ? { costume: cleanText(patch.costume) || undefined } : {}),
        ...(patch.props !== undefined ? { props: cleanStringList(patch.props) } : {}),
        ...(patch.physicalTraits !== undefined ? { physicalTraits: cleanStringList(patch.physicalTraits) } : {}),
        ...(patch.colorPalette !== undefined ? { colorPalette: cleanStringList(patch.colorPalette) } : {}),
        ...(patch.notes !== undefined ? { notes: cleanText(patch.notes) || undefined } : {}),
        ...(patch.frontViewUrl !== undefined ? { frontViewUrl: cleanText(patch.frontViewUrl) || undefined } : {}),
        ...(patch.sideViewUrl !== undefined ? { sideViewUrl: cleanText(patch.sideViewUrl) || undefined } : {}),
        ...(patch.backViewUrl !== undefined ? { backViewUrl: cleanText(patch.backViewUrl) || undefined } : {}),
        ...(patch.frontViewAssetId !== undefined ? { frontViewAssetId: cleanText(patch.frontViewAssetId) || undefined } : {}),
        ...(patch.sideViewAssetId !== undefined ? { sideViewAssetId: cleanText(patch.sideViewAssetId) || undefined } : {}),
        ...(patch.backViewAssetId !== undefined ? { backViewAssetId: cleanText(patch.backViewAssetId) || undefined } : {}),
      };
    });

    return changed ? { ...shot, characterIdentities } : shot;
  });
}
