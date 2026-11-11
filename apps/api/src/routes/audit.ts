import { auditListQuerySchema, type AuditEntryDTO, type Paginated } from '@alby/shared';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth/guard.js';
import { Prisma, prisma } from '../db.js';
import { parse } from '../http.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/', async (req): Promise<Paginated<AuditEntryDTO>> => {
    requireAdmin(req);
    const { page, pageSize, userId, action } = parse(auditListQuerySchema, req.query);

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
  });
}
