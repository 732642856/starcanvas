export interface CopseBatchImageModelsInput {
  baseUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
}

function batchModelsUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.hostname !== "copse.top") {
    throw new Error("Copse batch image is only available through copse.top.")
  }
  return `${url.toString().replace(/\/+$/, "")}/images/batches/models`
}

export async function fetchCopseBatchImageModels(input: CopseBatchImageModelsInput): Promise<string[]> {
  const response = await (input.fetchImpl ?? fetch)(batchModelsUrl(input.baseUrl), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.apiKey}` },
  })

  if (!response.ok) {
    throw new Error(`Copse batch image model catalog failed (${response.status}).`)
  }

  const payload = await response.json() as { data?: Array<{ id?: unknown }> }
  return (payload.data ?? [])
    .map((entry) => typeof entry.id === "string" ? entry.id.trim() : "")
    .filter(Boolean)
}
