import type { CharacterBibleData, CharacterIdentityAsset } from "@/app/canvas/components/canvas/types"
import type { ScriptPipelineCharacter } from "./scriptPipeline"

function uniq(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

export function createScriptPipelineCharacters(
  identities: Array<CharacterIdentityAsset | CharacterBibleData> | undefined,
): ScriptPipelineCharacter[] {
  return (identities || [])
    .filter((identity) => identity.name?.trim())
    .map((identity) => {
      const referenceAssetIds = uniq([
        ...("referenceAssetIds" in identity ? identity.referenceAssetIds || [] : []),
        "referenceAssetId" in identity ? identity.referenceAssetId : undefined,
        "frontViewAssetId" in identity ? identity.frontViewAssetId : undefined,
        "sideViewAssetId" in identity ? identity.sideViewAssetId : undefined,
        "backViewAssetId" in identity ? identity.backViewAssetId : undefined,
      ])
      const viewSetId = uniq([
        "frontViewAssetId" in identity ? identity.frontViewAssetId : undefined,
        "sideViewAssetId" in identity ? identity.sideViewAssetId : undefined,
        "backViewAssetId" in identity ? identity.backViewAssetId : undefined,
      ]).length
        ? `${identity.id}-three-view`
        : undefined

      return {
        id: identity.id,
        name: identity.name,
        role: identity.role,
        referenceAssetIds,
        viewSetId,
        consistencyLock: true,
        faceLock: Boolean(identity.visualSignature || ("frontViewUrl" in identity ? identity.frontViewUrl : undefined) || ("frontViewAssetId" in identity ? identity.frontViewAssetId : undefined)),
        costumeLock: Boolean(identity.costume),
        description: [
          identity.visualSignature,
          identity.costume ? `Costume: ${identity.costume}` : "",
          identity.props?.length ? `Props: ${identity.props.join(", ")}` : "",
          identity.physicalTraits?.length ? `Traits: ${identity.physicalTraits.join(", ")}` : "",
          identity.colorPalette?.length ? `Palette: ${identity.colorPalette.join(", ")}` : "",
          identity.notes,
        ].filter(Boolean).join("\n"),
      }
    })
}
