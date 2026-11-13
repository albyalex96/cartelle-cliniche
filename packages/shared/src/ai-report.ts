/**
 * Referto trascritto da un assistente IA esterno a partire da una foto.
 * L'utente copia il prompt qui sotto nell'assistente che preferisce, allega la foto e incolla la risposta
 * nella webapp: la risposta viene letta nel browser e usata solo per precompilare il form, da ricontrollare.
 * La webapp non invia nulla ad alcun servizio.
 */
import { z } from 'zod';
import { REPORT_KINDS } from './constants';
import type { ReportDraftDTO } from './dto';

export const AI_REPORT_PROMPT = `Ti invio la foto di un referto medico italiano. Trascrivilo in un oggetto JSON seguendo esattamente lo schema qui sotto. Rispondi SOLO con il JSON dentro un blocco di codice, senza commenti prima o dopo.

REGOLE
- Non riportare MAI dati del paziente: nome, cognome, data di nascita, codice fiscale, indirizzo, telefono, numero di tessera. Ignorali anche se li vedi.
- Non inventare e non correggere nulla: trascrivi quello che è scritto. Se un dato non c'è o non si legge, usa null. Se un valore è illeggibile non indovinarlo: salta la riga e segnalalo in "warnings".
- Date nel formato AAAA-MM-GG.
- "kind": "LABORATORIO" se il referto è una tabella di valori (sangue, urine…), "DESCRITTIVO" se è testo libero (risonanza, TAC, ecografia, visita…).
- Per LABORATORIO compila "results" e metti in "body" solo l'eventuale commento del laboratorio (altrimenti null). Per DESCRITTIVO lascia "results" vuoto e metti in "body" il testo completo del referto, mantenendo i paragrafi.
- In "value" scrivi il valore esattamente come stampato, con la virgola decimale italiana e gli eventuali simboli ("13,8", "< 0,5", "Negativo").
- "outOfRange": true se il referto segnala il valore come anomalo (asterisco, grassetto, H/L, freccia) oppure se è chiaramente fuori dall'intervallo di riferimento; false se è nella norma; null se non si può dire.
- "section" è il titolo del gruppo a cui appartiene l'esame ("Emocromo", "Esame urine"…), null se non ci sono gruppi.
- Mantieni l'ordine degli esami come nel referto.
- In "warnings" elenca, in italiano, tutto ciò che va ricontrollato a mano: parti illeggibili, righe saltate, dubbi di lettura. Se non c'è nulla, lista vuota.

SCHEMA
{
  "kind": "LABORATORIO" | "DESCRITTIVO",
  "title": "titolo breve, es. \\"Esami del sangue\\" o \\"RM ginocchio destro\\"",
  "examDate": "AAAA-MM-GG (data dell'esame)",
  "samplingDate": "AAAA-MM-GG o null (data del prelievo, solo laboratorio)",
  "reportDate": "AAAA-MM-GG o null (data di refertazione)",
  "reportNumber": "numero del referto o di accettazione, o null",
  "facility": "struttura che ha eseguito l'esame, o null",
  "doctor": "medico che firma il referto, o null",
  "doctorRole": "qualifica del medico, o null",
  "body": "testo del referto descrittivo o commento del laboratorio, o null",
  "results": [
    {
      "section": "gruppo o null",
      "name": "nome dell'esame",
      "value": "valore come stampato",
      "unit": "unità di misura o null",
      "referenceRange": "intervallo di riferimento come stampato, o null",
      "outOfRange": true | false | null
    }
  ],
  "warnings": ["..."]
}

Se la foto contiene più referti distinti, trascrivi solo il primo e scrivilo in "warnings".`;

/** Dimensione massima del testo incollato. */
const MAX_TEXT = 200_000;

export type AiReportResult =
  | { ok: true; values: ReportDraftDTO['values']; warnings: string[] }
  | { ok: false; message: string };

/** Testo: accetta anche numeri (l'IA a volte scrive 13.8 invece di "13,8") e `null`. */
const text = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '').trim()))
  .catch('');

/** Data AAAA-MM-GG; accetta anche GG/MM/AAAA. Qualsiasi altra cosa diventa vuota (si inserisce a mano). */
const date = text.transform((v) => {
  const it = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const iso = it ? `${it[3]}-${it[2]!.padStart(2, '0')}-${it[1]!.padStart(2, '0')}` : v.slice(0, 10);
  return z.iso.date().safeParse(iso).success ? iso : '';
});

const rowSchema = z.object({
  section: text,
  name: text,
  value: text,
  unit: text,
  referenceRange: text,
  outOfRange: z.boolean().nullable().catch(null),
});

const reportSchema = z.object({
  kind: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(REPORT_KINDS)).optional(),
  title: text,
  examDate: date,
  samplingDate: date,
  reportDate: date,
  reportNumber: text,
  facility: text,
  doctor: text,
  doctorRole: text,
  body: text,
  results: z.array(z.unknown()).catch([]),
  warnings: z.array(z.unknown()).catch([]),
});

/** Il JSON dentro la risposta: tolto l'eventuale blocco di codice e il testo attorno. */
function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1] ?? raw;
  const start = fenced.search(/[[{]/);
  const end = Math.max(fenced.lastIndexOf('}'), fenced.lastIndexOf(']'));
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Legge la risposta dell'assistente e la porta nella forma del form dei referti.
 * È tollerante (campi mancanti restano vuoti): i controlli veri li fa il form al salvataggio.
 */
export function parseAiReport(raw: string): AiReportResult {
  if (!raw.trim()) return { ok: false, message: 'Incolla la risposta dell’assistente' };
  if (raw.length > MAX_TEXT) return { ok: false, message: 'Il testo incollato è troppo lungo' };

  let json = extractJson(raw);
  const warnings: string[] = [];
  if (Array.isArray(json)) {
    if (json.length > 1) warnings.push(`La risposta contiene ${json.length} referti: è stato usato solo il primo.`);
    json = json[0];
  }
  const parsed = reportSchema.safeParse(json);
  if (json === undefined || !parsed.success) {
    return { ok: false, message: 'Non riconosco la risposta: deve essere il JSON prodotto con il prompt, copiato per intero' };
  }
  const r = parsed.data;

  const results: ReportDraftDTO['values']['results'] = [];
  let skipped = 0;
  for (const item of r.results) {
    const row = rowSchema.safeParse(item);
    if (row.success && row.data.name && row.data.value) results.push(row.data);
    else skipped++;
  }
  if (skipped > 0) warnings.push(skipped === 1 ? 'Una riga senza nome o valore è stata scartata.' : `${skipped} righe senza nome o valore sono state scartate.`);
  if (!r.examDate) warnings.push('La data dell’esame non è stata letta: inseriscila a mano.');
  for (const w of r.warnings) if (typeof w === 'string' && w.trim()) warnings.push(w.trim().slice(0, 500));

  const kind = r.kind ?? (results.length > 0 ? 'LABORATORIO' : 'DESCRITTIVO');
  if (!r.title && !r.body && results.length === 0) return { ok: false, message: 'La risposta non contiene dati del referto' };

  return {
    ok: true,
    warnings: warnings.slice(0, 30),
    values: {
      kind,
      title: r.title,
      examDate: r.examDate,
      samplingDate: r.samplingDate,
      reportDate: r.reportDate,
      reportNumber: r.reportNumber,
      facility: r.facility,
      doctor: r.doctor,
      doctorRole: r.doctorRole,
      body: r.body,
      notes: '',
      results: kind === 'LABORATORIO' ? results : [],
    },
  };
}
