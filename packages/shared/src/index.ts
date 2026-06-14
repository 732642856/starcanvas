export enum CanvasNodeType {
  TEXT = "TEXT",
  PROMPT = "PROMPT",
  IMAGE = "IMAGE",
  RESULT = "RESULT",
  NOTE = "NOTE",
  CHARACTER = "CHARACTER",
  SCENE = "SCENE",
  STORYBOARD = "STORYBOARD",
  PREVIS_3D = "PREVIS_3D",
  VIDEO = "VIDEO",
  GENERATION_TASK = "GENERATION_TASK",
}

export enum ProviderType {
  OPENAI_COMPATIBLE = "OPENAI_COMPATIBLE",
  OPENAI = "OPENAI",
  ANTHROPIC = "ANTHROPIC",
  DEEPSEEK = "DEEPSEEK",
  GEMINI = "GEMINI",
  FAL = "FAL",
  REPLICATE = "REPLICATE",
  STABILITY = "STABILITY",
}

export interface ApiResponse<T> {
  data: T
  requestId?: string
}
