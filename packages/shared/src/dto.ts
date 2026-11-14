import type { BloodType, ReportKind, Role, Sex } from './constants';
import type { ReportCategory, ReportField } from './report-templates';
import type { ServerSettings } from './schemas';

/** Risposte dell'API: forma dei dati scambiati con webapp e (in futuro) app mobile. */

export interface MeDTO {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface SetupStatusDTO {
  needsSetup: boolean;
}

/** Risposta al login dell'app mobile (`POST /api/v1/auth/login`). */
export interface MobileLoginResponseDTO {
  user: MeDTO;
  token: string;
  expiresAt: string;
}

export interface UserAccessDTO {
  patientId: string;
  patientName: string;
  canEdit: boolean;
}

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  access: UserAccessDTO[];
}

export interface PatientDTO {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  sex: Sex | null;
  fiscalCode: string | null;
  bloodType: BloodType | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** L'utente corrente può modificare questo paziente. */
  canEdit: boolean;
}

export interface StoredFileDTO {
  id: string;
  fileName: string;
  size: number;
}

/** Riga dell'elenco referti di un paziente. */
export interface ReportSummaryDTO {
  id: string;
  kind: ReportKind;
  /** Nome del tipo di referto con cui è stato salvato. */
  templateName: string;
  title: string;
  examDate: string;
  facility: string | null;
  doctor: string | null;
  resultCount: number;
  outOfRangeCount: number;
  hasFile: boolean;
  /** PDF originale (da vedere o scaricare), se il referto è stato importato da un file. */
  fileId: string | null;
}

export interface LabResultDTO {
  id: string;
  section: string | null;
  name: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  referenceRange: string | null;
  outOfRange: boolean | null;
}

export interface ReportDTO extends ReportSummaryDTO {
  patientId: string;
  /** Analisi: giorno del prelievo (AAAA-MM-GG). */
  samplingDate: string | null;
  reportDate: string | null;
  reportNumber: string | null;
  doctorRole: string | null;
  body: string | null;
  notes: string | null;
  /** Tipo di referto (null se è stato eliminato). */
  templateId: string | null;
  /** Campi con cui il referto è stato compilato (copia: non cambia se il tipo viene modificato). */
  fields: ReportField[];
  /** Categorie dei campi (copia, come i campi): raggruppano i campi nella pagina del referto. */
  categories: ReportCategory[];
  /** Valori dei campi personalizzati. */
  custom: Record<string, string>;
  parserId: string | null;
  parserVersion: number | null;
  file: StoredFileDTO | null;
  results: LabResultDTO[];
  createdAt: string;
  updatedAt: string;
  /** L'utente corrente può modificare o eliminare il referto. */
  canEdit: boolean;
}

/**
 * Proposta di referto letta da un PDF, da rivedere prima del salvataggio.
 * `values` è già nella forma del form (stringhe vuote per i campi mancanti).
 */
export interface ReportDraftDTO {
  file: StoredFileDTO | null;
  values: {
    /** Tipo di referto scelto ('' = quello con cui il referto era stato salvato, se è stato eliminato). */
    templateId: string;
    title: string;
    examDate: string;
    samplingDate: string;
    reportDate: string;
    reportNumber: string;
    facility: string;
    doctor: string;
    doctorRole: string;
    body: string;
    notes: string;
    custom: Record<string, string>;
    results: {
      section: string;
      name: string;
      value: string;
      unit: string;
      referenceRange: string;
      outOfRange: boolean | null;
    }[];
  };
  /** Cose da far notare all'utente (date mancanti, versione sostituita, PDF senza testo…). */
  warnings: string[];
  /** Confronto tra i dati anagrafici scritti nel PDF e il paziente scelto. */
  identity: { status: 'ok' | 'mismatch' | 'unknown'; message: string } | null;
  parser: { id: string; version: number } | null;
  /**
   * PDF scansionato (senza testo) con l'OCR attivo: niente lettura automatica, l'utente sceglie sul
   * documento le zone da leggere. `null` per i PDF con testo o con l'OCR spento.
   */
  scan: { pages: { width: number; height: number }[] } | null;
  /** Dimensioni delle pagine del PDF (in punti), per selezionarne una zona (ritaglio di un'immagine). */
  pages: { width: number; height: number }[] | null;
}

