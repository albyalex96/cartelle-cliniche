import { z } from 'zod';
import { BLOOD_TYPES, MAINTENANCE_NOTE_MAX, PASSWORD_MIN_LENGTH, REPORT_KINDS, ROLES, SEXES } from './constants';

// Messaggi di errore di Zod in italiano (vale per API e webapp).
z.config(z.locales.it());

/** Testo facoltativo: stringa vuota o assente diventa `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Massimo ${max} caratteri`)
    .nullish()
    .transform((v) => (v ? v : null));

/** Valore facoltativo scelto da un elenco: stringa vuota diventa `null`. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null));

export const idSchema = z.uuid('Identificativo non valido');
export const idParamsSchema = z.object({ id: idSchema });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .pipe(z.email('Indirizzo email non valido'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri`)
  .max(200, 'Password troppo lunga');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Inserisci almeno 2 caratteri')
  .max(100, 'Massimo 100 caratteri');

// ---------------------------------------------------------------- auth

export const setupSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SetupInput = z.input<typeof setupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Inserisci l’email').max(200),
  password: z.string().min(1, 'Inserisci la password').max(200),
  /** Codice a 6 cifre o codice di recupero, per chi ha attivato la verifica in due passaggi. */
  code: z.string().trim().max(32).optional(),
});
export type LoginInput = z.input<typeof loginSchema>;

export const confirmPasswordSchema = z.object({
  password: z.string().min(1, 'Inserisci la password').max(200),
});

export const totpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Inserisci le 6 cifre del codice'),
});

/** La risposta del browser la controlla per intero la libreria WebAuthn sul server. */
const webauthnResponseSchema = z.looseObject({ id: z.string().min(1).max(1024) });
const webauthnChallengeSchema = z.string().min(1).max(512);

export const passkeyRegisterSchema = z.object({
  challenge: webauthnChallengeSchema,
  name: z.string().trim().min(1, 'Dai un nome alla passkey').max(60, 'Al massimo 60 caratteri'),
  response: webauthnResponseSchema,
});

export const passkeyLoginSchema = z.object({
  challenge: webauthnChallengeSchema,
  response: webauthnResponseSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Inserisci la password attuale').max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/** Attivazione o disattivazione della modalità manutenzione, con un avviso facoltativo per gli utenti. */
export const maintenanceModeSchema = z.object({
  active: z.boolean(),
  message: z
    .string()
    .trim()
    .max(MAINTENANCE_NOTE_MAX, `Al massimo ${MAINTENANCE_NOTE_MAX} caratteri`)
    .nullish()
    .transform((v) => v || null),
});
export type MaintenanceModeInput = z.input<typeof maintenanceModeSchema>;

// ---------------------------------------------------------------- utenti

export const accessEntrySchema = z.object({
  patientId: idSchema,
  canEdit: z.boolean(),
});
export type AccessEntry = z.infer<typeof accessEntrySchema>;

export const userCreateSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  role: z.enum(ROLES),
  password: passwordSchema,
  access: z.array(accessEntrySchema).max(500).default([]),
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    role: z.enum(ROLES),
    active: z.boolean(),
    access: z.array(accessEntrySchema).max(500),
  })
  .partial();
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

// ---------------------------------------------------------------- pazienti

export const patientInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Il nome è obbligatorio').max(100),
  lastName: z.string().trim().min(1, 'Il cognome è obbligatorio').max(100),
  birthDate: z
    .union([z.iso.date('Data non valida'), z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || v <= new Date().toISOString().slice(0, 10), 'La data è nel futuro'),
  sex: optionalEnum(SEXES),
  fiscalCode: z
    .string()
    .trim()
    .toUpperCase()
    .nullish()
    .refine((v) => !v || /^[A-Z0-9]{16}$/.test(v), 'Il codice fiscale deve avere 16 caratteri')
    .transform((v) => (v ? v : null)),
  bloodType: optionalEnum(BLOOD_TYPES),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || z.email().safeParse(v).success, 'Indirizzo email non valido')
    .transform((v) => (v ? v.toLowerCase() : null)),
  notes: optionalText(5000),
});
export type PatientInput = z.input<typeof patientInputSchema>;
export type PatientData = z.output<typeof patientInputSchema>;

// ---------------------------------------------------------------- referti

const today = () => new Date().toISOString().slice(0, 10);

