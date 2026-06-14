import { Controller, Get } from "@nestjs/common"

@Controller("organizations")
export class OrganizationsController {
  @Get("current")
  currentOrganization() {
    return {
      data: {
        id: "dev-org",
        name: "个人工作区",
        role: "OWNER",
      },
    }
  }
}
