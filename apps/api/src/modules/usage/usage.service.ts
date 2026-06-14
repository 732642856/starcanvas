import { Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { ProjectsService } from "../projects/projects.service"

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getCurrentMonthSummary() {
    const { user, organization } = await this.projectsService.ensureDevContext()
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const records = await this.prisma.usageRecord.findMany({
      where: {
        organizationId: organization.id,
        userId: user.id,
        createdAt: { gte: periodStart },
      },
      select: {
        inputTokens: true,
        outputTokens: true,
      },
    })

    return records.reduce(
      (summary, record) => {
        summary.inputTokens += record.inputTokens
        summary.outputTokens += record.outputTokens
        return summary
      },
      {
        organizationId: organization.id,
        period: "current_month",
        inputTokens: 0,
        outputTokens: 0,
      },
    )
  }
}
