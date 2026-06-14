import { Body, Controller, Get, Param, Post } from "@nestjs/common"
import { ProviderType } from "@prisma/client"
import { IsArray, IsEnum, IsIn, IsObject, IsOptional, IsString, ValidateNested } from "class-validator"
import { Type } from "class-transformer"
import { GenerationService } from "./generation.service"

class CreateStoryboardGenerationDto {
  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  providerCredentialId?: string

  @IsOptional()
  @IsEnum(ProviderType)
  providerType?: ProviderType

  @IsOptional()
  @IsString()
  model?: string

  @IsObject()
  input!: Record<string, unknown>
}

class CreateImageGenerationDto {
  @IsOptional()
  @IsString()
  projectId?: string

  @IsString()
  providerCredentialId!: string

  @IsString()
  prompt!: string

  @IsOptional()
  @IsString()
  negativePrompt?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsString()
  size?: string

  @IsOptional()
  @IsIn(["standard", "hd", "low", "medium", "high", "auto"])
  quality?: string

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>
}

class PlanCanvasActionsDto {
  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  providerCredentialId?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsIn(["ASK", "EXECUTE", "STORYBOARD", "ORGANIZE", "IMAGE_PROMPT"])
  mode?: "ASK" | "EXECUTE" | "STORYBOARD" | "ORGANIZE" | "IMAGE_PROMPT"

  @IsString()
  message!: string

  @IsOptional()
  @IsObject()
  canvas?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  references?: Array<Record<string, unknown>>
}

class ChatCompletionMessageDto {
  @IsIn(["system", "user", "assistant"])
  role!: "system" | "user" | "assistant"

  // Support both plain text and multimodal (vision) content arrays
  content!: string | Array<Record<string, unknown>>
}

class CreateChatCompletionDto {
  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  providerCredentialId?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatCompletionMessageDto)
  messages!: ChatCompletionMessageDto[]

  @IsOptional()
  @IsObject()
  canvas?: Record<string, unknown>
}

@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post("storyboard")
  async createStoryboardGeneration(@Body() body: CreateStoryboardGenerationDto) {
    return {
      data: await this.generationService.createStoryboardGenerationJob(body),
    }
  }

  @Post("images")
  async createImageGeneration(@Body() body: CreateImageGenerationDto) {
    return {
      data: await this.generationService.createImageGenerationJob(body),
    }
  }

  @Post("canvas-actions/plan")
  async planCanvasActions(@Body() body: PlanCanvasActionsDto) {
    return {
      data: await this.generationService.planCanvasActions(body),
    }
  }

  @Post("chat")
  async createChatCompletion(@Body() body: CreateChatCompletionDto) {
    return {
      data: await this.generationService.createChatCompletion(body),
    }
  }

  @Get("jobs/:id")
  async getGenerationJob(@Param("id") id: string) {
    return {
      data: await this.generationService.getGenerationJob(id),
    }
  }
}
