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
  const { page, pageSize, userId, action, from, to } = auditListQuerySchema.parse(rawQuery);
  const prisma = getPrisma();

  const where: Prisma.AuditLogWhereInput = {
    ...(userId ? { userId } : {}),
    ...(action ? { action: { startsWith: action } } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) } }
      : {}),
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

  const subjects = await resolveSubjects(rows);

  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => {
      const patientId = subjects.patientIdOf(r);
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        userId: r.userId,
        userName: r.user?.displayName ?? null,
        entity: r.entity,
        entityId: r.entityId,
        details: r.details,
        ip: r.ip,
        patientId,
        patientName: patientId ? (subjects.patientNames.get(patientId) ?? null) : null,
        targetUserName: r.entity === 'user' && r.entityId ? (subjects.userNames.get(r.entityId) ?? null) : null,
      };
    }),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuditRow {
  entity: string | null;
  entityId: string | null;
  details: Prisma.JsonValue;
}

/**
 * A chi si riferiscono le voci di una pagina del registro: il paziente (direttamente, dai dettagli,
 * oppure risalendo dal referto o dal PDF) e l'utente su cui si è agito. I nomi si leggono al momento
 * della consultazione e non vengono mai salvati nel registro.
 */
async function resolveSubjects(rows: AuditRow[]) {
  const prisma = getPrisma();
  const idsOf = (entity: string) => [
    ...new Set(rows.filter((r) => r.entity === entity && r.entityId && UUID.test(r.entityId)).map((r) => r.entityId!)),
  ];
  const detailPatientId = (r: AuditRow): string | null => {
    const d = r.details;
    if (d && typeof d === 'object' && !Array.isArray(d) && typeof d.patientId === 'string' && UUID.test(d.patientId)) return d.patientId;
    return null;
  };

  // Voci più vecchie di referti e PDF non riportano il paziente nei dettagli: si risale dal dato, se esiste ancora.
  const needsLookup = (entity: string) => [
    ...new Set(
      rows.filter((r) => r.entity === entity && r.entityId && UUID.test(r.entityId) && !detailPatientId(r)).map((r) => r.entityId!),
    ),
  ];
  const reportIds = needsLookup('report');
  const fileIds = needsLookup('file');
  const userIds = idsOf('user');
  const [reports, files, users] = await Promise.all([
    reportIds.length ? prisma.report.findMany({ where: { id: { in: reportIds } }, select: { id: true, patientId: true } }) : [],
    fileIds.length ? prisma.storedFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, patientId: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }) : [],
  ]);
  const viaReport = new Map(reports.map((r) => [r.id, r.patientId]));
  const viaFile = new Map(files.map((f) => [f.id, f.patientId]));

  const patientIdOf = (r: AuditRow): string | null => {
    const fromDetails = detailPatientId(r);
    if (fromDetails) return fromDetails;
    if (!r.entityId || !UUID.test(r.entityId)) return null;
    if (r.entity === 'patient') return r.entityId;
    if (r.entity === 'report') return viaReport.get(r.entityId) ?? null;
    if (r.entity === 'file') return viaFile.get(r.entityId) ?? null;
    return null;
  };

  const patientIds = [...new Set(rows.map(patientIdOf).filter((id): id is string => !!id))];
  const patients = patientIds.length
    ? await prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];

  return {
    patientIdOf,
    patientNames: new Map(patients.map((p) => [p.id, `${p.lastName} ${p.firstName}`])),
    userNames: new Map(users.map((u) => [u.id, u.displayName])),
  };
}