/** Zona di una pagina da leggere con l'OCR, in frazioni della pagina (0–1) dall'angolo in alto a sinistra. */
export interface ScanRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cosa leggere da una scansione:
 *  - `table`: righe di valori (esame, valore, unità, intervallo);
 *  - `date` / `line` / `paragraph`: il testo per un campo del form (data, riga singola, testo lungo);
 *  - `page`: tutta la pagina, come per i PDF con testo (lettura automatica facoltativa).
 */
export type ScanReadMode = 'table' | 'date' | 'line' | 'paragraph' | 'page';

export type ScanReadDTO = {
  /** Affidabilità media delle parole riconosciute (0–100). */
  confidence: number;
  /** Lettore da salvare con il referto: indica che i dati vengono da una scansione. */
  parser: { id: string; version: number };
} & (
  | {
      mode: 'table';
      rows: ReportDraftDTO['values']['results'];
      /** Indici delle righe che contengono parole lette con poca sicurezza. */
      uncertain: number[];
    }
  | { mode: 'date' | 'line' | 'paragraph'; text: string; uncertain: boolean }
  | { mode: 'page'; values: ReportDraftDTO['values']; uncertain: number[]; warnings: string[] }
);

/** Studio di immagini (TAC, risonanza…) salvato per un paziente. */
export interface ImagingStudyDTO {
  id: string;
  /** AAAA-MM-GG */
  studyDate: string | null;
  description: string | null;
  modalities: string[];
  institution: string | null;
  seriesCount: number;
  imageCount: number;
  /** Spazio occupato dalle immagini, in byte. */
  bytes: number;
  /** Immagine da mostrare come anteprima dello studio (la prima della prima serie). */
  coverInstanceId: string | null;
  /** Referto testuale a cui lo studio è collegato. */
  reportId: string | null;
  createdAt: string;
}

/** Una serie di uno studio, con le sue immagini in ordine. */
export interface ImagingSeriesDTO {
  id: string;
  number: number | null;
  modality: string | null;
  description: string | null;
  instances: { id: string; instanceNumber: number | null }[];
}

/** Studio di immagini con serie e immagini, per la pagina di consultazione. */
export interface ImagingStudyDetailDTO {
  id: string;
  patientId: string;
  /** AAAA-MM-GG */
  studyDate: string | null;
  description: string | null;
  modalities: string[];
  institution: string | null;
  series: ImagingSeriesDTO[];
  /** Referto testuale collegato a queste immagini, con il suo testo. */
  report: { id: string; kind: ReportKind; title: string; examDate: string; body: string | null } | null;
  /** L'utente corrente può modificare lo studio (es. collegarlo a un referto). */
  canEdit: boolean;
}

/** Dimensioni di un'immagine e scala per misurare le distanze (se il file DICOM la dichiara). */
export interface ImagingGeometryDTO {
  rows: number;
  columns: number;
  /** Millimetri per pixel, in verticale e in orizzontale. */
  spacing: { row: number; column: number } | null;
  /** `patient`: dimensioni reali; `detector`: misurate sul rivelatore (radiografie), quindi un po' ingrandite. */
  spacingSource: 'patient' | 'detector' | null;
}

/** Esito del caricamento di un gruppo di immagini. */
export interface DicomUploadResultDTO {
  added: number;
  /** Già presenti (stessa immagine caricata in precedenza): non duplicate. */
  duplicates: number;
  rejected: { name: string; reason: string }[];
}

/** Un farmaco della terapia di un paziente. */
export interface MedicationDTO {
  id: string;
  patientId: string;
  name: string;
  activeIngredient: string | null;
  aic: string | null;
  /** Dosaggio della confezione ("500 mg"). */
  strength: string | null;
  /** Formulazione ("Compressa", "Sciroppo"). */
  form: string | null;
  /** Quanto ne prende ("1 compressa"). */
  dosage: string | null;
  frequency: string | null;
  asNeeded: boolean;
  reason: string | null;
  prescriber: string | null;
  /** AAAA-MM-GG */
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  /** Terapia in corso: nessuna data di fine, o fine dopo oggi (chi la conclude oggi la vede tra le concluse). */
  active: boolean;
  /** Foglietto illustrativo sul sito AIFA (se il farmaco è stato scelto dall'elenco). */
  leafletUrl: string | null;
  updatedAt: string;
}

