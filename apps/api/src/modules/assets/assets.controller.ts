import { Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { memoryStorage } from "multer"
import { AssetsService } from "./assets.service"

@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async uploadAsset(@UploadedFile() file: Express.Multer.File, @Body("projectId") projectId?: string) {
    return {
      data: await this.assetsService.saveUpload(file, { projectId }),
    }
  }
}
