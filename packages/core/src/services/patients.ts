import {
  idSchema,
  patientInputSchema,
  patientListQuerySchema,
  type BloodType,
  type PatientData,
  type PatientDTO,
} from '@alby/shared';
import { requireAdmin, requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma, Prisma, type Patient } from '../db';
import { notFound } from '../errors';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOnly = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

export function toPatientDTO(p: Patient, canEdit: boolean): PatientDTO {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    birthDate: isoDate(p.birthDate),
    sex: p.sex,
    fiscalCode: p.fiscalCode,
    bloodType: p.bloodType as BloodType | null,
    phone: p.phone,
    email: p.email,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    canEdit,
  };
}

/** Minuscolo e senza accenti/apostrofi: "D’Èsempio" → "d esempio". */
export function normalizeForSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function toDbData(input: PatientData) {
  return {
    ...input,
    birthDate: dateOnly(input.birthDate),
    searchText: normalizeForSearch(`${input.lastName} ${input.firstName} ${input.fiscalCode ?? ''}`),
  };
}

export async function listPatients(ctx: RequestContext, rawQuery: unknown = {}): Promise<PatientDTO[]> {
  const { user } = requireUser(ctx);
  const { q } = patientListQuerySchema.parse(rawQuery);
  const isAdmin = user.role === 'ADMIN';

  const where: Prisma.PatientWhereInput = {};
  if (!isAdmin) where.access = { some: { userId: user.id } };
  const terms = q ? normalizeForSearch(q).split(' ').filter(Boolean) : [];
  if (terms.length) {
    // Ogni parola deve comparire in nome, cognome o codice fiscale (accenti ignorati).
    where.AND = terms.map((term) => ({ searchText: { contains: term } }));
  }

  const patients = await getPrisma().patient.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: { access: { where: { userId: user.id } } },
  });
  return patients.map((p) => toPatientDTO(p, isAdmin || p.access[0]?.canEdit === true));
}

/** Legge la scheda di un paziente e registra la consultazione. */
export async function getPatient(ctx: RequestContext, rawId: unknown): Promise<PatientDTO> {
  const authed = requireUser(ctx);
  const id = idSchema.safeParse(rawId);
  if (!id.success) throw notFound('Paziente');
  const permission = await requirePatientPermission(authed, id.data, 'view');
  const patient = await getPrisma().patient.findUnique({ where: { id: id.data } });
  if (!patient) throw notFound('Paziente');
  await writeAudit(ctx, 'patient.viewed', { entity: 'patient', entityId: patient.id });
  return toPatientDTO(patient, permission === 'edit');
}

export async function createPatient(ctx: RequestContext, raw: unknown): Promise<PatientDTO> {
  requireAdmin(ctx);
  const input = patientInputSchema.parse(raw);
  const patient = await getPrisma().patient.create({ data: toDbData(input) });
  await writeAudit(ctx, 'patient.created', { entity: 'patient', entityId: patient.id });
  return toPatientDTO(patient, true);
}

export async function updatePatient(ctx: RequestContext, rawId: unknown, raw: unknown): Promise<PatientDTO> {
  const authed = requireUser(ctx);
  const id = idSchema.parse(rawId);
  await requirePatientPermission(authed, id, 'edit');
  const input = patientInputSchema.parse(raw);
  const patient = await getPrisma().patient.update({ where: { id }, data: toDbData(input) });
  await writeAudit(ctx, 'patient.updated', { entity: 'patient', entityId: id });
  return toPatientDTO(patient, true);
}

export async function deletePatient(ctx: RequestContext, rawId: unknown): Promise<void> {
  requireAdmin(ctx);
  const id = idSchema.parse(rawId);
  const prisma = getPrisma();
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw notFound('Paziente');
  await prisma.patient.delete({ where: { id } });
  // Il nome resta nel registro per sapere chi è stato eliminato (dato anagrafico, non sanitario).
  await writeAudit(ctx, 'patient.deleted', {
    entity: 'patient',
    entityId: id,
    details: { name: `${patient.lastName} ${patient.firstName}` },
  });
}
