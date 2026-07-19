import { callAiChat } from "../ai/client.ts";
import {
  buildFullStoryPrompt,
  estimateStoryboardTextNodeSize,
  getNextStoryboardAssistantStage,
  type StoryboardAssistantStage,
} from "../storyboard/storyboardTextNode.ts";
import {
  buildDirectorPrompt,
  inferCharacterIdentitiesForShot,
  parseDirectorJson,
  postProcessStoryboard,
} from "../storyboard-director-agent.ts";

async function runStoryboardAssistantPrompt(input: {
  prompt: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: { type: string };
}): Promise<string> {
  const data = await callAiChat({
    model: input.model || "gpt-5.5",
    temperature: input.temperature ?? 0.65,
    timeoutMs: input.timeoutMs ?? 60000,
    response_format: input.responseFormat,
    messages: [
      {
        role: "user",
        content: input.prompt,
      },
    ],
  });

  const content = data.content.trim();
  if (!content) throw new Error("Storyboard assistant returned empty content");
  return content;
}

export function generateDirectorStoryboardText(input: {
  storyText: string;
  nodeId: string;
  model?: string;
}): Promise<string> {
  const directorPrompt = buildDirectorPrompt({
    script: input.storyText,
    genre: "短剧 / 影视分镜",
    style: "成熟电影镜头语言，强调人物关系、情绪推进和信息释放",
    targetPlatform: "short-drama",
    shotDensity: "normal",
    additionalNotes: "输出 6-9 个关键镜头；每个镜头都必须有明确镜头动机、构图、调度、声画关系和可直接用于生图的英文 visualPrompt。",
  });

  return runStoryboardAssistantPrompt({
    prompt: directorPrompt,
    model: input.model,
    temperature: 0.45,
    timeoutMs: 90000,
    responseFormat: { type: "json_object" },
  }).then((rawText) => {
    try {
      const rawPlan = parseDirectorJson(rawText);
      const plan = postProcessStoryboard(rawPlan, {
        genre: "短剧 / 影视分镜",
        style: "成熟电影镜头语言",
        targetPlatform: "short-drama",
        shotDensity: "normal",
      });
      return storyboardPlanToParseableText(plan, input.nodeId);
    } catch {
      return rawText;
    }
  });
}

export async function runStoryboardAssistantCommand(input: {
  text: string;
  stage: StoryboardAssistantStage;
  nodeId: string;
  nodeWidth?: number;
  updateNode: (next: {
    text: string;
    stage: StoryboardAssistantStage;
    width: number;
    height: number;
  }) => void;
  triggerSplitStoryboard?: (nodeId: string) => void;
  model?: string;
}): Promise<{
  text: string;
  stage: StoryboardAssistantStage;
  width: number;
  height: number;
}> {
  const sourceText = input.text.trim();
  if (!sourceText) throw new Error("请先输入一句故事想法或故事正文");

  if (input.stage === "storyboard-text") {
    input.triggerSplitStoryboard?.(input.nodeId);
    const size = estimateStoryboardTextNodeSize({
      text: sourceText,
      stage: input.stage,
      width: input.nodeWidth,
    });
    return {
      text: sourceText,
      stage: input.stage,
      ...size,
    };
  }

  const nextStage = getNextStoryboardAssistantStage(input.stage);
  const result = input.stage === "story"
    ? await generateDirectorStoryboardText({ storyText: sourceText, nodeId: input.nodeId, model: input.model })
    : await runStoryboardAssistantPrompt({ prompt: buildFullStoryPrompt(sourceText), model: input.model });
  const size = estimateStoryboardTextNodeSize({
    text: result,
    stage: nextStage,
    width: input.nodeWidth,
  });

  input.updateNode({
    text: result,
    stage: nextStage,
    width: size.width,
    height: size.height,
  });

  return {
    text: result,
    stage: nextStage,
    ...size,
  };
}

function storyboardPlanToParseableText(
  plan: ReturnType<typeof postProcessStoryboard>,
  sourceStoryboardNodeId: string,
): string {
  const sceneById = new Map(plan.scenes.map((scene) => [scene.sceneId, scene]));

  return plan.shots.map((shot, index) => {
    const scene = sceneById.get(shot.sceneId);
    const order = index + 1;
    const title = shot.dramaticBeat || `镜头 ${order}`;
    const sceneLine = scene
      ? `场景：${scene.location} / ${scene.timeOfDay} / ${scene.sceneFunction}`
      : `场景：${shot.sceneId}`;
    const notes = [
      `剧情节拍：${shot.dramaticBeat}`,
      `镜头动机：${shot.shotPurpose}`,
      `情绪：${shot.emotionalState} / 权重 ${shot.dramaticWeight}`,
      `机位：${shot.cameraAngle}`,
      `构图：${shot.composition}`,
      `调度：${shot.blocking}`,
      shot.voiceIntent ? `配音意图：${shot.voiceIntent}` : "",
      shot.soundCue ? `声音提示：${shot.soundCue}` : "",
      shot.subtext ? `潜台词：${shot.subtext}` : "",
      shot.riskFlags?.length ? `连续性提示：${shot.riskFlags.join("；")}` : "",
      `DirectorMeta：${JSON.stringify({
        sourceStoryboardNodeId,
        cinematicShot: shot,
        sceneAnalysis: scene,
        continuityWarnings: plan.continuityReport.filter((warning) => warning.shotIds.includes(shot.shotId)),
        characterIdentities: inferCharacterIdentitiesForShot(shot, scene),
      })}`,
    ].filter(Boolean).join("\n");

    return [
      `镜头 ${order}：${title}`,
      sceneLine,
      `景别：${shot.shotSize}`,
      `镜头运动：${shot.cameraMovement}`,
      `时长：${shot.durationEstimate}s`,
      `画面描述：${[shot.shotPurpose, shot.blocking, shot.composition].filter(Boolean).join(" ")}`,
      `对白：${shot.dialogue?.trim() || "无"}`,
      `生图提示词：${shot.visualPrompt}`,
      shot.negativePrompt ? `负面提示词：${shot.negativePrompt}` : "",
      `备注：${notes}`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}
