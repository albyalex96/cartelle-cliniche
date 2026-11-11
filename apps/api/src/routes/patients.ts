import { idParamsSchema, patientInputSchema, patientListQuerySchema, type PatientDTO } from '@alby/shared';
import type { FastifyInstance } from 'fastify';
import { requirePatientPermission } from '../access.js';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth/guard.js';
import { Prisma, prisma } from '../db.js';
import { dateOnly, toPatientDTO } from '../dto.js';
import { notFound, parse } from '../http.js';

/** Minuscolo e senza accenti/apostrofi: "D’Èsempio" → "d esempio". */
export function normalizeForSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function toPrismaData(input: ReturnType<typeof patientInputSchema.parse>) {
  return {
    ...input,
    birthDate: dateOnly(input.birthDate),
    searchText: normalizeForSearch(`${input.lastName} ${input.firstName} ${input.fiscalCode ?? ''}`),
  };
}

export async function patientRoutes(app: FastifyInstance) {
  app.get('/', async (req): Promise<PatientDTO[]> => {
    const user = requireUser(req);
    const { q } = parse(patientListQuerySchema, req.query);
    const isAdmin = user.role === 'ADMIN';

    const where: Prisma.PatientWhereInput = {};
    if (!isAdmin) where.access = { some: { userId: user.id } };
    const terms = q ? normalizeForSearch(q).split(' ').filter(Boolean) : [];
    if (terms.length) {
      // Ogni parola deve comparire in nome, cognome o codice fiscale (accenti ignorati).
      where.AND = terms.map((term) => ({ searchText: { contains: term } }));
    }

    const patients = await prisma.patient.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { access: { where: { userId: user.id } } },
    });
    return patients.map((p) => toPatientDTO(p, isAdmin || p.access[0]?.canEdit === true));
  });

  app.post('/', async (req, reply): Promise<PatientDTO> => {
    requireAdmin(req);
    const input = parse(patientInputSchema, req.body);
    const patient = await prisma.patient.create({ data: toPrismaData(input) });
    await audit(req, 'patient.created', { entity: 'patient', entityId: patient.id });
    reply.code(201);
    return toPatientDTO(patient, true);
  });

  app.get('/:id', async (req): Promise<PatientDTO> => {
    const user = requireUser(req);
    const { id } = parse(idParamsSchema, req.params);
    const permission = await requirePatientPermission(user, id, 'view');
    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) throw notFound('Paziente');
    await audit(req, 'patient.viewed', { entity: 'patient', entityId: id });
    return toPatientDTO(patient, permission === 'edit');
  });

  app.put('/:id', async (req): Promise<PatientDTO> => {
    const user = requireUser(req);
    const { id } = parse(idParamsSchema, req.params);
    await requirePatientPermission(user, id, 'edit');
    const input = parse(patientInputSchema, req.body);
    const patient = await prisma.patient.update({ where: { id }, data: toPrismaData(input) });
    await audit(req, 'patient.updated', { entity: 'patient', entityId: id });
    return toPatientDTO(patient, true);
  });

  app.delete('/:id', async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParamsSchema, req.params);
    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) throw notFound('Paziente');
    await prisma.patient.delete({ where: { id } });
    await audit(req, 'patient.deleted', {
      entity: 'patient',
      entityId: id,
      details: { name: `${patient.lastName} ${patient.firstName}` },
    });
    return reply.code(204).send();
  });
}
