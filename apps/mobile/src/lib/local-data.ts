import { buildLabTrends, type LabTrendDTO, type MedicationDTO, type PatientDTO, type ReportDTO, type SyncImagingStudyDTO } from '@alby/shared';
import { getDb } from './db';

/** Letture dalla copia locale: funzionano anche senza connessione. */

export interface LocalPatient extends PatientDTO {
  reportCount: number;
  activeMedicationCount: number;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Terapia in corso: senza data di fine o con la fine dopo oggi (calcolato qui: la copia può essere di giorni fa). */
export const isMedicationActive = (m: Pick<MedicationDTO, 'endDate'>) => !m.endDate || m.endDate > today();

export async function listLocalPatients(): Promise<LocalPatient[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string; reports: number; meds: number }>(
    `SELECT p.json,
       (SELECT count(*) FROM reports r WHERE r.patientId = p.id) AS reports,
       (SELECT count(*) FROM medications m WHERE m.patientId = p.id
          AND (json_extract(m.json, '$.endDate') IS NULL OR json_extract(m.json, '$.endDate') > ?)) AS meds
     FROM patients p ORDER BY p.sortKey`,
    today(),
  );
  return rows.map((r) => ({ ...(JSON.parse(r.json) as PatientDTO), reportCount: r.reports, activeMedicationCount: r.meds }));
}

export async function getLocalPatient(id: string): Promise<PatientDTO | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM patients WHERE id = ?', id);
  return row ? (JSON.parse(row.json) as PatientDTO) : null;
}

/** Referti del paziente, dal più recente. */
export async function listLocalReports(patientId: string): Promise<ReportDTO[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    `SELECT json FROM reports WHERE patientId = ?
     ORDER BY examDate DESC, json_extract(json, '$.createdAt') DESC`,
    patientId,
  );
  return rows.map((r) => JSON.parse(r.json) as ReportDTO);
}

export async function getLocalReport(id: string): Promise<ReportDTO | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM reports WHERE id = ?', id);
  return row ? (JSON.parse(row.json) as ReportDTO) : null;
}

/** Terapie: prima quelle in corso (per nome), poi le concluse (le più recenti prima), come nella webapp. */
export async function listLocalMedications(patientId: string): Promise<MedicationDTO[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM medications WHERE patientId = ?', patientId);
  return rows
    .map((r) => {
      const m = JSON.parse(r.json) as MedicationDTO;
      return { ...m, active: isMedicationActive(m) };
    })
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.active) return a.name.localeCompare(b.name, 'it');
      return (b.endDate ?? '').localeCompare(a.endDate ?? '');
    });
}

/** Andamento degli esami (stesso raggruppamento della webapp: `buildLabTrends` di @alby/shared). */
export async function listLocalTrends(patientId: string): Promise<LabTrendDTO[]> {
  const reports = (await listLocalReports(patientId)).reverse(); // dal più vecchio
  return buildLabTrends(
    reports.flatMap((r) =>
      r.results.map((x) => ({ ...x, reportId: r.id, reportTitle: r.title, date: r.examDate })),
    ),
  );
}

/** Documento di un referto salvato sul telefono (null se non ancora scaricato). */
export async function getLocalFile(id: string): Promise<{ mimeType: string; data: Uint8Array } | null> {
  const db = await getDb();
  return db.getFirstAsync<{ mimeType: string; data: Uint8Array }>('SELECT mimeType, data FROM files WHERE id = ?', id);
}

export interface LocalImagingStudy {
  id: string;
  description: string | null;
  studyDate: string | null;
  modalities: string[];
  /** Immagini già scaricate, in ordine di serie e di numero. */
  instanceIds: string[];
  /** Tutte le immagini dello studio (anche quelle non ancora scaricate). */
  total: number;
}

/** Studi di immagini collegati al referto, con le immagini disponibili sul telefono. */
export async function listLocalReportImages(reportId: string): Promise<LocalImagingStudy[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM imaging_studies WHERE reportId = ?', reportId);
  const have = new Set(
    (
      await db.getAllAsync<{ instanceId: string }>(
        'SELECT i.instanceId FROM images i JOIN imaging_studies s ON s.id = i.studyId WHERE s.reportId = ?',
        reportId,
      )
    ).map((r) => r.instanceId),
  );
  return rows
    .map((r) => JSON.parse(r.json) as SyncImagingStudyDTO)
    .sort((a, b) => (b.studyDate ?? '').localeCompare(a.studyDate ?? ''))
    .map((st) => {
      const all = st.series.flatMap((se) => se.instances.map((i) => i.id));
      return {
        id: st.id,
        description: st.description,
        studyDate: st.studyDate,
        modalities: st.modalities,
        instanceIds: all.filter((id) => have.has(id)),
        total: all.length,
      };
    });
}

/** Quante immagini (salvate sul telefono) ha il referto: per il pulsante "Immagini". */
export async function countLocalReportImages(reportId: string): Promise<number> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<{ n: number }>(
      'SELECT count(*) AS n FROM images i JOIN imaging_studies s ON s.id = i.studyId WHERE s.reportId = ?',
      reportId,
    ))?.n ?? 0
  );
}

export async function getLocalImage(instanceId: string): Promise<{ mimeType: string; data: Uint8Array } | null> {
  const db = await getDb();
  return db.getFirstAsync<{ mimeType: string; data: Uint8Array }>('SELECT mimeType, data FROM images WHERE instanceId = ?', instanceId);
}
