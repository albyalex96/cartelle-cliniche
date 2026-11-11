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
  'report.file_uploaded': 'PDF di un referto caricato',
  'report.file_viewed': 'PDF di un referto consultato',
  'report.file_discarded': 'PDF di un referto scartato',
  'report.created': 'Referto inserito',
  'report.viewed': 'Referto consultato',
  'report.updated': 'Referto modificato',
  'report.deleted': 'Referto eliminato',
  'imaging.uploaded': 'Immagini caricate',
  'imaging.study_viewed': 'Immagini consultate',
  'imaging.study_deleted': 'Studio di immagini eliminato',
  'medication.created': 'Farmaco aggiunto alla terapia',
  'medication.updated': 'Terapia modificata',
  'medication.stopped': 'Terapia conclusa',
  'medication.deleted': 'Farmaco eliminato dalla terapia',
  'lab.trend_viewed': 'Andamento di un esame consultato',
  'drugs.catalog_imported': 'Elenco farmaci AIFA aggiornato',
};

export const REPORT_KINDS = ['LABORATORIO', 'DESCRITTIVO'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  LABORATORIO: 'Esami di laboratorio',
  DESCRITTIVO: 'Referto descrittivo',
};

/** Spiegazione breve, per la scelta del tipo nel form. */
export const REPORT_KIND_HINTS: Record<ReportKind, string> = {
  LABORATORIO: 'Analisi con valori: sangue, urine…',
  DESCRITTIVO: 'Testo libero: risonanza, TAC, ecografia, visita…',
};

/** Dimensione massima di un PDF caricato. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Dimensione massima di una singola immagine DICOM (i filmati delle ecografie possono essere grandi). */
export const MAX_DICOM_BYTES = 60 * 1024 * 1024;
/** Il browser invia le immagini a gruppi di circa questa dimensione. */
export const DICOM_BATCH_BYTES = 16 * 1024 * 1024;
