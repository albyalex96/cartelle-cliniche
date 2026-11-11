export const ROLES = ['ADMIN', 'MEDICO', 'PAZIENTE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Amministratore',
  MEDICO: 'Medico',
  PAZIENTE: 'Paziente',
};

export const SEXES = ['M', 'F', 'X'] as const;
export type Sex = (typeof SEXES)[number];

export const SEX_LABELS: Record<Sex, string> = {
  M: 'Maschio',
  F: 'Femmina',
  X: 'Non specificato',
};

export const BLOOD_TYPES = ['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

export const PASSWORD_MIN_LENGTH = 10;

/** Etichette leggibili per le azioni registrate nel registro accessi. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'setup.admin_created': 'Creazione amministratore iniziale',
  'auth.login': 'Accesso',
  'auth.login_failed': 'Accesso fallito',
  'auth.logout': 'Uscita',
  'auth.password_changed': 'Cambio password',
  'user.created': 'Utente creato',
  'user.updated': 'Utente modificato',
  'user.password_reset': 'Password reimpostata',
  'patient.created': 'Paziente creato',
  'patient.viewed': 'Scheda paziente consultata',
  'patient.updated': 'Paziente modificato',
  'patient.deleted': 'Paziente eliminato',
};
