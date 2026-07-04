import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildReversePromptMessages,
  cleanReversePromptOutput,
  reverseImagePrompt,
} from "./reversePromptService.ts";

describe("reversePromptService", () => {
  void it("builds a role-based vision prompt with high detail image input", () => {
    const messages = buildReversePromptMessages("data:image/png;base64,SOURCE");

    assert.match(String(messages[0]?.content), /senior cinematic prompt engineer/i);
    assert.match(String(messages[0]?.content), /Output ONLY valid JSON/i);
    const userContent = messages[1]?.content;
    assert.ok(Array.isArray(userContent));
    assert.deepEqual(userContent[1], {
      type: "image_url",
      image_url: {
        url: "data:image/png;base64,SOURCE",
        detail: "high",
      },
    });
  });

  void it("cleans fenced or chatty model output into a prompt string", () => {
    const cleaned = cleanReversePromptOutput(`
      Sure, here is the prompt:
      \`\`\`json
      {
        "prompt": "cinematic portrait, rain-soaked neon street",
        "negativePrompt": "low quality, blurry",
        "qualityScore": 0.82
      }
      \`\`\`
    `);

    assert.equal(cleaned.prompt, "cinematic portrait, rain-soaked neon street");
    assert.equal(cleaned.negativePrompt, "low quality, blurry");
    assert.equal(cleaned.qualityScore, 0.82);
  });

  void it("posts converted image data to the reverse prompt API", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const result = await reverseImagePrompt(
      {
        imageUrl: "blob:http://localhost/source",
        assetId: "asset-source",
      },
      {
        imageUrlToBase64Fn: async (url, assetId) => {
          assert.equal(url, "blob:http://localhost/source");
          assert.equal(assetId, "asset-source");
          return "data:image/png;base64,SOURCE";
        },
        fetchImpl: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body ?? "{}"));
          return new Response(
            JSON.stringify({
              prompt: "cinematic wide shot of a lone astronaut",
              negativePrompt: "text, watermark",
              qualityScore: 0.9,
              language: "en",
            }),
          );
        },
      },
    );

    assert.equal(requestBody?.imageUrl, "data:image/png;base64,SOURCE");
    assert.equal(requestBody?.assetId, "asset-source");
    assert.deepEqual(result, {
      prompt: "cinematic wide shot of a lone astronaut",
      negativePrompt: "text, watermark",
      qualityScore: 0.9,
      language: "en",
    });
  });
});
