import { MAINTENANCE_MESSAGE } from '@alby/shared';
import type { AuthedContext } from '../context';
import { getPrisma } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { getServerMode } from '../server-modes';

export type PatientPermission = 'view' | 'edit';

/**
 * Permesso dell'utente sul paziente. Durante la manutenzione chi non è amministratore ha al massimo
 * la sola lettura: ogni modifica dei dati sanitari passa da qui, così le pagine nascondono i comandi
 * di modifica e il server rifiuta le scritture.
 */
export async function getPatientPermission(ctx: AuthedContext, patientId: string): Promise<PatientPermission | null> {
  return (await patientPermission(ctx, patientId)).effective;
}

async function patientPermission(ctx: AuthedContext, patientId: string) {
  if (ctx.user.role === 'ADMIN') return { granted: 'edit', effective: 'edit' } as const;
  const access = await getPrisma().patientAccess.findUnique({
    where: { userId_patientId: { userId: ctx.user.id, patientId } },
  });
  if (!access) return { granted: null, effective: null } as const;
  const granted: PatientPermission = access.canEdit ? 'edit' : 'view';
  const effective: PatientPermission = granted === 'edit' && (await getServerMode('maintenance')) ? 'view' : granted;
  return { granted, effective };
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
  const { granted, effective } = await patientPermission(ctx, patientId);
  if (!effective) throw notFound('Paziente');
  if (level === 'edit' && effective !== 'edit') {
    // Chi potrebbe modificare ma è fermato dalla manutenzione riceve un messaggio chiaro, non "permessi insufficienti".
    if (granted === 'edit') throw new AppError(503, MAINTENANCE_MESSAGE, 'MAINTENANCE');
    throw forbidden('Non puoi modificare questo paziente');
  }
  return effective;
}
