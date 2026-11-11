import type { BloodType, ReportKind, Role, Sex } from './constants';

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
  reportDate: string | null;
  reportNumber: string | null;
  doctorRole: string | null;
  body: string | null;
  notes: string | null;
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
    kind: ReportKind;
    title: string;
    examDate: string;
    reportDate: string;
    reportNumber: string;
    facility: string;
    doctor: string;
    doctorRole: string;
    body: string;
    notes: string;
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
}

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
  createdAt: string;
}

/** Esito del caricamento di un gruppo di immagini. */
export interface DicomUploadResultDTO {
  added: number;
  /** Già presenti (stessa immagine caricata in precedenza): non duplicate. */
  duplicates: number;
  rejected: { name: string; reason: string }[];
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
