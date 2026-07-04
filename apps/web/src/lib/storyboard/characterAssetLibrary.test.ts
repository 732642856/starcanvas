import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { StoryboardShotData } from "@/app/canvas/components/canvas/types";
import {
  applyCharacterAssetLibraryPatchToShots,
  applyCharacterAssetLibraryToShots,
  collectCharacterAssetLibraryItemsFromSeeds,
  collectCharacterAssetLibraryFromShots,
  collectCharacterAssetLibraryItemsFromShots,
  mergeCharacterAssetLibraryItems,
  resolveCharacterIdentityAsset,
} from "./characterAssetLibrary.ts";
import { buildStoryboardImagePrompt } from "./storyboardImagePrompt.ts";

function makeShot(order: number, characterIdentities: StoryboardShotData["characterIdentities"]): StoryboardShotData {
  return {
    id: `shot-${order}`,
    order,
    title: `镜头 ${order}`,
    description: `镜头 ${order} 描述`,
    visualPrompt: `visual prompt ${order}`,
    characterIdentities,
  };
}

describe("characterAssetLibrary", () => {
  void it("collects and deduplicates character assets from shots", () => {
    const library = collectCharacterAssetLibraryFromShots([
      makeShot(1, [
        {
          id: "character-linxia",
          name: "女主林夏",
          role: "protagonist",
          props: ["old brass key"],
        },
      ]),
      makeShot(2, [
        {
          id: "character-linxia",
          name: "女主林夏",
          visualSignature: "sharp oval face, short black bob haircut",
          costume: "same red wool coat",
          props: ["old brass key", "black shoulder bag"],
        },
      ]),
    ]);

    assert.equal(library.assets.length, 1);
    assert.equal(library.assets[0]?.name, "女主林夏");
    assert.equal(library.assets[0]?.role, "protagonist");
    assert.equal(library.assets[0]?.visualSignature, "sharp oval face, short black bob haircut");
    assert.equal(library.assets[0]?.costume, "same red wool coat");
    assert.deepEqual(library.assets[0]?.props, ["old brass key", "black shoulder bag"]);
  });

  void it("collects UI-ready library items with shot reference counts", () => {
    const items = collectCharacterAssetLibraryItemsFromShots([
      makeShot(2, [
        {
          id: "character-sidekick",
          name: "同伴阿青",
        },
      ]),
      makeShot(1, [
        {
          id: "character-linxia",
          name: "女主林夏",
          role: "protagonist",
          props: ["old brass key"],
        },
      ]),
      makeShot(3, [
        {
          id: "character-linxia",
          name: "女主林夏",
          costume: "same red wool coat",
          props: ["black shoulder bag"],
        },
      ]),
    ]);

    assert.equal(items.length, 2);
    assert.equal(items[0]?.name, "女主林夏");
    assert.equal(items[0]?.shotCount, 2);
    assert.deepEqual(items[0]?.shotTitles, ["镜头 1", "镜头 3"]);
    assert.deepEqual(items[0]?.props, ["old brass key", "black shoulder bag"]);
    assert.equal(items[1]?.name, "同伴阿青");
    assert.equal(items[1]?.shotCount, 1);
  });

  void it("collects UI-ready library items from production bible character seeds", () => {
    const items = collectCharacterAssetLibraryItemsFromSeeds([
      {
        id: "character-linwu",
        name: "林雾",
        role: "女主",
        notes: "待补角色外貌签名与参考图",
      },
      {
        id: "character-zhouqi",
        name: "周祁",
        role: "男主",
      },
    ]);

    assert.equal(items.length, 2);
    assert.equal(items[0]?.shotCount, 0);
    assert.deepEqual(items[0]?.shotTitles, []);
    assert.equal(items[0]?.name, "周祁");
    assert.equal(items[1]?.name, "林雾");
    assert.equal(items[1]?.role, "女主");
  });

  void it("merges production bible seeds with shot-derived character assets", () => {
    const merged = mergeCharacterAssetLibraryItems(
      collectCharacterAssetLibraryItemsFromShots([
        makeShot(1, [
          {
            id: "character-linwu",
            name: "林雾",
            visualSignature: "短发，左脸痣",
          },
        ]),
      ]),
      collectCharacterAssetLibraryItemsFromSeeds([
        {
          id: "character-linwu",
          name: "林雾",
          role: "女主",
          notes: "待补正侧背三视图",
        },
        {
          id: "character-zhouqi",
          name: "周祁",
          role: "男主",
        },
      ]),
    );

    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.name, "林雾");
    assert.equal(merged[0]?.shotCount, 1);
    assert.equal(merged[0]?.role, "女主");
    assert.equal(merged[0]?.visualSignature, "短发，左脸痣");
    assert.equal(merged[1]?.name, "周祁");
    assert.equal(merged[1]?.shotCount, 0);
  });

  void it("resolves shot-local identities from referenceAssetId", () => {
    const resolved = resolveCharacterIdentityAsset(
      {
        id: "local-linxia-shot-1",
        referenceAssetId: "character-linxia-library",
        name: "女主林夏",
        visualSignature: "shot local blurred identity",
      },
      {
        assets: [
          {
            id: "character-linxia-library",
            name: "女主林夏",
            role: "protagonist",
            visualSignature: "library locked face: sharp oval face, short black bob haircut",
            costume: "library locked costume: red wool coat with brass buttons",
            props: ["old brass key"],
          },
        ],
      },
    );

    assert.equal(resolved.id, "character-linxia-library");
    assert.equal(resolved.referenceAssetId, "character-linxia-library");
    assert.equal(resolved.role, "protagonist");
    assert.equal(resolved.visualSignature, "library locked face: sharp oval face, short black bob haircut");
    assert.equal(resolved.costume, "library locked costume: red wool coat with brass buttons");
  });

  void it("applies global library edits to every referenced shot", () => {
    const syncedShots = applyCharacterAssetLibraryPatchToShots(
      [
        makeShot(1, [
          {
            id: "local-1",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
            visualSignature: "old local face",
          },
        ]),
        makeShot(2, [
          {
            id: "local-2",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
            costume: "old local costume",
          },
        ]),
        makeShot(3, [
          {
            id: "character-sidekick",
            name: "同伴阿青",
            visualSignature: "unchanged sidekick",
          },
        ]),
      ],
      "character-linxia-library",
      {
        name: "女主林夏",
        role: "protagonist",
        visualSignature: "global panel edit: exact oval face and black bob haircut",
        costume: "global panel edit: red wool coat with brass buttons",
        props: ["old brass key", "black shoulder bag"],
      },
    );

    assert.equal(syncedShots[0]?.characterIdentities?.[0]?.visualSignature, "global panel edit: exact oval face and black bob haircut");
    assert.equal(syncedShots[1]?.characterIdentities?.[0]?.costume, "global panel edit: red wool coat with brass buttons");
    assert.deepEqual(syncedShots[1]?.characterIdentities?.[0]?.props, ["old brass key", "black shoulder bag"]);
    assert.equal(syncedShots[2]?.characterIdentities?.[0]?.visualSignature, "unchanged sidekick");
  });

  void it("applies global library edits before building the direct-only prompt", () => {
    const syncedShots = applyCharacterAssetLibraryPatchToShots(
      [
        makeShot(1, [
          {
            id: "local-1",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
            visualSignature: "shot local identity should be replaced",
          },
        ]),
        makeShot(2, [
          {
            id: "local-2",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
          },
        ]),
      ],
      "character-linxia-library",
      {
        role: "protagonist",
        visualSignature: "global panel edit: exact oval face, black bob haircut, mole under left eye",
        costume: "global panel edit: same red wool coat with brass buttons",
        props: ["old brass key", "black shoulder bag"],
      },
    );

    const prompt = buildStoryboardImagePrompt(
      syncedShots.map((shot) => ({ data: { nodeKind: "shot", shot } })),
    );

    assert.match(prompt, /Character Identity Bible/);
    assert.match(prompt, /global panel edit: exact oval face, black bob haircut, mole under left eye/);
    assert.match(prompt, /global panel edit: same red wool coat with brass buttons/);
    assert.match(prompt, /persistent props: old brass key, black shoulder bag/);
    assert.doesNotMatch(prompt, /shot local identity should be replaced/);
  });

  void it("applies library assets before building the direct-only prompt", () => {
    const syncedShots = applyCharacterAssetLibraryToShots(
      [
        makeShot(1, [
          {
            id: "local-1",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
            visualSignature: "shot local identity should be replaced",
          },
        ]),
        makeShot(2, [
          {
            id: "local-2",
            referenceAssetId: "character-linxia-library",
            name: "女主林夏",
          },
        ]),
      ],
      {
        assets: [
          {
            id: "character-linxia-library",
            name: "女主林夏",
            role: "protagonist",
            visualSignature: "global library edit: exact oval face, black bob haircut, mole under left eye",
            costume: "global library edit: same red wool coat with brass buttons",
            props: ["old brass key", "black shoulder bag"],
          },
        ],
      },
    );

    const prompt = buildStoryboardImagePrompt(
      syncedShots.map((shot) => ({ data: { nodeKind: "shot", shot } })),
    );

    assert.match(prompt, /Character Identity Bible/);
    assert.match(prompt, /global library edit: exact oval face, black bob haircut, mole under left eye/);
    assert.match(prompt, /global library edit: same red wool coat with brass buttons/);
    assert.match(prompt, /persistent props: old brass key, black shoulder bag/);
    assert.match(prompt, /Character identity continuity: 女主林夏/);
    assert.doesNotMatch(prompt, /shot local identity should be replaced/);
  });
});
