-- CreateTable
CREATE TABLE "imaging_studies" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "studyUid" TEXT NOT NULL,
    "studyDate" DATE,
    "description" TEXT,
    "modalities" TEXT[],
    "institution" TEXT,
    "accessionNumber" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imaging_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_series" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "seriesUid" TEXT NOT NULL,
    "number" INTEGER,
    "modality" TEXT,
    "description" TEXT,

    CONSTRAINT "imaging_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_instances" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "sopUid" TEXT NOT NULL,
    "instanceNumber" INTEGER,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imaging_studies_patientId_studyDate_idx" ON "imaging_studies"("patientId", "studyDate");

-- CreateIndex
CREATE UNIQUE INDEX "imaging_studies_patientId_studyUid_key" ON "imaging_studies"("patientId", "studyUid");

-- CreateIndex
CREATE UNIQUE INDEX "imaging_series_studyId_seriesUid_key" ON "imaging_series"("studyId", "seriesUid");

-- CreateIndex
CREATE INDEX "imaging_instances_seriesId_instanceNumber_idx" ON "imaging_instances"("seriesId", "instanceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "imaging_instances_seriesId_sopUid_key" ON "imaging_instances"("seriesId", "sopUid");

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_series" ADD CONSTRAINT "imaging_series_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "imaging_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_instances" ADD CONSTRAINT "imaging_instances_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "imaging_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
