import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildFinalCompositionArgs, buildMultiClipConcatArgs } from "./videoCompositionPlan.ts"

describe("buildMultiClipConcatArgs", () => {
  it("normalizes mixed browser clips before concat", () => {
    const args = buildMultiClipConcatArgs({
      clipFiles: ["clip_0.webm", "clip_1.mp4"],
      outputFile: "concat.mp4",
      width: 160,
      height: 90,
      fps: 8,
    })
    const command = args.join(" ")
    assert.equal(command.includes("-i clip_0.webm -i clip_1.mp4"), true)
    assert.equal(command.includes("[0:v]setpts=PTS-STARTPTS,scale=160:90"), true)
    assert.equal(command.includes("[v0][v1]concat=n=2:v=1:a=0[vout]"), true)
    assert.equal(command.includes("-map [vout] -c:v libx264"), true)
    assert.equal(args.at(-1), "concat.mp4")
  })
})

describe("buildFinalCompositionArgs", () => {
  it("maps rendered video and optional source audio when no extra tracks exist", () => {
    const args = buildFinalCompositionArgs({
      concatOutput: "concat_temp.mp4",
      outputFile: "out.mp4",
    })

    assert.equal(args.includes("-filter_complex"), true)
    assert.equal(args.join(" ").includes("[vbase]null[vout]"), true)
    assert.equal(args.join(" ").includes("-map [vout] -map 0:a?"), true)
    assert.equal(args.at(-1), "out.mp4")
  })

  it("mixes narration and bgm into a labelled audio output", () => {
    const args = buildFinalCompositionArgs({
      concatOutput: "concat_temp.mp4",
      outputFile: "out.mp4",
      audioInputs: [
        { filename: "narration.wav", volume: 1 },
        { filename: "bgm.wav", volume: 0.3, delay: 1.25 },
      ],
    })
    const command = args.join(" ")

    assert.equal(command.includes("-i narration.wav -i bgm.wav"), true)
    assert.equal(command.includes("[1:a]volume=1[a0]"), true)
    assert.equal(command.includes("[2:a]volume=0.3,adelay=1250|1250[a1]"), true)
    assert.equal(command.includes("[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]"), true)
    assert.equal(command.includes("-map [vout] -map [aout]"), true)
  })

  it("burns subtitles into the video filter graph", () => {
    const args = buildFinalCompositionArgs({
      concatOutput: "concat_temp.mp4",
      outputFile: "out.mp4",
      subtitle: {
        filename: "subtitles.srt",
        style: { fontSize: 32, fontColor: "#ffcc00", alignment: "top" },
      },
    })
    const filter = args[args.indexOf("-filter_complex") + 1]

    assert.equal(filter.includes("[vbase]subtitles=subtitles.srt"), true)
    assert.equal(filter.includes("FontSize=32"), true)
    assert.equal(filter.includes("PrimaryColour=&H0000CCFF"), true)
    assert.equal(filter.includes("Alignment=8"), true)
    assert.equal(filter.endsWith("[vout]"), true)
  })
})
