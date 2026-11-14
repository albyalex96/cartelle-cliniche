-- Categorie dei campi dei tipi di referto (e loro copia nei referti): raggruppano i campi nella pagina del referto.
ALTER TABLE "report_templates" ADD COLUMN "categories" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "reports" ADD COLUMN "categories" JSONB NOT NULL DEFAULT '[]';
