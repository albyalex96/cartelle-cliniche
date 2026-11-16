import { syncQuerySchema, type SyncResponseDTO } from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { writeAudit } from './audit';
import { loadSyncImagingStudies } from './imaging';
import { toMedicationDTOs } from './medications';
import { listPatients } from './patients';
import { loadReportTemplates } from './report-templates';
import { reportInclude, toReportDTO } from './reports';

/**
 * Sincronizzazione incrementale dell'app mobile (vedi `SyncResponseDTO` in @alby/shared).
 *
 * Il cursore è l'istante d'inizio della sincronizzazione. Alla successiva si rileggono gli elementi
 * modificati (o eliminati) da `since − SYNC_OVERLAP_MS`: la sovrapposizione copre le modifiche ancora in corso
 * mentre si leggeva e piccole differenze tra l'orologio del server Node e quello del database. Qualche
 * elemento arriva quindi due volte, e il telefono lo sostituisce.
 */

/** Per quanto tempo si conservano le eliminazioni: un telefono fermo da più tempo rifà la sincronizzazione completa. */
export const SYNC_TOMBSTONE_RETENTION_DAYS = 180;
const SYNC_OVERLAP_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export async function syncChanges(ctx: RequestContext, rawQuery: unknown = {}): Promise<SyncResponseDTO> {
  const authed = requireUser(ctx);
  const { since: sinceRaw } = syncQuerySchema.parse(rawQuery);
  const now = new Date();
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const full =
    !since || since.getTime() > now.getTime() || now.getTime() - since.getTime() > SYNC_TOMBSTONE_RETENTION_DAYS * DAY_MS;
  const from = full ? null : new Date(since.getTime() - SYNC_OVERLAP_MS);

  // Elenco completo dei pazienti accessibili: permessi (e manutenzione) già applicati da `listPatients`.
  const patients = await listPatients(ctx);
  const ids = patients.map((p) => p.id);
  const canEdit = new Map(patients.map((p) => [p.id, p.canEdit]));
  const prisma = getPrisma();

  // Accesso concesso dopo l'ultima sincronizzazione: i dati di quel paziente possono essere più vecchi
  // del cursore, quindi vanno inviati tutti. Per l'amministratore un paziente nuovo ha comunque dati nuovi.
  let fullPatientIds: string[] = [];
  if (from && authed.user.role !== 'ADMIN' && ids.length) {
    const granted = await prisma.patientAccess.findMany({
      where: { userId: authed.user.id, patientId: { in: ids }, createdAt: { gte: from } },
      select: { patientId: true },
    });
    fullPatientIds = granted.map((g) => g.patientId);
  }
  const changed = from ? { OR: [{ patientId: { in: fullPatientIds } }, { updatedAt: { gte: from } }] } : {};

  const [templates, reportRows, medicationRows, imaging, tombstones] = await Promise.all([
    loadReportTemplates(),
    prisma.report.findMany({
      where: { patientId: { in: ids }, ...changed },
      include: reportInclude,
      orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.medication.findMany({ where: { patientId: { in: ids }, ...changed } }),
    // Completa: solo gli studi collegati a un referto (gli altri il telefono non li mostra). Incrementale: tutti
    // quelli cambiati, così un collegamento tolto (reportId null) arriva e lo studio sparisce dal telefono.
    loadSyncImagingStudies(from ? { patientId: { in: ids }, ...changed } : { patientId: { in: ids }, reportId: { not: null } }),
    from
      ? prisma.syncTombstone.findMany({
          where: { patientId: { in: ids }, deletedAt: { gte: from } },
          select: { entity: true, entityId: true },
        })
      : Promise.resolve([]),
  ]);

  const deleted: SyncResponseDTO['deleted'] = { reports: [], medications: [], imagingStudies: [] };
  for (const t of tombstones) {
    if (t.entity === 'report') deleted.reports.push(t.entityId);
    else if (t.entity === 'medication') deleted.medications.push(t.entityId);
    else if (t.entity === 'imaging_study') deleted.imagingStudies.push(t.entityId);
  }

  const result: SyncResponseDTO = {
    cursor: now.toISOString(),
    full,
    fullPatientIds,
    patients,
    templates,
    reports: reportRows.map((r) => toReportDTO(r, canEdit.get(r.patientId) === true)),
    medications: await toMedicationDTOs(medicationRows),
    imaging,
    deleted,
  };
  // Solo numeri nel registro: nessun dato sanitario.
  await writeAudit(ctx, 'sync.performed', {
    details: {
      full,
      patients: patients.length,
      reports: result.reports.length,
      medications: result.medications.length,
      imagingStudies: imaging.length,
      deleted: tombstones.length,
    },
  });
  return result;
}
