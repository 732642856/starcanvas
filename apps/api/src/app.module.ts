import { Controller, Get, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AssetsModule } from "./modules/assets/assets.module"
import { AuthModule } from "./modules/auth/auth.module"
import { CanvasModule } from "./modules/canvas/canvas.module"
import { GenerationModule } from "./modules/generation/generation.module"
import { OrganizationsModule } from "./modules/organizations/organizations.module"
import { ProjectsModule } from "./modules/projects/projects.module"
import { ProductionRunsModule } from "./modules/production-runs/production-runs.module"
import { ProvidersModule } from "./modules/providers/providers.module"
import { UsageModule } from "./modules/usage/usage.module"
import { PrismaModule } from "./prisma/prisma.module"
import { PrismaService } from "./prisma/prisma.service"

@Controller("health")
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return {
      ok: true,
      service: "StarTrails API",
      database: this.prisma.connected ? "connected" : "unavailable",
      timestamp: new Date().toISOString(),
    }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AssetsModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    ProductionRunsModule,
    CanvasModule,
    ProvidersModule,
    GenerationModule,
    UsageModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
