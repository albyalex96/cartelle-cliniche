import type { AuthUser } from './auth/guard.js';
import { prisma } from './db.js';
import { forbidden, notFound } from './http.js';

export type PatientPermission = 'view' | 'edit';

export async function getPatientPermission(user: AuthUser, patientId: string): Promise<PatientPermission | null> {
  if (user.role === 'ADMIN') return 'edit';
  const access = await prisma.patientAccess.findUnique({
    where: { userId_patientId: { userId: user.id, patientId } },
  });
  if (!access) return null;
  return access.canEdit ? 'edit' : 'view';
}

/**
 * Verifica che l'utente possa accedere al paziente.
 * Senza alcun accesso risponde 404, così non si rivela nemmeno che il paziente esiste.
 */
export async function requirePatientPermission(
  user: AuthUser,
  patientId: string,
  level: PatientPermission,
): Promise<PatientPermission> {
  const permission = await getPatientPermission(user, patientId);
  if (!permission) throw notFound('Paziente');
  if (level === 'edit' && permission !== 'edit') throw forbidden('Non puoi modificare questo paziente');
  return permission;
}
