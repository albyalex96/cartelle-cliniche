/**
 * Prestazioni specialistiche ambulatoriali del Servizio sanitario della Regione Puglia.
 * Fonte: i file Excel pubblici del portale SIST (Sistema Informativo Sanitario Territoriale):
 *  - "Catalogo Unico Regionale delle Prestazioni Specialistiche": una riga per voce, con tutti i codici;
 *  - "Nomenclatore Tariffario Completo": tariffa e branca per codice del nomenclatore.
 * L'elenco viene sostituito per intero a ogni importazione. Sono dati pubblici: nessun dato dei pazienti.
 */
import { healthServiceIdSchema, healthServiceListQuerySchema } from '@alby/shared';
import type { HealthServiceCatalogStatusDTO, HealthServiceDTO, HealthServiceListDTO } from '@alby/shared';
import { requireAdmin, requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma, type Prisma } from '../db';
import { AppError, notFound } from '../errors';
import type { HealthService } from '../generated/prisma/client';
import { excelDate, readXlsxSheets } from '../xlsx';
import { writeAudit } from './audit';
import { normalizeForSearch } from './patients';

const SIST_ORIGIN = 'https://sist.sanita.puglia.it';
/** Pagina del portale che elenca i file aggiornati (i loro indirizzi cambiano a ogni aggiornamento). */
export const HEALTH_SERVICES_PAGE_URL = `${SIST_ORIGIN}/en/erogatori-pubblici-e-privati-accreditati`;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const PAGE_SIZE = 50;

export interface HealthServiceRow {
  id: string;
  regionalCode: string;
  code: string | null;
  nomenclatureName: string | null;
  alphaCode: string | null;
  oldCode: string | null;
  oldNomenclatureName: string | null;
  oldAlphaCode: string | null;
  name: string;
  standardName: string | null;
  shortName: string | null;
  active: boolean | null;
  validFrom: Date | null;
  validFromRef: string | null;
  validTo: Date | null;
  validToRef: string | null;
  notes: string | null;
  accessType: string | null;
  tariff: string | null;
  therapeuticCycle: boolean | null;
  branches: string[];
  branchText: string | null;
  tariffList: string | null;
  searchText: string;
}

export interface HealthServiceTariff {
  tariff: string | null;
  therapeuticCycle: boolean | null;
  branches: string[];
  tariffList: string | null;
}

// ───────────────────────────── lettura dei file ─────────────────────────────

/** Intestazione senza le spiegazioni che la seguono (tra parentesi o dopo una riga vuota) e senza accenti. */
const headerKey = (cell: string) => normalizeForSearch(cell.split(/\(|\r?\n\s*\r?\n/)[0] ?? '');

/**
 * Cerca in tutti i fogli la riga di intestazione (nelle prime righe: sopra può esserci un titolo)
 * e restituisce le righe che la seguono, con la posizione di ogni colonna richiesta.
 */
function findTable<K extends string>(sheets: string[][][], columns: Record<K, string>, required: NoInfer<K>[]) {
  for (const rows of sheets) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const header = rows[i]!.map(headerKey);
      const index = Object.fromEntries(Object.entries<string>(columns).map(([k, title]) => [k, header.indexOf(title)])) as Record<K, number>;
      if (required.every((k) => index[k] >= 0)) return { rows: rows.slice(i + 1), index };
    }
  }
  return null;
}

/** Testo di una cella: spazi ripetuti e a capo ridotti a uno spazio; vuota → null. */
const clean = (cell: string | undefined) => cell?.replace(/\s+/g, ' ').trim() || null;

/** Codice scritto senza punti ("02.39.1" → "02391"): nel testo di ricerca c'è anche così. */
const compactCode = (code: string) => code.replace(/[^\p{L}\p{N}]/gu, '');

const TARIFF_COLUMNS = {
  code: 'codice',
  tariff: 'tariffa',
  cycle: 'ciclo terapeutico',
  branch: 'descrizione branca',
  list: 'tariffario',
} as const;

