-- AlterTable
ALTER TABLE "imaging_studies" ADD COLUMN     "reportId" UUID;

-- CreateIndex
CREATE INDEX "imaging_studies_reportId_idx" ON "imaging_studies"("reportId");

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
