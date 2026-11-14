-- Ogni referto ricorda il suo tipo (template) e la copia dei campi con cui è stato compilato.
ALTER TABLE "reports" ADD COLUMN "templateId" UUID,
ADD COLUMN "templateName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "fields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "custom" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "reports_templateId_idx" ON "reports"("templateId");

ALTER TABLE "reports" ADD CONSTRAINT "reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Referti già inseriti: diventano del tipo predefinito corrispondente, con i campi che il form mostrava finora.
UPDATE "reports" AS r
SET "templateId" = t."id", "templateName" = t."name", "fields" = t."fields"
FROM "report_templates" AS t
WHERE t."id" = CASE r."kind"
    WHEN 'LABORATORIO' THEN '00000000-0000-4000-8000-000000000001'::uuid
    ELSE '00000000-0000-4000-8000-000000000002'::uuid
END;

-- Il form mostrava la data del prelievo anche nei referti descrittivi che l'avevano: resta tra i loro campi.
UPDATE "reports"
SET "fields" = "fields" || '[{"key": "samplingDate", "type": "date", "label": "Data del prelievo", "required": false, "ocr_enabled": true, "hint": "Il giorno in cui è stato fatto il prelievo, se indicato.", "options": []}]'::jsonb
WHERE "kind" = 'DESCRITTIVO' AND "samplingDate" IS NOT NULL;
