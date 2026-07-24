-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductionRunStatus" AS ENUM ('QUEUED', 'SUBMITTING', 'POLLING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProductionTaskStatus" AS ENUM ('QUEUED', 'SUBMITTING', 'POLLING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "status" "ProductionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionTask" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "ProductionTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "generationJobId" TEXT,
    "providerJobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ProductionTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "request" JSONB NOT NULL,
    "providerResult" JSONB,
    "errorMessage" TEXT,
    "sourceAssetId" TEXT NOT NULL,
    "outputAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_projectId_createdAt_idx" ON "Asset"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionRun_projectId_shotId_createdAt_idx" ON "ProductionRun"("projectId", "shotId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionTask_runId_status_idx" ON "ProductionTask"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionAttempt_idempotencyKey_key" ON "ProductionAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductionAttempt_providerJobId_idx" ON "ProductionAttempt"("providerJobId");

-- CreateIndex
CREATE INDEX "ProductionAttempt_taskId_createdAt_idx" ON "ProductionAttempt"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAttempt" ADD CONSTRAINT "ProductionAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProductionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAttempt" ADD CONSTRAINT "ProductionAttempt_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAttempt" ADD CONSTRAINT "ProductionAttempt_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAttempt" ADD CONSTRAINT "ProductionAttempt_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
