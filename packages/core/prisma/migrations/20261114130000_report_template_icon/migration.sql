-- Icona dei tipi di referto: i tipi con la tabella dei valori prendono la provetta, gli altri il documento
-- (le stesse icone mostrate finora).
ALTER TABLE "report_templates" ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'file-text';

UPDATE "report_templates" SET "icon" = 'flask-conical' WHERE "fields" @> '[{"type": "lab_table"}]'::jsonb;
