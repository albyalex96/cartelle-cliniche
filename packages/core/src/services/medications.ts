import { drugSearchSchema, idSchema, medicationInputSchema, type MedicationData, type MedicationDTO } from '@alby/shared';
import type { DrugSearchResultDTO, DrugSuggestionDTO } from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { AuthedContext, RequestContext } from '../context';
import { getPrisma, type Prisma } from '../db';
import { notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { normalizeForSearch } from './patients';

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOnly = (v: string) => new Date(`${v}T00:00:00.000Z`);
const today = () => new Date().toISOString().slice(0, 10);

const parseId = (raw: unknown, what: string) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw notFound(what);
  return id.data;
};

type MedicationRow = Prisma.MedicationGetPayload<object>;

function toDTO(m: MedicationRow, leaflets: Map<string, string>): MedicationDTO {
  const endDate = isoDate(m.endDate);
  return {
    id: m.id,
    patientId: m.patientId,
    name: m.name,
    activeIngredient: m.activeIngredient,
    aic: m.aic,
    dosage: m.dosage,
    frequency: m.frequency,
    asNeeded: m.asNeeded,
    reason: m.reason,
    prescriber: m.prescriber,
    startDate: isoDate(m.startDate),
    endDate,
    notes: m.notes,
    active: !endDate || endDate > today(),
    leafletUrl: (m.aic && leaflets.get(m.aic.slice(0, 6))) || null,
    updatedAt: m.updatedAt.toISOString(),
  };
}

/** Link al foglietto illustrativo AIFA dei farmaci scelti dall'elenco (uno per prodotto). */
async function leafletsFor(rows: MedicationRow[]): Promise<Map<string, string>> {
  const codes = [...new Set(rows.map((r) => r.aic?.slice(0, 6)).filter((c): c is string => !!c))];
  const map = new Map<string, string>();
  if (!codes.length) return map;
  const found = await getPrisma().drugPackage.findMany({
    where: { OR: codes.map((c) => ({ aic: { startsWith: c } })), leafletUrl: { not: null } },
    select: { aic: true, leafletUrl: true },
  });
  for (const f of found) if (f.leafletUrl && /^https:\/\//.test(f.leafletUrl)) map.set(f.aic.slice(0, 6), f.leafletUrl);
  return map;
}

function toData(input: MedicationData) {
  return {
    name: input.name,
    activeIngredient: input.activeIngredient,
    aic: input.aic,
    dosage: input.dosage,
    frequency: input.frequency,
    asNeeded: input.asNeeded,
    reason: input.reason,
    prescriber: input.prescriber,
    startDate: input.startDate ? dateOnly(input.startDate) : null,
    endDate: input.endDate ? dateOnly(input.endDate) : null,
    notes: input.notes,
  };
}

async function loadMedication(ctx: AuthedContext, rawId: unknown) {
  const id = parseId(rawId, 'Farmaco');
  const row = await getPrisma().medication.findUnique({ where: { id } });
  if (!row) throw notFound('Farmaco');
  await requirePatientPermission(ctx, row.patientId, 'edit');
  return row;
}

/** Terapie del paziente: prima quelle in corso (in ordine di nome), poi le concluse (le più recenti prima). */
export async function listMedications(ctx: RequestContext, rawPatientId: unknown): Promise<MedicationDTO[]> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  const rows = await getPrisma().medication.findMany({ where: { patientId } });
  const leaflets = await leafletsFor(rows);
  const list = rows.map((r) => toDTO(r, leaflets));
  return list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.active) return a.name.localeCompare(b.name, 'it');
    return (b.endDate ?? '').localeCompare(a.endDate ?? '');
  });
}

export async function createMedication(ctx: RequestContext, rawPatientId: unknown, raw: unknown): Promise<MedicationDTO> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');
  const input = medicationInputSchema.parse(raw);
  const row = await getPrisma().medication.create({ data: { ...toData(input), patientId, createdById: authed.user.id } });
  await writeAudit(ctx, 'medication.created', { entity: 'medication', entityId: row.id, details: { patientId } });
  return toDTO(row, await leafletsFor([row]));
}

