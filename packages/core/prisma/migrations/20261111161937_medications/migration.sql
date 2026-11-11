-- CreateTable
CREATE TABLE "medications" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "aic" TEXT,
    "dosage" TEXT,
    "frequency" TEXT,
    "asNeeded" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "prescriber" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_packages" (
    "aic" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "package" TEXT,
    "activeIngredient" TEXT,
    "holder" TEXT,
    "form" TEXT,
    "atc" TEXT,
    "status" TEXT,
    "supply" TEXT,
    "leafletUrl" TEXT,
    "searchText" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_packages_pkey" PRIMARY KEY ("aic")
);

-- CreateIndex
CREATE INDEX "medications_patientId_endDate_idx" ON "medications"("patientId", "endDate");

-- CreateIndex
CREATE INDEX "drug_packages_name_idx" ON "drug_packages"("name");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
