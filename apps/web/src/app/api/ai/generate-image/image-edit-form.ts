function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function buildImageEditFormData(params: {
  model: string;
  prompt: string;
  size: string;
  sourceImageValues: string[];
}): FormData {
  const { model, prompt, size, sourceImageValues } = params;
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", "1");
  form.append("response_format", "b64_json");

  sourceImageValues.forEach((sourceImage, index) => {
    const blob = dataUrlToBlob(sourceImage);
    const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
    // OpenAI-compatible /images/edits expects an array field, including one reference.
    form.append("image[]", blob, `reference-${index}.${ext}`);
  });

  return form;
}
