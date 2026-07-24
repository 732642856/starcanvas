import { copyFile, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { buildRollbackOperations } from "./story-video-batch-core.mjs"

const archiveName = process.argv[2]
const root = process.cwd()
const outputDir = join(root, "artifacts/太子替我背黑锅-full-production")
const archivesRoot = join(outputDir, "archives")

if (!archiveName || !/^[A-Za-z0-9_-]+$/.test(archiveName)) {
  throw new Error("Usage: STARCANVAS_ALLOW_VIDEO_ROLLBACK=1 node scripts/rollback-story-video-replacement.mjs <archive-name>")
}
if (process.env.STARCANVAS_ALLOW_VIDEO_ROLLBACK !== "1") {
  throw new Error("Rollback requires STARCANVAS_ALLOW_VIDEO_ROLLBACK=1")
}

const archiveDir = join(archivesRoot, archiveName)
const index = JSON.parse(await readFile(join(archiveDir, "rollback-index.json"), "utf8"))
const operations = buildRollbackOperations({ outputDir, replacements: index.replacements ?? [] })
const archivePrefix = `${resolve(archiveDir)}/`
const outputPrefix = `${resolve(outputDir)}/`

for (const operation of operations) {
  for (const source of [operation.fromVideo, operation.fromReceipt]) {
    if (!resolve(source).startsWith(archivePrefix)) throw new Error(`Invalid rollback source for ${operation.shotId}`)
  }
  for (const target of [operation.toVideo, operation.toReceipt]) {
    if (!resolve(target).startsWith(outputPrefix)) throw new Error(`Invalid rollback target for ${operation.shotId}`)
  }
  await copyFile(operation.fromVideo, operation.toVideo)
  await copyFile(operation.fromReceipt, operation.toReceipt)
}

await writeFile(
  join(archiveDir, "rollback-receipt.json"),
  `${JSON.stringify({ restoredAt: new Date().toISOString(), operations }, null, 2)}\n`,
)
console.log(JSON.stringify({ restored: operations.map((operation) => operation.shotId) }, null, 2))
