import { fetchWithTimeout } from "../../../../lib/ai/server-fetch.ts";

const VIDU_OSS_TIMEOUT_MS = 60_000;
const VIDU_OSS_MODEL = "qwen-vl-plus";

type UploadPolicyResponse = {
  data?: {
    policy?: string;
    signature?: string;
    upload_dir?: string;
    upload_host?: string;
    oss_access_key_id?: string;
    x_oss_object_acl?: string;
    x_oss_forbid_overwrite?: string;
  };
};

type UploadPolicy = {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  x_oss_object_acl?: string;
  x_oss_forbid_overwrite?: string;
};

function parseDataUrl(input: string): { blob: Blob; extension: string } {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    throw new Error("Vidu OSS bridge requires a data:image/...;base64 payload.");
  }

  const mimeType = match[1] || "image/png";
  const base64 = match[2] || "";
  const binary = Buffer.from(base64, "base64");
  const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  return {
    blob: new Blob([binary], { type: mimeType }),
    extension,
  };
}

async function getUploadPolicy(apiKey: string, baseUrl: string): Promise<UploadPolicy> {
  const res = await fetchWithTimeout(
    `${baseUrl}/uploads?action=getPolicy&model=${encodeURIComponent(VIDU_OSS_MODEL)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
    VIDU_OSS_TIMEOUT_MS,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`DashScope upload policy error [${res.status}]: ${errorText}`);
  }

  const payload = await res.json() as UploadPolicyResponse;
  const data = payload.data;
  if (!data?.policy || !data.signature || !data.upload_dir || !data.upload_host || !data.oss_access_key_id) {
    throw new Error("DashScope upload policy response is incomplete.");
  }

  return {
    policy: data.policy,
    signature: data.signature,
    upload_dir: data.upload_dir,
    upload_host: data.upload_host,
    oss_access_key_id: data.oss_access_key_id,
    x_oss_object_acl: data.x_oss_object_acl,
    x_oss_forbid_overwrite: data.x_oss_forbid_overwrite,
  };
}

export async function uploadDataUrlToDashScopeOss(
  input: {
    dataUrl: string;
    apiKey: string;
    baseUrl: string;
    fileNamePrefix?: string;
  },
): Promise<string> {
  const { blob, extension } = parseDataUrl(input.dataUrl);
  const policy = await getUploadPolicy(input.apiKey, input.baseUrl);
  const prefix = input.fileNamePrefix?.trim() || "starcanvas-vidu";
  const fileName = `${prefix}-${Date.now()}.${extension}`;
  const key = `${policy.upload_dir}/${fileName}`;

  const form = new FormData();
  form.set("OSSAccessKeyId", policy.oss_access_key_id);
  form.set("policy", policy.policy);
  form.set("Signature", policy.signature);
  form.set("key", key);
  form.set("x-oss-object-acl", policy.x_oss_object_acl || "private");
  form.set("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite || "true");
  form.set("success_action_status", "200");
  form.set("file", blob, fileName);

  const uploadRes = await fetchWithTimeout(
    policy.upload_host,
    {
      method: "POST",
      body: form,
    },
    VIDU_OSS_TIMEOUT_MS,
  );

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text().catch(() => "Unknown error");
    throw new Error(`DashScope temp OSS upload failed [${uploadRes.status}]: ${errorText}`);
  }

  return `oss://${key}`;
}
