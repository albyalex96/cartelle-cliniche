-- Ordinamento per branca: le branche di ogni voce in ordine alfabetico e, accanto, lo stesso elenco come testo.
ALTER TABLE "health_services" ADD COLUMN "branchText" TEXT;

UPDATE "health_services" SET "branches" = ARRAY(SELECT b FROM UNNEST("branches") AS b ORDER BY b) WHERE CARDINALITY("branches") > 1;
UPDATE "health_services" SET "branchText" = ARRAY_TO_STRING("branches", ', ') WHERE CARDINALITY("branches") > 0;
