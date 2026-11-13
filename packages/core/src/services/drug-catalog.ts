/**
 * Elenco dei farmaci autorizzati in Italia, dai dati aperti dell'AIFA (licenza CC BY 4.0).
 * File: "Lista aggiornata dei Farmaci" (confezioni_fornitura.csv), una riga per confezione,
 * separatore ";" e campi tra virgolette. Viene sostituito per intero a ogni importazione.
 */
import type { DrugCatalogStatusDTO } from '@alby/shared';
import { requireAdmin, requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { AppError, notFound } from '../errors';
import { leafletPath, readStored, storedMtime, writeStored } from '../storage';
import { writeAudit } from './audit';
import { normalizeForSearch } from './patients';

export const AIFA_CATALOG_URL = 'https://drive.aifa.gov.it/farmaci/confezioni_fornitura.csv';
const MAX_CATALOG_BYTES = 300 * 1024 * 1024;

/** Testo del file: UTF-8, oppure Windows-1252 (la codifica dei file "da Excel") se non è UTF-8 valido. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Righe di un CSV (RFC 4180: campi tra virgolette, "" per le virgolette, a capo dentro i campi). */
export function* parseCsv(text: string, delimiter = ';'): Generator<string[]> {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') yield row;
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') yield row;
}

export interface DrugPackageRow {
  aic: string;
  name: string;
  package: string | null;
  activeIngredient: string | null;
  holder: string | null;
  form: string | null;
  atc: string | null;
  status: string | null;
  supply: string | null;
  leafletUrl: string | null;
  searchText: string;
}

const COLUMNS = {
  aic: 'CODICE_AIC',
  name: 'DENOMINAZIONE',
  package: 'DESCRIZIONE',
  holder: 'RAGIONE_SOCIALE',
  status: 'STATO_AMMINISTRATIVO',
  form: 'FORMA',
  atc: 'CODICE_ATC',
  activeIngredient: 'PA_ASSOCIATI',
  supply: 'FORNITURA',
  leafletUrl: 'LINK_FI',
} as const;

/** Converte il CSV dell'AIFA nelle righe da salvare. Righe senza codice AIC o nome vengono saltate. */
export function drugRowsFromCsv(text: string): DrugPackageRow[] {
  const rows = parseCsv(text);
  const first: string[] = rows.next().value ?? [];
  const header = first.map((h) => h.trim().toUpperCase());
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([k, col]) => [k, header.indexOf(col)])) as Record<keyof typeof COLUMNS, number>;
  if (index.aic < 0 || index.name < 0) {
    throw new AppError(422, 'Il file non è l’elenco dei farmaci AIFA (mancano le colonne CODICE_AIC e DENOMINAZIONE)', 'BAD_CATALOG');
  }
  const out = new Map<string, DrugPackageRow>();
  for (const r of rows) {
    const get = (k: keyof typeof COLUMNS) => {
      const v = index[k] >= 0 ? r[index[k]]?.trim() : undefined;
      return v ? v : null;
    };
    const aic = get('aic')?.padStart(9, '0');
    const name = get('name');
    if (!aic || !/^\d{9}$/.test(aic) || !name) continue;
    const pkg = get('package');
    const pa = get('activeIngredient');
    const link = get('leafletUrl');
    out.set(aic, {
      aic,
      name,
      package: pkg,
      activeIngredient: pa,
      holder: get('holder'),
      form: get('form'),
      atc: get('atc'),
      status: get('status'),
      supply: get('supply'),
      leafletUrl: link && /^https:\/\//.test(link) ? link : null,
      searchText: normalizeForSearch(`${name} ${pa ?? ''} ${pkg ?? ''}`),
    });
  }
  return [...out.values()];
}

// ───────────────────────────── dosaggio dalla descrizione della confezione ─────────────────────────────

