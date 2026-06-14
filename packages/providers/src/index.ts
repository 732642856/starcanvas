export interface TextGenerationInput {
  organizationId: string
  userId: string
  projectId?: string
  providerId: string
  apiKeyId?: string
  model: string
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  temperature?: number
  maxTokens?: number
}

export interface TextGenerationResult {
  content: string
  inputTokens?: number
  outputTokens?: number
  rawResponse?: unknown
}

export interface ProviderModel {
  id: string
  name: string
  capabilities: string[]
}

export interface ProviderAdapter {
  testConnection(): Promise<{ ok: boolean; message?: string }>
  listModels(): Promise<ProviderModel[]>
  generateText(input: TextGenerationInput): Promise<TextGenerationResult>
}
