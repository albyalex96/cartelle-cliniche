import { z } from 'zod';
import { BLOOD_TYPES, PASSWORD_MIN_LENGTH, ROLES, SEXES } from './constants';

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
});
export type LoginInput = z.input<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Inserisci la password attuale').max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

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

export const patientListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  userId: idSchema.optional(),
  action: z.string().max(100).optional(),
});
