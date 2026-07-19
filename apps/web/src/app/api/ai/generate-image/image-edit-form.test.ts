import assert from "node:assert/strict";
import test from "node:test";

import { buildImageEditFormData } from "./image-edit-form.ts";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wlpm1sAAAAASUVORK5CYII=";

test("uses the OpenAI edits image[] multipart field for every reference", () => {
  const form = buildImageEditFormData({
    model: "gpt-image-2",
    prompt: "Keep the character unchanged.",
    size: "1024x1024",
    sourceImageValues: [PNG_DATA_URL, PNG_DATA_URL],
  });

  assert.equal(form.get("model"), "gpt-image-2");
  assert.equal(form.get("image"), null);
  assert.equal(form.getAll("image[]").length, 2);
});
