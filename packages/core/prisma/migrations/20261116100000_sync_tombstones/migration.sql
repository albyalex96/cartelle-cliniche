-- Elementi eliminati, per la sincronizzazione incrementale dell'app mobile.
CREATE TABLE "sync_tombstones" (
    "id" BIGSERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_tombstones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_tombstones_deletedAt_idx" ON "sync_tombstones"("deletedAt");

-- Le righe le scrive il database a ogni eliminazione (anche a cascata), così nessun percorso del codice
-- può dimenticarsene. TG_ARGV[0] = nome dell'entità.
-- L'ora è in UTC, come le date scritte da Prisma nelle colonne "timestamp" senza fuso: `now()` da solo
-- userebbe il fuso della sessione del database.
CREATE FUNCTION "sync_record_deletion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "sync_tombstones" ("entity", "entityId", "patientId", "deletedAt")
    VALUES (TG_ARGV[0], OLD."id", OLD."patientId", now() AT TIME ZONE 'UTC');
  RETURN OLD;
END;
$$;

CREATE TRIGGER "reports_sync_deletion" AFTER DELETE ON "reports"
  FOR EACH ROW EXECUTE FUNCTION "sync_record_deletion"('report');

CREATE TRIGGER "medications_sync_deletion" AFTER DELETE ON "medications"
  FOR EACH ROW EXECUTE FUNCTION "sync_record_deletion"('medication');