/** Un farmaco trovato nell'elenco AIFA (tutte le confezioni dello stesso prodotto insieme). */
export interface DrugSuggestionDTO {
  /** Codice AIC del farmaco (6 cifre). */
  aic: string;
  name: string;
  activeIngredient: string | null;
  holder: string | null;
  /** Forme farmaceutiche disponibili ("Compressa rivestita", "Gocce orali"…). */
  forms: string[];
  /** Alcune confezioni, per riconoscere il dosaggio. */
  packages: string[];
  /** Il farmaco non è più autorizzato (revocato o sospeso). */
  withdrawn: boolean;
  /** Il foglietto illustrativo è consultabile dall'app. */
  hasLeaflet: boolean;
}

export interface DrugSearchResultDTO {
  /** L'elenco AIFA è stato importato (altrimenti la ricerca non può trovare nulla). */
  catalogReady: boolean;
  /** Nulla corrisponde a quanto scritto: `items` sono i farmaci dal nome più simile ("Forse cercavi…"). */
  approximate: boolean;
  items: DrugSuggestionDTO[];
}

/** Una pagina dell'elenco dei farmaci (consultazione: tutto l'elenco, oppure i risultati di una ricerca). */
export interface DrugCatalogPageDTO extends DrugSearchResultDTO {
  page: number;
  hasMore: boolean;
}

/** Una combinazione formulazione + dosaggio in cui un farmaco esiste (da una o più confezioni). */
export interface DrugVariantDTO {
  /** Forma farmaceutica come la indica l'AIFA ("Compressa rivestita con film", "Sciroppo"). */
  form: string | null;
  /** Dosaggio ("500 mg", "120 mg/5 ml"); se non si riconosce, la descrizione della confezione. */
  strength: string | null;
}

/** Formulazioni e dosaggi disponibili per un farmaco dell'elenco AIFA. */
export interface DrugOptionsDTO {
  /** Codice AIC del farmaco (6 cifre). */
  aic: string;
  variants: DrugVariantDTO[];
}

export interface DrugCatalogStatusDTO {
  packages: number;
  products: number;
  importedAt: string | null;
}

/** Una voce del Catalogo Unico Regionale delle prestazioni specialistiche ambulatoriali (Regione Puglia). */
export interface HealthServiceDTO {
  id: string;
  /** Codice Regionale Numerico. */
  regionalCode: string;
  /** Codice del nomenclatore in vigore (DPCM LEA 2017), es. "89.13"; assente per le voci cessate. */
  code: string | null;
  nomenclatureName: string | null;
  /** Codice Regionale Alfanumerico (DPCM 2017), es. "89.13.00.01". */
  alphaCode: string | null;
  /** Codici e denominazione del vecchio nomenclatore (DPCM LEA 1996), se la voce esisteva già. */
  oldCode: string | null;
  oldNomenclatureName: string | null;
  oldAlphaCode: string | null;
  /** Denominazione estesa del catalogo. */
  name: string;
  standardName: string | null;
  shortName: string | null;
  /** Colonna "Attiva" del catalogo; null se la voce è ancora da attivare. */
  active: boolean | null;
  /** Date 'YYYY-MM-DD'. Se c'è la fine validità, la voce è cessata. */
  validFrom: string | null;
  validFromRef: string | null;
  validTo: string | null;
  validToRef: string | null;
  notes: string | null;
  /** P = solo primo accesso, C = solo controllo. */
  accessType: 'P' | 'C' | null;
  /** Tariffa in euro dal Nomenclatore tariffario; null se il codice non vi compare. */
  tariff: number | null;
  therapeuticCycle: boolean | null;
  branches: string[];
  tariffList: string | null;
}