/** Tariffa, ciclo e branche per codice del nomenclatore (una prestazione può stare in più branche: più righe). */
export function healthServiceTariffsFromXlsx(bytes: Uint8Array): Map<string, HealthServiceTariff> {
  const table = findTable(readXlsxSheets(bytes), TARIFF_COLUMNS, ['code', 'tariff']);
  if (!table) throw new AppError(422, 'Il file non è il Nomenclatore tariffario della Regione Puglia (mancano le colonne CODICE e TARIFFA)', 'BAD_CATALOG');
  const { rows, index } = table;
  const out = new Map<string, HealthServiceTariff>();
  for (const r of rows) {
    const get = (k: keyof typeof TARIFF_COLUMNS) => (index[k] >= 0 ? clean(r[index[k]]) : null);
    const code = get('code');
    if (!code) continue;
    const amount = Number(get('tariff')?.replace(',', '.'));
    const cycle = get('cycle')?.toUpperCase();
    const entry = out.get(code) ?? { tariff: null, therapeuticCycle: null, branches: [], tariffList: null };
    // Excel può scrivere 24.65 come 24.650000000000002: due decimali.
    entry.tariff ??= Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
    entry.therapeuticCycle ??= cycle === 'SI' ? true : cycle === 'NO' ? false : null;
    entry.tariffList ??= get('list');
    const branch = get('branch');
    if (branch && !entry.branches.includes(branch)) entry.branches.push(branch);
    out.set(code, entry);
  }
  return out;
}

const CATALOG_COLUMNS = {
  oldCode: 'codice nomenclatore',
  oldNomenclatureName: 'denominazione nomenclatore',
  code: 'codice nomenclatore dpcm 2017',
  nomenclatureName: 'denominazione nomenclatore dpcm 2017',
  name: 'denominazione estesa catalogo',
  standardName: 'denominazione standard catalogo',
  shortName: 'denominazione breve catalogo',
  oldAlphaCode: 'codice regionale alfanumerico',
  alphaCode: 'codice regionale alfanumerico dpcm 2017',
  regionalCode: 'codice regionale numerico',
  active: 'attiva',
  validFrom: 'data inizio validita',
  validFromRef: 'riferimenti inizio validita',
  validTo: 'data fine validita',
  validToRef: 'riferimenti fine validita',
  notes: 'note',
  accessType: 'compatibilita con tipo di accesso',
} as const;

/**
 * Converte il Catalogo Unico Regionale nelle righe da salvare, aggiungendo tariffa e branche dal Nomenclatore.
 * Le righe senza codice regionale numerico o senza alcuna denominazione vengono saltate.
 */