const optionalDate = z
  .union([z.iso.date('Data non valida'), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || v <= today(), 'La data è nel futuro');

export const labResultInputSchema = z.object({
  section: optionalText(100),
  name: z.string().trim().min(1, 'Nome obbligatorio').max(200),
  value: z.string().trim().min(1, 'Valore obbligatorio').max(100),
  unit: optionalText(50),
  referenceRange: optionalText(100),
  /** `null` = non indicato: il server lo ricava confrontando valore e intervallo di riferimento. */
  outOfRange: z
    .boolean()
    .nullish()
    .transform((v) => v ?? null),
});
export type LabResultInput = z.input<typeof labResultInputSchema>;
export type LabResultData = z.output<typeof labResultInputSchema>;

export const reportInputSchema = z.object({
  /** Tipo di referto (template). Vuoto in modifica: il referto conserva i campi con cui era stato salvato. */
  templateId: z
    .union([idSchema, z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null)),
  /** Solo per compatibilità (API): senza `templateId` si usa il primo tipo predefinito adatto. */
  kind: z.enum(REPORT_KINDS).optional(),
  title: z.string().trim().min(1, 'Il titolo è obbligatorio').max(300),
  examDate: z.iso.date('Inserisci la data dell’esame').refine((v) => v <= today(), 'La data è nel futuro'),
  samplingDate: optionalDate,
  reportDate: optionalDate,
  reportNumber: optionalText(100),
  facility: optionalText(200),
  doctor: optionalText(200),
  doctorRole: optionalText(200),
  body: optionalText(50_000),
  notes: optionalText(5000),
  results: z.array(labResultInputSchema).max(500, 'Troppi valori (massimo 500)').default([]),
  /** Valori dei campi personalizzati del tipo di referto (la forma la controlla il server, campo per campo). */
  custom: z
    .record(z.string().max(40), z.string().max(50_000).nullish())
    .nullish()
    .transform((v) => v ?? {}),
});
export type ReportInput = z.input<typeof reportInputSchema>;
export type ReportData = z.output<typeof reportInputSchema>;

// ---------------------------------------------------------------- terapie

/** Nome di uno studio di immagini, scelto dall'utente (vuoto = nessun nome). */
export const imagingStudyNameSchema = optionalText(300);

const anyDate = z
  .union([z.iso.date('Data non valida'), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null));

export const medicationInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Il nome del farmaco è obbligatorio').max(200),
    activeIngredient: optionalText(300),
    /** Codice AIC (6 cifre = farmaco, 9 = confezione), se scelto dall'elenco AIFA. */
    aic: z
      .string()
      .trim()
      .nullish()
      .refine((v) => !v || /^\d{6}(\d{3})?$/.test(v), 'Codice AIC non valido')
      .transform((v) => (v ? v : null)),
    /** Dosaggio della confezione ("500 mg") e formulazione ("Compressa"): dall'elenco AIFA o scritti a mano. */
    strength: optionalText(200),
    form: optionalText(200),
    dosage: optionalText(100),
    frequency: optionalText(200),
    asNeeded: z.boolean().default(false),
    reason: optionalText(200),
    prescriber: optionalText(200),
    startDate: anyDate,
    endDate: anyDate,
    notes: optionalText(2000),
  })
  .refine((m) => !m.startDate || !m.endDate || m.endDate >= m.startDate, {
    message: 'La fine non può essere prima dell’inizio',
    path: ['endDate'],
  });
export type MedicationInput = z.input<typeof medicationInputSchema>;
export type MedicationData = z.output<typeof medicationInputSchema>;

/** Casella di un modulo: dall'indirizzo arriva come testo ("on", "1", "true"). */
const flag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === '1' || v === 'true');

/** Scaricamento della cartella clinica: periodo (date vuote = senza limite) e cosa aggiungere al riepilogo. */
export const patientExportSchema = z
  .object({
    from: anyDate,
    to: anyDate,
    /** PDF originali dei referti. */
    pdf: flag,
    /** Immagini diagnostiche (file DICOM). */
    images: flag,
  })
  .refine((e) => !e.from || !e.to || e.to >= e.from, {
    message: 'La data finale non può essere prima di quella iniziale',
    path: ['to'],
  });
export type PatientExportInput = z.input<typeof patientExportSchema>;
export type PatientExportOptions = z.output<typeof patientExportSchema>;

export const drugSearchSchema = z.string().trim().min(2, 'Scrivi almeno 2 lettere').max(100);

/** Codice AIC di un farmaco (le prime 6 cifre: tutte le sue confezioni). */
export const drugCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Codice AIC non valido');

/** Consultazione dell'elenco dei farmaci: senza testo si sfoglia tutto l'elenco. */
export const drugCatalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Senza ordinamento: alfabetico senza ricerca, per pertinenza con la ricerca. */
  sort: z.enum(['name', 'ingredient', 'form', 'holder']).optional(),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

