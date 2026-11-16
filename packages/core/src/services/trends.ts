/**
 * Andamento nel tempo degli esami di laboratorio: i valori di tutti i referti del paziente,
 * raggruppati per esame (riconosciuto anche con nomi diversi) e per unità di misura.
 */
import { buildLabTrends, idSchema, type LabTrendDTO } from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';

const parseId = (raw: unknown, what: string) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw notFound(what);
  return id.data;
};

async function buildTrends(patientId: string): Promise<LabTrendDTO[]> {
  const rows = await getPrisma().labResult.findMany({
    where: { report: { patientId } },
    select: {
      section: true,
      name: true,
      value: true,
      numericValue: true,
      unit: true,
      referenceRange: true,
      outOfRange: true,
      report: { select: { id: true, title: true, examDate: true } },
    },
    orderBy: [{ report: { examDate: 'asc' } }, { report: { createdAt: 'asc' } }, { position: 'asc' }],
  });

  return buildLabTrends(
    rows.map(({ report, ...r }) => ({
      ...r,
      reportId: report.id,
      reportTitle: report.title,
      date: report.examDate.toISOString().slice(0, 10),
    })),
  );
}

/** Tutti gli esami del paziente con i loro valori nel tempo (per la scheda "Andamento"). */
export async function listLabTrends(ctx: RequestContext, rawPatientId: unknown): Promise<LabTrendDTO[]> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  return buildTrends(patientId);
}

/** L'andamento di un singolo esame (tutte le unità di misura con cui è stato misurato). */
export async function getLabTrend(ctx: RequestContext, rawPatientId: unknown, rawKey: unknown): Promise<LabTrendDTO[]> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  const key = typeof rawKey === 'string' && /^[a-z0-9-]{1,100}$/.test(rawKey) ? rawKey : null;
  if (!key) throw notFound('Esame');
  const trends = (await buildTrends(patientId)).filter((t) => t.key === key);
  if (!trends.length) throw notFound('Esame');
  // Nel registro solo il paziente: anche il nome dell'esame consultato è un dato sanitario.
  await writeAudit(ctx, 'lab.trend_viewed', { entity: 'patient', entityId: patientId });
  return trends.sort((a, b) => b.points.length - a.points.length);
}