export function healthServiceRowsFromXlsx(bytes: Uint8Array, tariffs: Map<string, HealthServiceTariff> = new Map()): HealthServiceRow[] {
  const table = findTable(readXlsxSheets(bytes), CATALOG_COLUMNS, ['regionalCode', 'name', 'code']);
  if (!table) {
    throw new AppError(422, 'Il file non è il Catalogo Unico Regionale delle prestazioni della Regione Puglia (mancano le colonne dei codici)', 'BAD_CATALOG');
  }
  const { rows, index } = table;
  const out = new Map<string, HealthServiceRow>();
  for (const r of rows) {
    const get = (k: keyof typeof CATALOG_COLUMNS) => (index[k] >= 0 ? clean(r[index[k]]) : null);
    const regionalCode = get('regionalCode');
    const code = get('code');
    const nomenclatureName = get('nomenclatureName');
    const oldNomenclatureName = get('oldNomenclatureName');
    const standardName = get('standardName');
    const shortName = get('shortName');
    const name = get('name') ?? standardName ?? shortName ?? nomenclatureName ?? oldNomenclatureName;
    if (!regionalCode || !/^[\w.-]{1,20}$/.test(regionalCode) || !name) continue;
    const validTo = index.validTo >= 0 ? excelDate(r[index.validTo]) : null;
    // La voce cessata del vecchio nomenclatore e quella nuova che la sostituisce hanno lo stesso codice numerico.
    let id = validTo ? `${regionalCode}-c` : regionalCode;
    for (let n = 2; out.has(id); n++) id = `${regionalCode}-${n}`;
    const active = get('active')?.toUpperCase();
    const accessType = get('accessType')?.toUpperCase();
    const alphaCode = get('alphaCode');
    const oldCode = get('oldCode');
    const oldAlphaCode = get('oldAlphaCode');
    const priced = code ? tariffs.get(code) : undefined;
    const branches = [...(priced?.branches ?? [])].sort();
    const codes = [...new Set([code, alphaCode, oldCode, oldAlphaCode])].filter((c) => c !== null);
    out.set(id, {
      id,
      regionalCode,
      code,
      nomenclatureName,
      alphaCode,
      oldCode,
      oldNomenclatureName,
      oldAlphaCode,
      name,
      standardName,
      shortName,
      active: active === 'S' ? true : active === 'N' ? false : null,
      validFrom: index.validFrom >= 0 ? excelDate(r[index.validFrom]) : null,
      validFromRef: get('validFromRef'),
      validTo,
      validToRef: get('validToRef'),
      notes: get('notes'),
      accessType: accessType === 'P' || accessType === 'C' ? accessType : null,
      tariff: priced?.tariff ?? null,
      therapeuticCycle: priced?.therapeuticCycle ?? null,
      branches,
      branchText: branches.join(', ') || null,
      tariffList: priced?.tariffList ?? null,
      searchText: normalizeForSearch([name, nomenclatureName ?? oldNomenclatureName, ...codes, ...codes.map(compactCode), regionalCode].filter(Boolean).join(' ')),
    });
  }
  return [...out.values()];
}

// ───────────────────────────── importazione ─────────────────────────────

export interface HealthServiceSources {
  catalogSource: string;
  tariffSource: string | null;
}

/** Sostituisce l'intero catalogo (in una transazione: se qualcosa va storto resta quello di prima). */
export async function replaceHealthServices(rows: HealthServiceRow[], sources: HealthServiceSources): Promise<number> {
  if (rows.length === 0) throw new AppError(422, 'Il file non contiene prestazioni', 'EMPTY_CATALOG');
  const importedAt = new Date();
  await getPrisma().$transaction(
    async (tx) => {
      await tx.healthService.deleteMany();
      for (let i = 0; i < rows.length; i += 2000) await tx.healthService.createMany({ data: rows.slice(i, i + 2000) });
      await tx.healthServiceImport.upsert({ where: { id: 1 }, create: { id: 1, ...sources, importedAt }, update: { ...sources, importedAt } });
    },
    { timeout: 5 * 60_000, maxWait: 30_000 },
  );
  return rows.length;
}

export interface HealthServiceFileLink {
  url: string;
  /** Nome del file come pubblicato, es. "Catalogo Unico Regionale … aggiornato 26 giugno 2026).xlsx". */
  name: string;
}

/** Indirizzi dei due file nella pagina del portale. Solo documenti dello stesso sito: mai indirizzi arbitrari. */
export function healthServiceFileLinks(html: string): { catalog: HealthServiceFileLink | null; tariffs: HealthServiceFileLink | null } {
  let catalog: HealthServiceFileLink | null = null;
  let tariffs: HealthServiceFileLink | null = null;
  for (const m of html.matchAll(/href="(\/documents\/[^"?#\s]+)"/g)) {
    const segments = m[1]!.split('/');
    let name: string;
    try {
      // L'indirizzo è /documents/<gruppo>/<cartella>/<nome del file>/<identificativo>.
      name = decodeURIComponent((segments[4] ?? '').replace(/\+/g, ' ')).trim();
    } catch {
      continue;
    }
    const key = normalizeForSearch(name);
    const link = { url: SIST_ORIGIN + m[1]!, name };
    if (!catalog && key.includes('catalogo unico regionale')) catalog = link;
    else if (!tariffs && key.includes('nomenclatore tariffario completo')) tariffs = link;
  }
  return { catalog, tariffs };
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(2 * 60_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cartelle-cliniche)' } });
  if (!res.ok || !res.url.startsWith(`${SIST_ORIGIN}/`)) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_FILE_BYTES) throw new Error('troppo grande');
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > MAX_FILE_BYTES) throw new Error('troppo grande');
  return data;
}

