/**
 * Andamento nel tempo degli esami di laboratorio: i valori di tutti i referti del paziente,
 * raggruppati per esame (riconosciuto anche con nomi diversi) e per unità di misura.
 */
import { analyteCategoryRank, idSchema, matchAnalyte, normalizeUnit, type AnalyteCategory, type LabTrendDTO } from '@alby/shared';
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

  const groups = new Map<string, LabTrendDTO & { unitKey: string }>();
  for (const r of rows) {
    const analyte = matchAnalyte(r.name, r.section);
    const unitKey = normalizeUnit(r.unit);
    const id = `${analyte.key}\u0000${unitKey}`;
    let g = groups.get(id);
    if (!g) {
      g = { key: analyte.key, label: analyte.label, category: analyte.category, known: analyte.known, unit: r.unit, unitKey, points: [], numericCount: 0 };
      groups.set(id, g);
    }
    g.points.push({
      date: r.report.examDate.toISOString().slice(0, 10),
      value: r.value,
      numericValue: r.numericValue,
      outOfRange: r.outOfRange,
      referenceRange: r.referenceRange,
      name: r.name,
      reportId: r.report.id,
      reportTitle: r.report.title,
    });
    if (r.numericValue !== null) g.numericCount++;
  }

  return [...groups.values()]
    .map(({ unitKey: _u, ...g }) => {
      // Esami non in catalogo: come nome si usa quello del referto più recente.
      if (!g.known) g.label = g.points.at(-1)!.name;
      return g;
    })
    .sort(
      (a, b) =>
        analyteCategoryRank(a.category as AnalyteCategory) - analyteCategoryRank(b.category as AnalyteCategory) ||
        Number(b.known) - Number(a.known) ||
        a.label.localeCompare(b.label, 'it') ||
        b.points.length - a.points.length,
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
