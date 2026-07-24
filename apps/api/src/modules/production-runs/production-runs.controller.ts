import { Body, Controller, Get, Param, Post } from "@nestjs/common"
import { IsArray, IsNumber, IsOptional, IsString } from "class-validator"
import { ProductionRunsService } from "./production-runs.service"

class CreateVideoProductionRunDto {
  @IsString()
  projectId!: string

  @IsString()
  shotId!: string

  @IsString()
  sourceAssetId!: string

  @IsString()
  prompt!: string

  @IsNumber()
  durationSeconds!: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  referenceAssetIds: string[] = []

  @IsString()
  idempotencyKey!: string
}

@Controller("production-runs")
export class ProductionRunsController {
  constructor(private readonly productionRunsService: ProductionRunsService) {}

  @Post()
  async createProductionRun(@Body() body: CreateVideoProductionRunDto) {
    return { data: await this.productionRunsService.createVideoRun(body) }
  }

  @Get(":runId")
  async getProductionRun(@Param("runId") runId: string) {
    return { data: await this.productionRunsService.getRun(runId) }
  }

  @Post(":runId/poll")
  async pollProductionRun(@Param("runId") runId: string) {
    return { data: await this.productionRunsService.pollRun(runId) }
  }

  @Post(":runId/retry")
  async retryProductionRun(@Param("runId") runId: string) {
    return { data: await this.productionRunsService.retryRun(runId) }
  }

  @Post(":runId/cancel")
  async cancelProductionRun(@Param("runId") runId: string) {
    return { data: await this.productionRunsService.cancelRun(runId) }
  }
}
