import type { AuthedContext } from '../context';
import { getPrisma } from '../db';
import { forbidden, notFound } from '../errors';

export type PatientPermission = 'view' | 'edit';

export async function getPatientPermission(ctx: AuthedContext, patientId: string): Promise<PatientPermission | null> {
  if (ctx.user.role === 'ADMIN') return 'edit';
  const access = await getPrisma().patientAccess.findUnique({
    where: { userId_patientId: { userId: ctx.user.id, patientId } },
  });
  if (!access) return null;
  return access.canEdit ? 'edit' : 'view';
}

/**
 * Verifica che l'utente possa accedere al paziente.
 * Senza alcun accesso risponde "non trovato", così non si rivela nemmeno che il paziente esiste.
 */
export async function requirePatientPermission(
  ctx: AuthedContext,
  patientId: string,
  level: PatientPermission,
): Promise<PatientPermission> {
  const permission = await getPatientPermission(ctx, patientId);
  if (!permission) throw notFound('Paziente');
  if (level === 'edit' && permission !== 'edit') throw forbidden('Non puoi modificare questo paziente');
  return permission;
}