/** Consultazione del catalogo delle prestazioni: testo o codice, branca; voci cessate escluse (predefinito), incluse o da sole. */
export const healthServiceListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  branch: z.string().trim().max(100).optional(),
  ceased: z.enum(['exclude', 'include', 'only']).default('exclude'),
  sort: z.enum(['code', 'name', 'branch', 'tariff']).default('code'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const healthServiceIdSchema = z.string().trim().regex(/^[\w.-]{1,30}$/);

export const patientListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

/**
 * Sincronizzazione dell'app mobile (`GET /api/v1/sync?since=…`): `since` è il `cursor` ricevuto dalla
 * sincronizzazione precedente. Assente o non valido → sincronizzazione completa.
 */
export const syncQuerySchema = z.object({
  since: z.iso.datetime().optional().catch(undefined),
});

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  userId: idSchema.optional(),
  action: z.string().max(100).optional(),
  /** Giorni (AAAA-MM-GG, inclusi) entro cui cercare le attività. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ---------------------------------------------------------------- impostazioni del server

const wholeNumber = (min: number, max: number, tooSmall: string) =>
  z.coerce.number('Inserisci un numero').int('Inserisci un numero intero').min(min, tooSmall).max(max, `Massimo ${max}`);

/** Impostazioni modificabili dagli amministratori. Ogni voce è salvata a sé: se ne possono aggiungere altre. */
export const serverSettingsSchema = z.object({
  /** Una sessione inutilizzata per questo numero di giorni scade. */
  sessionIdleDays: wholeNumber(1, 365, 'Almeno 1 giorno'),
  /** Dopo questo numero di giorni dal login bisogna comunque rientrare. */
  sessionMaxDays: wholeNumber(1, 730, 'Almeno 1 giorno'),
  /** Per quanti mesi conservare il registro accessi: 0 = per sempre. */
  auditRetentionMonths: wholeNumber(0, 120, 'Non può essere negativo'),
  /** Aggiornamento automatico dell'elenco dei farmaci AIFA: attivo, ogni quanti giorni, a che ora. */
  drugsAutoUpdate: z.boolean(),
  drugsUpdateDays: wholeNumber(1, 365, 'Almeno 1 giorno'),
  drugsUpdateHour: wholeNumber(0, 23, 'Non può essere negativa'),
  /** Aggiornamento automatico dell'elenco delle prestazioni della Regione Puglia. */
  servicesAutoUpdate: z.boolean(),
  servicesUpdateDays: wholeNumber(1, 365, 'Almeno 1 giorno'),
  servicesUpdateHour: wholeNumber(0, 23, 'Non può essere negativa'),
  /** Piano terapeutico nella panoramica del paziente: tipo di referto (null = nessuno) e campo data con la scadenza. */
  therapyPlanTemplateId: idSchema.nullable(),
  therapyPlanDateField: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Campo non valido').nullable(),
});
export type ServerSettings = z.output<typeof serverSettingsSchema>;

/** Modifica di una o più voci. */
export const serverSettingsUpdateSchema = serverSettingsSchema.partial();

/** Controllo tra voci diverse, da applicare alle impostazioni complete. */
export const sessionDaysAreConsistent = (s: Pick<ServerSettings, 'sessionIdleDays' | 'sessionMaxDays'>) =>
  s.sessionIdleDays <= s.sessionMaxDays;

export const sessionSettingsSchema = serverSettingsSchema
  .pick({ sessionIdleDays: true, sessionMaxDays: true })
  .refine(sessionDaysAreConsistent, { message: 'Non può superare la durata massima', path: ['sessionIdleDays'] });

export const auditSettingsSchema = serverSettingsSchema.pick({ auditRetentionMonths: true });

/** Con un tipo di referto scelto serve anche il campo con la data di scadenza. */
export const therapyPlanSettingsSchema = serverSettingsSchema
  .pick({ therapyPlanTemplateId: true, therapyPlanDateField: true })
  .refine((s) => !s.therapyPlanTemplateId || !!s.therapyPlanDateField, { message: 'Scegli il campo con la data di scadenza', path: ['therapyPlanDateField'] });

/** Elenchi scaricati da fonti pubbliche che il server può aggiornare da solo. */
export const AUTO_UPDATE_CATALOGS = ['drugs', 'services'] as const;
export type AutoUpdateCatalog = (typeof AUTO_UPDATE_CATALOGS)[number];

/** Voci delle impostazioni di ciascun elenco (es. `drugsAutoUpdate`, `drugsUpdateDays`, `drugsUpdateHour`). */
export const catalogSettingKeys = <C extends AutoUpdateCatalog>(catalog: C) =>
  ({ enabled: `${catalog}AutoUpdate`, days: `${catalog}UpdateDays`, hour: `${catalog}UpdateHour` }) as const;

export const drugsUpdateSettingsSchema = serverSettingsSchema.pick({ drugsAutoUpdate: true, drugsUpdateDays: true, drugsUpdateHour: true });
export const servicesUpdateSettingsSchema = serverSettingsSchema.pick({ servicesAutoUpdate: true, servicesUpdateDays: true, servicesUpdateHour: true });