/** Scarica dal portale SIST il catalogo e, se pubblicato, il nomenclatore con le tariffe. */
export async function downloadHealthServices(): Promise<{ rows: HealthServiceRow[]; sources: HealthServiceSources }> {
  let catalog: Uint8Array;
  let tariffs: Uint8Array | null = null;
  let links: ReturnType<typeof healthServiceFileLinks>;
  try {
    links = healthServiceFileLinks(new TextDecoder().decode(await download(HEALTH_SERVICES_PAGE_URL)));
    if (!links.catalog) throw new AppError(502, 'Sul portale della Regione Puglia non trovo più il file del catalogo: la pagina è cambiata', 'SIST_DOWNLOAD');
    [catalog, tariffs] = await Promise.all([download(links.catalog.url), links.tariffs ? download(links.tariffs.url) : null]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[prestazioni] scaricamento non riuscito', err);
    throw new AppError(502, 'Non riesco a scaricare il catalogo dal portale della Regione Puglia: riprova più tardi', 'SIST_DOWNLOAD');
  }
  const rows = healthServiceRowsFromXlsx(catalog, tariffs ? healthServiceTariffsFromXlsx(tariffs) : undefined);
  return { rows, sources: { catalogSource: links.catalog.name, tariffSource: links.tariffs?.name ?? null } };
}

/** Aggiorna il catalogo delle prestazioni scaricandolo dal portale della Regione (solo amministratori). */
export async function importHealthServices(ctx: RequestContext): Promise<HealthServiceCatalogStatusDTO> {
  requireAdmin(ctx);
  const { rows, sources } = await downloadHealthServices();
  const count = await replaceHealthServices(rows, sources);
  await writeAudit(ctx, 'healthServices.catalog_imported', { entity: 'health_service_catalog', details: { services: count } });
  return getHealthServiceCatalogStatus(ctx);
}

export async function getHealthServiceCatalogStatus(ctx: RequestContext): Promise<HealthServiceCatalogStatusDTO> {
  requireAdmin(ctx);
  const prisma = getPrisma();
  const [services, inForce, priced, source] = await Promise.all([
    prisma.healthService.count(),
    prisma.healthService.count({ where: { validTo: null } }),
    prisma.healthService.count({ where: { validTo: null, tariff: { not: null } } }),
    prisma.healthServiceImport.findUnique({ where: { id: 1 } }),
  ]);
  return {
    services,
    inForce,
    priced,
    importedAt: services > 0 ? (source?.importedAt.toISOString() ?? null) : null,
    catalogSource: source?.catalogSource ?? null,
    tariffSource: source?.tariffSource ?? null,
  };
}

// ───────────────────────────── consultazione ─────────────────────────────

const isoDay = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

function toDTO(r: HealthService): HealthServiceDTO {
  return {
    id: r.id,
    regionalCode: r.regionalCode,
    code: r.code,
    nomenclatureName: r.nomenclatureName,
    alphaCode: r.alphaCode,
    oldCode: r.oldCode,
    oldNomenclatureName: r.oldNomenclatureName,
    oldAlphaCode: r.oldAlphaCode,
    name: r.name,
    standardName: r.standardName,
    shortName: r.shortName,
    active: r.active,
    validFrom: isoDay(r.validFrom),
    validFromRef: r.validFromRef,
    validTo: isoDay(r.validTo),
    validToRef: r.validToRef,
    notes: r.notes,
    accessType: r.accessType === 'P' || r.accessType === 'C' ? r.accessType : null,
    tariff: r.tariff === null ? null : Number(r.tariff),
    therapeuticCycle: r.therapeuticCycle,
    branches: r.branches,
    tariffList: r.tariffList,
  };
}

/**
 * Catalogo da consultare, una pagina alla volta, in ordine di codice (o di denominazione, branca, tariffa). Si cerca per parole della denominazione
 * oppure per codice (del nomenclatore, regionale alfanumerico o numerico); si può filtrare per branca.
 * Le voci cessate compaiono solo se richieste. Dati pubblici: basta essere autenticati.
 */
export async function listHealthServices(ctx: RequestContext, raw: unknown): Promise<HealthServiceListDTO> {
  requireUser(ctx);
  const { q, branch, ceased, sort, direction, page } = healthServiceListQuerySchema.parse(raw);
  const prisma = getPrisma();
  const and: Prisma.HealthServiceWhereInput[] = [];
  if (!ceased) and.push({ validTo: null });
  if (branch) and.push({ branches: { has: branch } });
  const words = normalizeForSearch(q ?? '').split(' ').filter(Boolean).slice(0, 6);
  if (words.length) {
    const codeLike = (q ?? '').toUpperCase();
    const byCode: Prisma.HealthServiceWhereInput[] = [
      { code: { startsWith: codeLike } },
      { alphaCode: { startsWith: codeLike } },
      { oldCode: { startsWith: codeLike } },
      { oldAlphaCode: { startsWith: codeLike } },
      { regionalCode: codeLike },
    ];
    // Un codice con i punti ("89.13") si cerca solo tra i codici: come parole, "89" e "13" sarebbero ovunque.
    const dotted = /^[A-Z0-9]+(?:\.[A-Z0-9]*)+$/.test(codeLike);
    // Una parola con cifre è un codice, anche scritto senza punti ("02391"): deve essere l'inizio di una parola
    // del testo di ricerca (che contiene i codici in entrambe le forme), non un pezzo qualsiasi.
    const byWords = words.map((w) => ({ searchText: { contains: /\d/.test(w) ? ` ${w}` : w } }));
    and.push({ OR: dotted ? byCode : [{ AND: byWords }, ...byCode] });
  }
  const where: Prisma.HealthServiceWhereInput = { AND: and };
  const [rows, total, branches, any] = await Promise.all([
    prisma.healthService.findMany({
      where,
      // Prima le voci in vigore, poi in ordine di codice.
      orderBy: [
        { validTo: { sort: 'desc', nulls: 'first' } },
        // Le voci senza branca o senza tariffa restano in fondo in entrambi i versi.
        ...(sort === 'name' ? [{ name: direction }] : []),
        ...(sort === 'branch' ? [{ branchText: { sort: direction, nulls: 'last' as const } }] : []),
        ...(sort === 'tariff' ? [{ tariff: { sort: direction, nulls: 'last' as const } }] : []),
        // A parità (e come ordinamento predefinito) in ordine di codice.
        { code: { sort: sort === 'code' ? direction : 'asc', nulls: 'last' } },
        { alphaCode: sort === 'code' ? direction : 'asc' },
        { id: 'asc' },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.healthService.count({ where }),
    prisma.$queryRaw<{ branch: string }[]>`SELECT DISTINCT UNNEST(branches) AS branch FROM health_services ORDER BY 1`,
    prisma.healthService.findFirst({ select: { id: true } }),
  ]);
  return {
    catalogReady: any !== null,
    items: rows.map(toDTO),
    total,
    page,
    pageSize: PAGE_SIZE,
    branches: branches.map((b) => b.branch),
  };
}

/** Tutti i dati di una voce del catalogo. Dati pubblici: basta essere autenticati. */
export async function getHealthService(ctx: RequestContext, rawId: unknown): Promise<HealthServiceDTO> {
  requireUser(ctx);
  const parsed = healthServiceIdSchema.safeParse(rawId);
  const row = parsed.success ? await getPrisma().healthService.findUnique({ where: { id: parsed.data } }) : null;
  if (!row) throw notFound('Prestazione');
  return toDTO(row);
}
