import type { BloodType, PatientDTO, UserDTO } from '@alby/shared';
import type { Patient, PatientAccess, User } from './generated/prisma/client.js';

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

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

type UserWithAccess = User & { patientAccess: (PatientAccess & { patient: Patient })[] };

export function toUserDTO(u: UserWithAccess): UserDTO {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    access: u.patientAccess
      .map((a) => ({
        patientId: a.patientId,
        patientName: `${a.patient.lastName} ${a.patient.firstName}`,
        canEdit: a.canEdit,
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName, 'it')),
  };
}

/** Converte una data 'YYYY-MM-DD' nel formato usato dalle colonne DATE. */
export const dateOnly = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
