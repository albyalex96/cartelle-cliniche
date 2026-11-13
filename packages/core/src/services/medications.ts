import { drugCatalogQuerySchema, drugCodeSchema, drugSearchSchema, idSchema, medicationInputSchema, type MedicationData, type MedicationDTO } from '@alby/shared';
import type { DrugCatalogPageDTO, DrugOptionsDTO, DrugSearchResultDTO, DrugSuggestionDTO, DrugVariantDTO } from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { AuthedContext, RequestContext } from '../context';
import { getPrisma, Prisma } from '../db';
import { notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';
import { renderTherapyPdf } from '@alby/pdf';
import { drugStrength, strengthOrder } from './drug-catalog';
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
    strength: m.strength,
    form: m.form,
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
    strength: input.strength,
    form: input.form,
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

const italianDate = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** PDF con le terapie in corso del paziente (farmaco, dose, frequenza), da stampare o portare con sé. */
export async function getTherapyPdf(ctx: RequestContext, rawPatientId: unknown): Promise<{ fileName: string; data: Uint8Array }> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  const patient = await getPrisma().patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true, birthDate: true } });
  if (!patient) throw notFound('Paziente');
  const active = (await listMedications(ctx, patientId)).filter((m) => m.active);
  const now = new Date();
  const data = await renderTherapyPdf({
    patientName: `${patient.firstName} ${patient.lastName}`,
    birthDate: patient.birthDate ? italianDate.format(patient.birthDate) : null,
    printedOn: italianDate.format(now),
    items: active,
  });
  await writeAudit(ctx, 'medication.exported', { entity: 'patient', entityId: patientId, details: { medications: active.length } });
  return { fileName: `Terapie ${patient.lastName} ${patient.firstName} ${now.toISOString().slice(0, 10)}.pdf`, data };
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

interface DrugGroupRow {
  code: string;
  name: string;
  activeIngredient: string | null;
  holder: string | null;
  authorized: number;
  forms: string[] | null;
  packages: string[] | null;
  hasLeaflet: boolean;
}

const SEARCH_LIMIT = 30;
const SIMILAR_LIMIT = 8;
const CATALOG_PAGE_SIZE = 50;

/** Le confezioni trovate, raggruppate per farmaco (prime 6 cifre del codice AIC) direttamente nel database. */
function drugGroups(where: Prisma.Sql, orderBy: Prisma.Sql, limit: number, offset = 0) {
  return getPrisma().$queryRaw<DrugGroupRow[]>`
    SELECT LEFT(aic, 6) AS code,
           MIN(name) AS name,
           MIN("activeIngredient") AS "activeIngredient",
           MIN(holder) AS holder,
           (COUNT(*) FILTER (WHERE status = 'Autorizzata'))::int AS authorized,
           (ARRAY_AGG(DISTINCT form) FILTER (WHERE form IS NOT NULL))[1:4] AS forms,
           (ARRAY_AGG(LOWER(package) ORDER BY aic) FILTER (WHERE package IS NOT NULL))[1:4] AS packages,
           COALESCE(BOOL_OR("leafletUrl" LIKE 'https://api.aifa.gov.it/%'), FALSE) AS "hasLeaflet"
    FROM drug_packages
    WHERE ${where}
    GROUP BY LEFT(aic, 6)
    ORDER BY ${orderBy}, MIN(name), LEFT(aic, 6)
    LIMIT ${limit} OFFSET ${offset}`;
}

const WITHDRAWN = Prisma.sql`(COUNT(*) FILTER (WHERE status = 'Autorizzata') = 0)`;

/** Parole da cercare: solo lettere e cifre, quindi nessun carattere speciale di LIKE. */
const searchWords = (query: string) => normalizeForSearch(query).split(' ').filter(Boolean).slice(0, 5);

/**
 * Cerca i farmaci per nome commerciale o principio attivo nell'elenco AIFA.
 * Sono dati pubblici: basta essere autenticati. Le confezioni dello stesso farmaco vengono raggruppate.
 * Se nulla corrisponde a quanto scritto, propone i farmaci dal nome più simile (errori di battitura).
 */
export async function searchDrugs(ctx: RequestContext, rawQuery: unknown): Promise<DrugSearchResultDTO> {
  requireUser(ctx);
  const words = searchWords(drugSearchSchema.parse(rawQuery));
  if (!words.length) return { catalogReady: true, approximate: false, items: [] };
  const { rows, approximate } = await findDrugs(words, SEARCH_LIMIT, 0);
  return drugResult(rows, approximate);
}

/**
 * Elenco dei farmaci da consultare, una pagina alla volta: senza testo tutto l'elenco in ordine alfabetico,
 * altrimenti la stessa ricerca usata quando si inserisce una terapia (compresi gli errori di battitura).
 * Dati pubblici: basta essere autenticati.
 */
export async function listDrugCatalog(ctx: RequestContext, raw: unknown): Promise<DrugCatalogPageDTO> {
  requireUser(ctx);
  const { q, sort, direction, page } = drugCatalogQuerySchema.parse(raw);
  const words = searchWords(q ?? '');
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  // Ordinamento scelto cliccando una colonna: prima i farmaci in commercio, poi la colonna nel verso scelto.
  // I farmaci senza principio attivo, forma o azienda restano in fondo in entrambi i versi.
  const dir = direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const column = { name: Prisma.sql`MIN(name)`, ingredient: Prisma.sql`MIN("activeIngredient")`, form: Prisma.sql`MIN(form)`, holder: Prisma.sql`MIN(holder)` };
  const orderBy = sort ? Prisma.sql`${WITHDRAWN}, ${column[sort]} ${dir} NULLS LAST` : undefined;
  // Una riga in più del necessario: dice se c'è una pagina successiva.
  const { rows, approximate } = words.length
    ? await findDrugs(words, CATALOG_PAGE_SIZE + 1, offset, orderBy)
    : { rows: await drugGroups(Prisma.sql`TRUE`, orderBy ?? Prisma.sql`MIN(name)`, CATALOG_PAGE_SIZE + 1, offset), approximate: false };
  const hasMore = rows.length > CATALOG_PAGE_SIZE;
  return { ...(await drugResult(rows.slice(0, CATALOG_PAGE_SIZE), approximate)), page, hasMore };
}

