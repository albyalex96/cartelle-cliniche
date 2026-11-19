import { idSchema, parseReportCategories, parseReportFields, parseReportTemplateIcon, reportTemplateImportSchema, reportTemplateInputSchema, type ReportTemplateDTO } from '@alby/shared';
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
  icon: string;
  fields: unknown;
  categories: unknown;
}

function toDTO(t: TemplateRow): ReportTemplateDTO {
  const fields = parseReportFields(t.fields);
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    icon: parseReportTemplateIcon(t.icon, fields),
    fields,
    categories: parseReportCategories(t.categories),
  };
}

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
    data: {
      name: input.name,
      description: input.description || null,
      icon: input.icon,
      fields: input.fields,
      categories: input.categories,
      position: (last._max.position ?? -1) + 1,
    },
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
    data: { name: input.name, description: input.description || null, icon: input.icon, fields: input.fields, categories: input.categories },
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

/**
 * Importa tipi di referto da un JSON esportato (file o codice copiato). Un nome già usato riceve un suffisso
 * ("Ecografia (2)"), così non si sovrascrive mai nulla. Tutto o niente: se un tipo non è valido non se ne crea nessuno.
 */
export async function importReportTemplates(ctx: RequestContext, text: unknown): Promise<{ created: string[] }> {
  requireAdmin(ctx);
  let raw: unknown;
  try {
    raw = JSON.parse(typeof text === 'string' ? text : '');
  } catch {
    throw new AppError(400, 'Il testo non è un JSON valido', 'BAD_JSON');
  }
  const parsed = reportTemplateImportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new AppError(422, `Tipi di referto non validi${where}: ${issue?.message ?? 'formato non riconosciuto'}`, 'BAD_TEMPLATE_IMPORT');
  }
  const prisma = getPrisma();
  const created = await prisma.$transaction(async (tx) => {
    const taken = new Set((await tx.reportTemplate.findMany({ select: { name: true } })).map((t) => t.name.toLowerCase()));
    let position = ((await tx.reportTemplate.aggregate({ _max: { position: true } }))._max.position ?? -1) + 1;
    const rows = [];
    for (const input of parsed.data) {
      let name = input.name;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${input.name.slice(0, 92)} (${n})`;
      taken.add(name.toLowerCase());
      rows.push(
        await tx.reportTemplate.create({
          data: { name, description: input.description || null, icon: input.icon, fields: input.fields, categories: input.categories, position: position++ },
        }),
      );
    }
    return rows;
  });
  for (const t of created) {
    await writeAudit(ctx, 'template.imported', { entity: 'report_template', entityId: t.id, details: { fields: (t.fields as unknown[]).length } });
  }
  return { created: created.map((t) => t.name) };
}
