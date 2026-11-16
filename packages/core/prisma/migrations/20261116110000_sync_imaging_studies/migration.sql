-- Anche gli studi di immagini eliminati vanno tolti dal telefono (stessa funzione dei referti e delle terapie).
CREATE TRIGGER "imaging_studies_sync_deletion" AFTER DELETE ON "imaging_studies"
  FOR EACH ROW EXECUTE FUNCTION "sync_record_deletion"('imaging_study');
