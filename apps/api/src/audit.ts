import type { FastifyRequest } from 'fastify';
import { Prisma, prisma } from './db.js';

interface AuditOptions {
  userId?: string | null;
  entity?: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}

/** Scrive una voce nel registro. Un errore di scrittura non blocca l'operazione principale. */
export async function audit(req: FastifyRequest, action: string, opts: AuditOptions = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: opts.userId !== undefined ? opts.userId : (req.user?.id ?? null),
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details ?? Prisma.JsonNull,
        ip: req.ip,
      },
    });
  } catch (err) {
    req.log.error({ err, action }, 'Scrittura nel registro non riuscita');
  }
}
