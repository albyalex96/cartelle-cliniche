-- Ricerca dei codici scritti senza punti ("02391" per "02.39.1"): per il catalogo già importato aggiunge al testo
-- di ricerca i codici in forma compatta, come fa l'importazione. Riguarda solo il catalogo pubblico della Regione.
UPDATE "health_services"
SET "searchText" = "searchText" || ' ' || LOWER(REGEXP_REPLACE(CONCAT_WS(' ', "code", "alphaCode", "oldCode", "oldAlphaCode"), '[^[:alnum:] ]', '', 'g'))
WHERE COALESCE("code", "alphaCode", "oldCode", "oldAlphaCode") IS NOT NULL;