const NUM = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(?:MICROGRAMMI|MCG|MG|KG|G|ML|L|MEQ|MMOL|U\.I\.|UI|U|%)(?![A-Z])`;
/** Dopo la barra: "/5 ML", "/ML", "/ORA", "/DOSE", ma anche "/12,5 MG" (associazioni). */
const PER = String.raw`(?:${NUM}\s*)?(?:${UNIT}|(?:ORA|ORE|H|DOSE|EROGAZIONE|SPRUZZO|GOCCIA|DIE)(?![A-Z]))`;
const COMPONENT = String.raw`(?:${NUM}\s*[/+]\s*)*${NUM}\s*${UNIT}(?:\s*/\s*${PER})*`;
const STRENGTH = new RegExp(String.raw`(?<![A-Z0-9.,])${COMPONENT}(?:\s*\+\s*${COMPONENT})*`, 'g');

/**
 * Dosaggio scritto nella descrizione di una confezione AIFA, che non lo dà come campo a sé:
 * `"500 MG COMPRESSE" 20 COMPRESSE` → "500 mg", `"120 MG/5 ML SCIROPPO" FLACONE 120 ML` → "120 mg/5 ml".
 * Le descrizioni non hanno un formato unico: se non si riconosce nulla restituisce null.
 */
export function drugStrength(description: string | null | undefined): string | null {
  if (!description) return null;
  const text = description.toUpperCase();
  // Quando c'è una parte tra virgolette il dosaggio è lì: fuori c'è il contenuto ("FLACONE 120 ML").
  const quoted = /"([^"]+)"/.exec(text)?.[1];
  for (const m of (quoted ?? text).matchAll(STRENGTH)) {
    const value = m[0]
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/ ?\/ ?/g, '/')
      .replace(/ ?\+ ?/g, ' + ')
      .replace(/(\d) ?([a-z])/g, '$1 $2')
      .replace(/(\d) %/g, '$1%')
      .replace(/\bu\.i\.|\bui\b/g, 'UI');
    // Un volume da solo ("200 ml") è la quantità nel flacone, non il dosaggio.
    if (!/^[\d.,]+ (?:ml|l)$/.test(value)) return value;
  }
  return null;
}

const WEIGHT: Record<string, number> = { mcg: 0.001, microgrammi: 0.001, mg: 1, g: 1000, kg: 1_000_000 };

/** Per mettere i dosaggi in ordine crescente ("500 mg" prima di "1 g"). */
export function strengthOrder(strength: string): number {
  const m = /^((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[.,]\d+)?) ?([a-z]+)?/i.exec(strength);
  if (!m) return Number.POSITIVE_INFINITY;
  const thousands = /^\d{1,3}(?:\.\d{3})+/.test(m[1]!);
  const n = Number((thousands ? m[1]!.replace(/\./g, '') : m[1]!).replace(',', '.'));
  return n * (WEIGHT[m[2]?.toLowerCase() ?? ''] ?? 1);
}

/** Sostituisce l'intero elenco (in una transazione: se qualcosa va storto resta quello di prima). */
export async function replaceDrugCatalog(rows: DrugPackageRow[]): Promise<number> {
  if (rows.length === 0) throw new AppError(422, 'Il file non contiene farmaci', 'EMPTY_CATALOG');
  const prisma = getPrisma();
  const importedAt = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.drugPackage.deleteMany();
      for (let i = 0; i < rows.length; i += 5000) {
        await tx.drugPackage.createMany({ data: rows.slice(i, i + 5000).map((r) => ({ ...r, importedAt })) });
      }
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );
  return rows.length;
}

/** Scarica il file aggiornato dal sito AIFA. */
export async function downloadDrugCatalog(url = AIFA_CATALOG_URL): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new AppError(502, `Il sito AIFA ha risposto con un errore (${res.status})`, 'AIFA_DOWNLOAD');
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_CATALOG_BYTES) throw new AppError(413, 'Il file AIFA è troppo grande', 'AIFA_DOWNLOAD');
  return new Uint8Array(await res.arrayBuffer());
}

/** Aggiorna l'elenco dei farmaci scaricandolo dall'AIFA (solo amministratori). */
export async function importDrugCatalog(ctx: RequestContext): Promise<DrugCatalogStatusDTO> {
  requireAdmin(ctx);
  let bytes: Uint8Array;
  try {
    bytes = await downloadDrugCatalog();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'Non riesco a scaricare l’elenco dal sito AIFA: riprova più tardi', 'AIFA_DOWNLOAD');
  }
  const count = await replaceDrugCatalog(drugRowsFromCsv(decodeCsv(bytes)));
  await writeAudit(ctx, 'drugs.catalog_imported', { entity: 'drug_catalog', details: { packages: count } });
  return getDrugCatalogStatus(ctx);
}

export async function getDrugCatalogStatus(ctx: RequestContext): Promise<DrugCatalogStatusDTO> {
  requireAdmin(ctx);
  const prisma = getPrisma();
  const [packages, latest, products] = await Promise.all([
    prisma.drugPackage.count(),
    prisma.drugPackage.findFirst({ select: { importedAt: true }, orderBy: { importedAt: 'desc' } }),
    prisma.$queryRaw<[{ n: bigint }]>`SELECT COUNT(DISTINCT LEFT(aic, 6)) AS n FROM drug_packages`,
  ]);
  return { packages, products: Number(products[0].n), importedAt: latest?.importedAt.toISOString() ?? null };
}

// ───────────────────────────── foglietto illustrativo ─────────────────────────────

export interface DrugInfo {
  /** Codice AIC del farmaco (6 cifre). */
  aic: string;
  name: string;
  activeIngredient: string | null;
  holder: string | null;
  hasLeaflet: boolean;
}

const LEAFLET_ORIGIN = 'https://api.aifa.gov.it/';
const LEAFLET_MAX_AGE_MS = 30 * 86_400_000;
const MAX_LEAFLET_BYTES = 40 * 1024 * 1024;

function parseAic6(raw: unknown) {
  if (typeof raw !== 'string' || !/^\d{6}$/.test(raw)) throw notFound('Farmaco');
  return raw;
}

async function findDrug(aic: string) {
  const rows = await getPrisma().drugPackage.findMany({
    where: { aic: { startsWith: aic } },
    select: { name: true, activeIngredient: true, holder: true, leafletUrl: true, status: true },
    orderBy: { aic: 'asc' },
  });
  if (!rows.length) throw notFound('Farmaco');
  const main = rows.find((r) => r.status === 'Autorizzata') ?? rows[0]!;
  // Solo indirizzi del sito AIFA: il server non scarica mai da indirizzi arbitrari.
  const leafletUrl = rows.map((r) => r.leafletUrl).find((u) => !!u && u.startsWith(LEAFLET_ORIGIN)) ?? null;
  return { main, leafletUrl };
}

/** Dati essenziali di un farmaco dell'elenco AIFA (dati pubblici: basta essere autenticati). */
export async function getDrugInfo(ctx: RequestContext, rawAic: unknown): Promise<DrugInfo> {
  requireUser(ctx);
  const aic = parseAic6(rawAic);
  const { main, leafletUrl } = await findDrug(aic);
  return { aic, name: main.name, activeIngredient: main.activeIngredient, holder: main.holder, hasLeaflet: !!leafletUrl };
}

/**
 * Foglietto illustrativo in PDF. Il sito AIFA lo fa solo scaricare: lo scarica il server
 * e lo restituisce all'app per mostrarlo nella pagina. Ne tiene una copia per 30 giorni
 * (resta disponibile anche se il sito AIFA è irraggiungibile).
 */
export async function getDrugLeaflet(ctx: RequestContext, rawAic: unknown): Promise<{ fileName: string; data: Uint8Array }> {
  requireUser(ctx);
  const aic = parseAic6(rawAic);
  const { main, leafletUrl } = await findDrug(aic);
  if (!leafletUrl) throw notFound('Foglietto illustrativo');
  const fileName = `Foglietto illustrativo - ${main.name}.pdf`;
  const rel = leafletPath(aic);
  const cachedAt = await storedMtime(rel);
  if (cachedAt && Date.now() - cachedAt.getTime() < LEAFLET_MAX_AGE_MS) return { fileName, data: await readStored(rel) };

  try {
    const res = await fetch(leafletUrl, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > MAX_LEAFLET_BYTES) throw new Error('troppo grande');
    if (Buffer.from(data.subarray(0, 1024)).indexOf('%PDF-') === -1) throw new Error('non è un PDF');
    await writeStored(rel, data);
    return { fileName, data };
  } catch (err) {
    // Sito AIFA non raggiungibile: va bene anche una copia più vecchia, se c'è.
    if (cachedAt) return { fileName, data: await readStored(rel) };
    console.error('[farmaci] foglietto non disponibile', aic, err);
    throw new AppError(502, 'Il foglietto illustrativo non è disponibile in questo momento: riprova più tardi', 'AIFA_DOWNLOAD');
  }
}
