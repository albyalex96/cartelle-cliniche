-- Template dei referti: ogni tipo di referto è un elenco di campi deciso dagli amministratori.
CREATE TABLE "report_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_templates_name_key" ON "report_templates"("name");

-- I due tipi esistenti (esami di laboratorio e referto descrittivo) diventano i template predefiniti,
-- con gli stessi campi che il form aveva finora.
INSERT INTO "report_templates" ("id", "name", "description", "fields", "position", "updatedAt") VALUES
(
    '00000000-0000-4000-8000-000000000001',
    'Esami di laboratorio',
    'Analisi con valori: sangue, urine…',
    '[
      {"key": "facility", "type": "text_input", "label": "Struttura", "required": false, "ocr_enabled": true, "hint": "Ospedale, laboratorio o studio.", "options": []},
      {"key": "reportNumber", "type": "text_input", "label": "Numero del referto", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "doctor", "type": "text_input", "label": "Medico", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "doctorRole", "type": "text_input", "label": "Qualifica", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "samplingDate", "type": "date", "label": "Data del prelievo", "required": false, "ocr_enabled": true, "hint": "Il giorno in cui è stato fatto il prelievo, se indicato.", "options": []},
      {"key": "reportDate", "type": "date", "label": "Data del referto", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "results", "type": "lab_table", "label": "Valori", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "body", "type": "rich_text", "label": "Commento", "required": false, "ocr_enabled": true, "hint": "Eventuale commento del laboratorio (facoltativo).", "options": []}
    ]'::jsonb,
    0,
    CURRENT_TIMESTAMP
),
(
    '00000000-0000-4000-8000-000000000002',
    'Referto descrittivo',
    'Testo libero: risonanza, TAC, ecografia, visita…',
    '[
      {"key": "facility", "type": "text_input", "label": "Struttura", "required": false, "ocr_enabled": true, "hint": "Ospedale, laboratorio o studio.", "options": []},
      {"key": "reportNumber", "type": "text_input", "label": "Numero del referto", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "doctor", "type": "text_input", "label": "Medico", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "doctorRole", "type": "text_input", "label": "Qualifica", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "reportDate", "type": "date", "label": "Data del referto", "required": false, "ocr_enabled": true, "hint": "", "options": []},
      {"key": "body", "type": "rich_text", "label": "Testo del referto", "required": false, "ocr_enabled": true, "hint": "", "options": []}
    ]'::jsonb,
    1,
    CURRENT_TIMESTAMP
);
