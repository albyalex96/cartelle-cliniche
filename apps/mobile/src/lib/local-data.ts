import type { PatientDTO } from '@alby/shared';
import { getDb } from './db';

/** Letture dalla copia locale: funzionano anche senza connessione. */

export interface LocalPatient extends PatientDTO {
  reportCount: number;
  activeMedicationCount: number;
}

export async function listLocalPatients(): Promise<LocalPatient[]> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{ json: string; reports: number; meds: number }>(
    `SELECT p.json,
       (SELECT count(*) FROM reports r WHERE r.patientId = p.id) AS reports,
       (SELECT count(*) FROM medications m WHERE m.patientId = p.id
          AND (json_extract(m.json, '$.endDate') IS NULL OR json_extract(m.json, '$.endDate') > ?)) AS meds
     FROM patients p ORDER BY p.sortKey`,
    today,
  );
  return rows.map((r) => ({ ...(JSON.parse(r.json) as PatientDTO), reportCount: r.reports, activeMedicationCount: r.meds }));
}
