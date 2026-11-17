import { readScanArea } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

/**
 * Legge con l'OCR una pagina (o una zona) di un documento scansionato in revisione, per l'app mobile.
 * Non salva nulla. Permessi, OCR attivo e registro accessi: `readScanArea` in @alby/core.
 */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => readScanArea(ctx, id, await readJson(req)));