async function drugResult(rows: DrugGroupRow[], approximate: boolean): Promise<DrugSearchResultDTO> {
  if (!rows.length) {
    const catalogReady = (await getPrisma().drugPackage.findFirst({ select: { aic: true } })) !== null;
    return { catalogReady, approximate: false, items: [] };
  }
  const items: DrugSuggestionDTO[] = rows.map((r) => ({
    aic: r.code,
    name: titleCase(r.name),
    activeIngredient: r.activeIngredient ? capitalize(r.activeIngredient) : null,
    holder: r.holder,
    forms: r.forms ?? [],
    packages: r.packages ?? [],
    withdrawn: r.authorized === 0,
    hasLeaflet: r.hasLeaflet,
  }));
  return { catalogReady: true, approximate, items };
}

/** `orderBy` sostituisce l'ordine per pertinenza (quando si ordina per colonna). */
async function findDrugs(words: string[], limit: number, offset: number, orderBy?: Prisma.Sql): Promise<{ rows: DrugGroupRow[]; approximate: boolean }> {
  const and = (parts: Prisma.Sql[]) => Prisma.join(parts, ' AND ');
  const nameStarts = Prisma.sql`BOOL_OR("searchText" LIKE ${`${words[0]}%`})`;
  const byIngredient = Prisma.sql`BOOL_OR(${and(words.map((w) => Prisma.sql`LOWER("activeIngredient") LIKE ${`%${w}%`}`))})`;
  const onlyIngredient = Prisma.sql`BOOL_OR(LOWER(TRIM("activeIngredient")) = ${words.join(' ')})`;
  let approximate = false;
  let rows = await drugGroups(
    and(words.map((w) => Prisma.sql`"searchText" LIKE ${`%${w}%`}`)),
    // Prima i farmaci in commercio. Se si è scritto un principio attivo, prima i nomi commerciali
    // (Tachipirina) e poi gli equivalenti che si chiamano come il principio attivo (Paracetamolo …);
    // tra questi, prima chi contiene solo quel principio attivo e poi le associazioni.
    orderBy ??
      Prisma.sql`${WITHDRAWN},
      CASE WHEN ${byIngredient} AND NOT ${nameStarts} THEN 0 WHEN ${nameStarts} THEN 1 ELSE 2 END,
      COALESCE(${onlyIngredient}, FALSE) DESC`,
    limit,
    offset,
  );
  if (!rows.length && offset === 0) {
    // Nessuna corrispondenza esatta: ogni parola può anche solo somigliare a una parola del testo.
    // La soglia (più bassa di quella predefinita, 0.6) vale solo per questa transazione: così l'operatore
    // `<%` continua a usare l'indice e riconosce anche errori come "takipirina".
    const prisma = getPrisma();
    [, rows] = await prisma.$transaction([
      prisma.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.45`,
      drugGroups(
        and(words.map((w) => Prisma.sql`("searchText" LIKE ${`%${w}%`} OR ${w}::text <% "searchText")`)),
        Prisma.sql`MAX(${Prisma.join(words.map((w) => Prisma.sql`word_similarity(${w}::text, "searchText")`), ' + ')}) DESC, ${WITHDRAWN}`,
        SIMILAR_LIMIT,
      ),
    ]);
    approximate = rows.length > 0;
  }
  return { rows, approximate };
}

/**
 * Formulazioni e dosaggi in cui esiste un farmaco dell'elenco AIFA, da tutte le sue confezioni
 * (solo quelle ancora autorizzate, se ce ne sono). Dati pubblici: basta essere autenticati.
 */
export async function getDrugOptions(ctx: RequestContext, rawAic: unknown): Promise<DrugOptionsDTO> {
  requireUser(ctx);
  const aic = drugCodeSchema.parse(rawAic);
  const rows = await getPrisma().drugPackage.findMany({
    where: { aic: { startsWith: aic } },
    select: { package: true, form: true, status: true },
    orderBy: { aic: 'asc' },
  });
  const authorized = rows.filter((r) => r.status === 'Autorizzata');
  const variants = new Map<string, DrugVariantDTO & { order: number }>();
  for (const r of authorized.length ? authorized : rows) {
    const form = r.form?.trim() || null;
    const found = drugStrength(r.package);
    // Dosaggio non riconosciuto: si mostra la descrizione della confezione, così com'è.
    const strength = found ?? (r.package?.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase() || null);
    if (!form && !strength) continue;
    const key = `${form?.toLowerCase() ?? ''}|${strength ?? ''}`;
    if (!variants.has(key)) variants.set(key, { form, strength, order: found ? strengthOrder(found) : Number.POSITIVE_INFINITY });
  }
  const sorted = [...variants.values()].sort(
    (a, b) => (a.form ?? '').localeCompare(b.form ?? '', 'it') || a.order - b.order || (a.strength ?? '').localeCompare(b.strength ?? '', 'it'),
  );
  return { aic, variants: sorted.map(({ order: _o, ...v }) => v) };
}
