-- CreateTable
CREATE TABLE "health_services" (
    "id" TEXT NOT NULL,
    "regionalCode" TEXT NOT NULL,
    "code" TEXT,
    "nomenclatureName" TEXT,
    "alphaCode" TEXT,
    "oldCode" TEXT,
    "oldNomenclatureName" TEXT,
    "oldAlphaCode" TEXT,
    "name" TEXT NOT NULL,
    "standardName" TEXT,
    "shortName" TEXT,
    "active" BOOLEAN,
    "validFrom" DATE,
    "validFromRef" TEXT,
    "validTo" DATE,
    "validToRef" TEXT,
    "notes" TEXT,
    "accessType" TEXT,
    "tariff" DECIMAL(10,2),
    "therapeuticCycle" BOOLEAN,
    "branches" TEXT[],
    "tariffList" TEXT,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "health_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_service_imports" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "catalogSource" TEXT NOT NULL,
    "tariffSource" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_service_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_services_code_idx" ON "health_services"("code");

-- CreateIndex
CREATE INDEX "health_services_searchText_idx" ON "health_services" USING GIN ("searchText" gin_trgm_ops);