export interface HealthServiceListDTO {
  /** Il catalogo è stato importato. */
  catalogReady: boolean;
  items: HealthServiceDTO[];
  total: number;
  page: number;
  pageSize: number;
  /** Tutte le branche presenti, per il filtro. */
  branches: string[];
}

export interface HealthServiceCatalogStatusDTO {
  services: number;
  inForce: number;
  /** Voci in vigore con una tariffa. */
  priced: number;
  importedAt: string | null;
  /** Nomi dei file pubblicati dalla Regione da cui viene il catalogo in uso. */
  catalogSource: string | null;
  tariffSource: string | null;
}

/** Impostazioni del server: valori in uso e valori predefiniti (dal file .env). */
export interface ServerSettingsDTO {
  values: ServerSettings;
  defaults: ServerSettings;
}

/** Aggiornamento automatico di un elenco pubblico (farmaci o prestazioni), per la pagina delle impostazioni. */
export interface CatalogAutoUpdateDTO {
  enabled: boolean;
  /** Ogni quanti giorni e a che ora (del server) si aggiorna. */
  days: number;
  hour: number;
  /** Ultimo aggiornamento riuscito, automatico o fatto a mano. */
  importedAt: string | null;
  /** Ultimo tentativo automatico ed eventuale errore. */
  lastAttemptAt: string | null;
  lastError: string | null;
  /** Quando partirà il prossimo aggiornamento (solo se attivo). */
  nextRunAt: string | null;
  running: boolean;
}

/** Stato del server per la pagina delle impostazioni: solo numeri e dati tecnici. */
export interface ServerStatusDTO {
  environment: 'development' | 'production' | 'test';
  nodeVersion: string;
  platform: string;
  startedAt: string;
  databaseVersion: string;
  databaseBytes: number;
  users: number;
  activeSessions: number;
  auditEntries: number;
  oldestAuditAt: string | null;
  trustProxy: boolean;
  cookieSecure: boolean;
  storageDir: string;
}

/** Spazio occupato dall'archivio dei file (immagini DICOM, fogli illustrativi) e spazio sul disco. */
export interface StorageUsageDTO {
  files: number;
  bytes: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
}

/**
 * Blocco accessi attivo: gli utenti non amministratori sono sospesi (le loro sessioni restano valide
 * e riprendono allo sblocco). `null` quando il blocco non è attivo.
 */
export interface LockdownDTO {
  since: string;
  /** Chi l'ha attivato (nome attuale), se l'utente esiste ancora. */
  byName: string | null;
}

/** Cosa ha eliminato la pulizia periodica. */
export interface MaintenanceResultDTO {
  expiredSessions: number;
  auditEntries: number;
}

/** Un valore nel tempo di un esame di laboratorio. */
export interface LabTrendPointDTO {
  /** AAAA-MM-GG */
  date: string;
  /** Valore come scritto nel referto. */
  value: string;
  numericValue: number | null;
  outOfRange: boolean | null;
  referenceRange: string | null;
  /** Nome dell'esame com'era scritto in quel referto. */
  name: string;
  reportId: string;
  reportTitle: string;
}

/** L'andamento di un esame (stessa unità di misura: unità diverse sono andamenti distinti). */
export interface LabTrendDTO {
  key: string;
  label: string;
  category: string;
  /** Riconosciuto dal catalogo degli esami. */
  known: boolean;
  unit: string | null;
  /** In ordine di data, dal più vecchio. */
  points: LabTrendPointDTO[];
  /** Quanti valori sono numeri (solo questi vanno nel grafico). */
  numericCount: number;
}

export interface AuditEntryDTO {
  id: string;
  createdAt: string;
  action: string;
  userId: string | null;
  userName: string | null;
  entity: string | null;
  entityId: string | null;
  details: unknown;
  ip: string | null;
  /** Paziente a cui si riferisce la voce, se ce n'è uno. */
  patientId: string | null;
  /** `null` anche quando il paziente non esiste più. */
  patientName: string | null;
  /** Utente su cui si è agito (creato, modificato…), se esiste ancora. */
  targetUserName: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  /** Errori di validazione per campo (percorso → messaggio). */
  fields?: Record<string, string>;
}
