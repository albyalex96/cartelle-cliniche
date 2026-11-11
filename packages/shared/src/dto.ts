import type { BloodType, Role, Sex } from './constants.js';

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

export interface LoginResponseDTO {
  user: MeDTO;
  /** Presente solo per i client mobile. */
  token?: string;
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