export async function updateMedication(ctx: RequestContext, rawId: unknown, raw: unknown): Promise<MedicationDTO> {
  const authed = requireUser(ctx);
  const current = await loadMedication(authed, rawId);
  const input = medicationInputSchema.parse(raw);
  const row = await getPrisma().medication.update({ where: { id: current.id }, data: toData(input) });
  await writeAudit(ctx, 'medication.updated', { entity: 'medication', entityId: row.id, details: { patientId: row.patientId } });
  return toDTO(row, await leafletsFor([row]));
}

/** Conclude la terapia oggi (se non era già conclusa). */
export async function stopMedication(ctx: RequestContext, rawId: unknown): Promise<MedicationDTO> {
  const authed = requireUser(ctx);
  const current = await loadMedication(authed, rawId);
  const end = today();
  // Una terapia iniziata "nel futuro" si chiude il giorno stesso dell'inizio, mai prima.
  const start = isoDate(current.startDate);
  const endDate = dateOnly(start && start > end ? start : end);
  const row = await getPrisma().medication.update({ where: { id: current.id }, data: { endDate } });
  await writeAudit(ctx, 'medication.stopped', { entity: 'medication', entityId: row.id, details: { patientId: row.patientId } });
  return toDTO(row, await leafletsFor([row]));
}

export async function deleteMedication(ctx: RequestContext, rawId: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const current = await loadMedication(authed, rawId);
  await getPrisma().medication.delete({ where: { id: current.id } });
  await writeAudit(ctx, 'medication.deleted', { entity: 'medication', entityId: current.id, details: { patientId: current.patientId } });
  return { patientId: current.patientId };
}

// ───────────────────────────── ricerca nell'elenco AIFA ─────────────────────────────

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * Cerca i farmaci per nome commerciale o principio attivo nell'elenco AIFA.
 * Sono dati pubblici: basta essere autenticati. Le confezioni dello stesso farmaco vengono raggruppate.
 */
export async function searchDrugs(ctx: RequestContext, rawQuery: unknown): Promise<DrugSearchResultDTO> {
  requireUser(ctx);
  const query = drugSearchSchema.parse(rawQuery);
  const prisma = getPrisma();
  const words = normalizeForSearch(query).split(' ').filter(Boolean).slice(0, 5);
  if (!words.length) return { catalogReady: true, items: [] };

  const rows = await prisma.drugPackage.findMany({
    where: { AND: words.map((w) => ({ searchText: { contains: w } })) },
    select: { aic: true, name: true, package: true, activeIngredient: true, holder: true, form: true, status: true },
    orderBy: [{ name: 'asc' }, { aic: 'asc' }],
    take: 400,
  });
  if (!rows.length) {
    const catalogReady = (await prisma.drugPackage.findFirst({ select: { aic: true } })) !== null;
    return { catalogReady, items: [] };
  }

  const first = words[0]!;
  const groups = new Map<string, DrugSuggestionDTO & { authorized: number; nameMatch: boolean }>();
  for (const r of rows) {
    const code = r.aic.slice(0, 6);
    let g = groups.get(code);
    if (!g) {
      g = {
        aic: code,
        name: titleCase(r.name),
        activeIngredient: r.activeIngredient ? capitalize(r.activeIngredient) : null,
        holder: r.holder,
        forms: [],
        packages: [],
        withdrawn: false,
        authorized: 0,
        nameMatch: normalizeForSearch(r.name).startsWith(first),
      };
      groups.set(code, g);
    }
    if (r.status === 'Autorizzata') g.authorized++;
    if (r.form && !g.forms.includes(r.form) && g.forms.length < 4) g.forms.push(r.form);
    if (r.package && g.packages.length < 4) g.packages.push(r.package.toLowerCase());
  }
  const items = [...groups.values()]
    .map((g) => ({ ...g, withdrawn: g.authorized === 0 }))
    // Prima i farmaci il cui nome inizia con la parola cercata, poi quelli ancora in commercio.
    .sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || Number(a.withdrawn) - Number(b.withdrawn) || a.name.localeCompare(b.name, 'it'))
    .slice(0, 15)
    .map(({ authorized: _a, nameMatch: _n, ...item }) => item);
  return { catalogReady: true, items };
}
