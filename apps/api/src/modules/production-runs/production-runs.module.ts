import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AssetsModule } from "../assets/assets.module"
import { AssetsService } from "../assets/assets.service"
import { PrismaService } from "../../prisma/prisma.service"
import { ProductionRunsController } from "./production-runs.controller"
import { ProductionRunsService } from "./production-runs.service"
import { DashScopeViduClient } from "./vidu/vidu-client"

@Module({
  imports: [AssetsModule],
  controllers: [ProductionRunsController],
  providers: [
    DashScopeViduClient,
    {
      provide: ProductionRunsService,
      inject: [PrismaService, ConfigService, AssetsService, DashScopeViduClient],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        assetsService: AssetsService,
        viduClient: DashScopeViduClient,
      ) => new ProductionRunsService(prisma, config, assetsService, viduClient),
    },
  ],
  exports: [ProductionRunsService],
})
export class ProductionRunsModule {}
