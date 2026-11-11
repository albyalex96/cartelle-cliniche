import { auditListQuerySchema, type AuditEntryDTO, type Paginated } from '@alby/shared';
import { requireAdmin } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma, Prisma } from '../db';

interface AuditOptions {
  /** Utente a cui attribuire l'azione; di default quello del contesto. */
  userId?: string | null;
  entity?: string;
  entityId?: string;
  /** Solo metadati: mai dati sanitari. */
  details?: Prisma.InputJsonValue;
}

/** Scrive una voce nel registro. Un errore di scrittura non blocca l'operazione principale. */
export async function writeAudit(ctx: RequestContext, action: string, opts: AuditOptions = {}) {
  try {
    await getPrisma().auditLog.create({
      data: {
        action,
        userId: opts.userId !== undefined ? opts.userId : (ctx.user?.id ?? null),
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details ?? Prisma.JsonNull,
        ip: ctx.ip,
      },
    });
  } catch (err) {
    console.error(`[audit] scrittura non riuscita per "${action}"`, err);
  }
}

export async function listAudit(ctx: RequestContext, rawQuery: unknown): Promise<Paginated<AuditEntryDTO>> {
  requireAdmin(ctx);
  const { page, pageSize, userId, action } = auditListQuerySchema.parse(rawQuery);
  const prisma = getPrisma();

  const where: Prisma.AuditLogWhereInput = {
    ...(userId ? { userId } : {}),
    ...(action ? { action: { startsWith: action } } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { displayName: true } } },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      action: r.action,
      userId: r.userId,
      userName: r.user?.displayName ?? null,
      entity: r.entity,
      entityId: r.entityId,
      details: r.details,
      ip: r.ip,
    })),
  };
}
