-- Ricerca dei farmaci per somiglianza (errori di battitura) e indice per trovare una parola dentro il testo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "drug_packages_searchText_idx" ON "drug_packages" USING GIN ("searchText" gin_trgm_ops);
