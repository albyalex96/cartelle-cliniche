import { idSchema, parseReportCategories, parseReportFields, reportTemplateInputSchema, type ReportTemplateDTO } from '@alby/shared';
import { requireAdmin, requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError, notFound } from '../errors';
import { writeAudit } from './audit';

/**
 * Tipi di referto (template): li creano e li modificano solo gli amministratori; tutti gli utenti li
 * leggono, per scegliere il tipo quando inseriscono un referto. Non contengono dati sanitari.
 */

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  fields: unknown;
  categories: unknown;
}

const toDTO = (t: TemplateRow): ReportTemplateDTO => ({
  id: t.id,
  name: t.name,
  description: t.description ?? '',
  fields: parseReportFields(t.fields),
  categories: parseReportCategories(t.categories),
});

/** Tutti i tipi, nell'ordine in cui vanno proposti. Chi chiama ha già verificato l'utente. */
export async function loadReportTemplates(): Promise<ReportTemplateDTO[]> {
  const rows = await getPrisma().reportTemplate.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
  return rows.map(toDTO);
}

export async function listReportTemplates(ctx: RequestContext): Promise<ReportTemplateDTO[]> {
  requireUser(ctx);
  return loadReportTemplates();
}

const parseId = (raw: unknown) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw notFound('Tipo di referto');
  return id.data;
};

async function requireFreeName(name: string, exceptId?: string) {
  const other = await getPrisma().reportTemplate.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
  if (other && other.id !== exceptId) throw new AppError(409, 'Esiste già un tipo di referto con questo nome', 'TEMPLATE_NAME_TAKEN');
}

export async function createReportTemplate(ctx: RequestContext, raw: unknown): Promise<ReportTemplateDTO> {
  requireAdmin(ctx);
  const input = reportTemplateInputSchema.parse(raw);
  await requireFreeName(input.name);
  const prisma = getPrisma();
  const last = await prisma.reportTemplate.aggregate({ _max: { position: true } });
  const template = await prisma.reportTemplate.create({
    data: { name: input.name, description: input.description || null, fields: input.fields, categories: input.categories, position: (last._max.position ?? -1) + 1 },
  });
  await writeAudit(ctx, 'template.created', { entity: 'report_template', entityId: template.id, details: { fields: input.fields.length } });
  return toDTO(template);
}

export async function updateReportTemplate(ctx: RequestContext, rawId: unknown, raw: unknown): Promise<ReportTemplateDTO> {
  requireAdmin(ctx);
  const id = parseId(rawId);
  const input = reportTemplateInputSchema.parse(raw);
  const prisma = getPrisma();
  if (!(await prisma.reportTemplate.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Tipo di referto');
  await requireFreeName(input.name, id);
  const template = await prisma.reportTemplate.update({
    where: { id },
    data: { name: input.name, description: input.description || null, fields: input.fields, categories: input.categories },
  });
  await writeAudit(ctx, 'template.updated', { entity: 'report_template', entityId: id, details: { fields: input.fields.length } });
  return toDTO(template);
}

/** Elimina un tipo. Deve restarne almeno uno, altrimenti non si potrebbero più inserire referti. */
export async function deleteReportTemplate(ctx: RequestContext, rawId: unknown): Promise<void> {
  requireAdmin(ctx);
  const id = parseId(rawId);
  const prisma = getPrisma();
  if (!(await prisma.reportTemplate.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Tipo di referto');
  if ((await prisma.reportTemplate.count()) <= 1) throw new AppError(409, 'Deve restare almeno un tipo di referto', 'LAST_TEMPLATE');
  await prisma.reportTemplate.delete({ where: { id } });
  await writeAudit(ctx, 'template.deleted', { entity: 'report_template', entityId: id });
}
