import { createHash, randomUUID } from 'node:crypto';
import { ENCAPSULATED_PDF_SOP_CLASS, isDicomFile, readDicomInstance } from '@alby/dicom';
import { idSchema, MAX_DICOM_BYTES, type DicomUploadResultDTO, type ImagingStudyDTO } from '@alby/shared';
import { requireUser } from '../auth/guard';
import type { RequestContext } from '../context';
import { getPrisma } from '../db';
import { notFound } from '../errors';
import { dicomPaths, removeStored, writeStored } from '../storage';
import { requirePatientPermission } from './access';
import { writeAudit } from './audit';

/**
 * Immagini diagnostiche (DICOM), di solito importate da un CD/DVD.
 * Ogni file viene salvato così com'è nella cartella di archivio; nel database restano
 * studio, serie e immagine con i loro dati descrittivi, letti dal server dal file stesso.
 */

export interface UploadedDicom {
  /** Nome o percorso del file sul disco (solo per segnalare gli errori). */
  name: string;
  bytes: Uint8Array;
}

const parseId = (raw: unknown, what: string) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw notFound(what);
  return id.data;
};

const dateOnly = (v?: string) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

/** Nome del file mostrato negli errori: solo l'ultima parte, senza caratteri strani. */
const shortName = (name: string) => (name.split(/[\\/]/).pop() ?? name).replace(/[\u0000-\u001f]/g, '').slice(0, 120);

/**
 * Salva un gruppo di immagini DICOM di un paziente. Il server rilegge ogni file: accetta solo
 * file DICOM veri, ignora le immagini già presenti e i referti PDF incapsulati (vanno nei referti).
 */
export async function uploadDicomFiles(ctx: RequestContext, rawPatientId: unknown, files: UploadedDicom[]): Promise<DicomUploadResultDTO> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'edit');
  const prisma = getPrisma();
  const result: DicomUploadResultDTO = { added: 0, duplicates: 0, rejected: [] };
  const reject = (f: UploadedDicom, reason: string) => result.rejected.push({ name: shortName(f.name), reason });
  // Studi e serie già visti in questo gruppo: evita di cercarli a ogni immagine.
  const studies = new Map<string, string>();
  const series = new Map<string, string>();

  for (const file of files) {
    if (file.bytes.byteLength > MAX_DICOM_BYTES) {
      reject(file, `supera i ${MAX_DICOM_BYTES / 1024 / 1024} MB`);
      continue;
    }
    if (!isDicomFile(file.bytes)) {
      reject(file, 'non è un file DICOM');
      continue;
    }
    const inst = readDicomInstance(file.bytes);
    if (!inst) {
      reject(file, 'file DICOM non leggibile');
      continue;
    }
    if (inst.sopClassUid === ENCAPSULATED_PDF_SOP_CLASS) {
      reject(file, 'è un referto PDF: importalo dai referti');
      continue;
    }
    const sha256 = createHash('sha256').update(file.bytes).digest('hex');
    // Senza identificativo dell'immagine si usa l'impronta del contenuto (stesso file = stessa immagine).
    const sopUid = inst.sopUid ?? `sha256:${sha256}`;

    let studyId = studies.get(inst.studyUid);
    if (!studyId) {
      const existing = await prisma.imagingStudy.findUnique({ where: { patientId_studyUid: { patientId, studyUid: inst.studyUid } } });
      const study = existing
        ? await prisma.imagingStudy.update({
            where: { id: existing.id },
            // Completa i dati mancanti senza sovrascrivere quelli già presenti.
            data: {
              studyDate: existing.studyDate ?? dateOnly(inst.studyDate),
              description: existing.description ?? inst.studyDescription ?? null,
              institution: existing.institution ?? inst.institution ?? null,
              accessionNumber: existing.accessionNumber ?? inst.accessionNumber ?? null,
            },
          })
        : await prisma.imagingStudy.create({
            data: {
              patientId,
              studyUid: inst.studyUid,
              studyDate: dateOnly(inst.studyDate),
              description: inst.studyDescription ?? null,
              institution: inst.institution ?? null,
              accessionNumber: inst.accessionNumber ?? null,
              modalities: [],
              createdById: authed.user.id,
            },
          });
      studyId = study.id;
      studies.set(inst.studyUid, studyId);
    }
    if (inst.modality) {
      const study = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: studyId }, select: { modalities: true } });
      if (!study.modalities.includes(inst.modality)) {
        await prisma.imagingStudy.update({ where: { id: studyId }, data: { modalities: { push: inst.modality } } });
      }
    }

    const seriesKey = `${studyId}:${inst.seriesUid}`;
    let seriesId = series.get(seriesKey);
    if (!seriesId) {
      const s = await prisma.imagingSeries.upsert({
        where: { studyId_seriesUid: { studyId, seriesUid: inst.seriesUid } },
        update: {},
        create: {
          studyId,
          seriesUid: inst.seriesUid,
          number: inst.seriesNumber ?? null,
          modality: inst.modality ?? null,
          description: inst.seriesDescription ?? null,
        },
      });
      seriesId = s.id;
      series.set(seriesKey, seriesId);
    }

    if (await prisma.imagingInstance.findUnique({ where: { seriesId_sopUid: { seriesId, sopUid } }, select: { id: true } })) {
      result.duplicates++;
      continue;
    }

    const id = randomUUID();
    const storagePath = dicomPaths.instance(patientId, studyId, id);
    await writeStored(storagePath, file.bytes);
    try {
      await prisma.imagingInstance.create({
        data: { id, seriesId, sopUid, instanceNumber: inst.instanceNumber ?? null, size: file.bytes.byteLength, sha256, storagePath },
      });
      result.added++;
    } catch (err) {
      // Se il database rifiuta (es. la stessa immagine caricata in parallelo) il file non deve restare orfano.
      await removeStored(storagePath);
      if ((err as { code?: string }).code === 'P2002') result.duplicates++;
      else throw err;
    }
  }

  await writeAudit(ctx, 'imaging.uploaded', {
    entity: 'patient',
    entityId: patientId,
    details: { added: result.added, duplicates: result.duplicates, rejected: result.rejected.length },
  });
  return result;
}

export async function listImagingStudies(ctx: RequestContext, rawPatientId: unknown): Promise<ImagingStudyDTO[]> {
  const authed = requireUser(ctx);
  const patientId = parseId(rawPatientId, 'Paziente');
  await requirePatientPermission(authed, patientId, 'view');
  const prisma = getPrisma();
  const studies = await prisma.imagingStudy.findMany({
    where: { patientId },
    orderBy: [{ studyDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    include: { series: { select: { id: true } } },
  });
  // Numero e dimensione delle immagini per studio, con una sola query.
  const totals = await prisma.imagingInstance.groupBy({
    by: ['seriesId'],
    where: { series: { studyId: { in: studies.map((s) => s.id) } } },
    _count: { _all: true },
    _sum: { size: true },
  });
  const bySeries = new Map(totals.map((t) => [t.seriesId, t]));
  return studies.map((s) => {
    const t = s.series.map((x) => bySeries.get(x.id));
    return {
      id: s.id,
      studyDate: s.studyDate ? s.studyDate.toISOString().slice(0, 10) : null,
      description: s.description,
      modalities: s.modalities,
      institution: s.institution,
      seriesCount: s.series.length,
      imageCount: t.reduce((n, x) => n + (x?._count._all ?? 0), 0),
      bytes: t.reduce((n, x) => n + (x?._sum.size ?? 0), 0),
      createdAt: s.createdAt.toISOString(),
    };
  });
}

/** Elimina uno studio con tutte le sue immagini (anche i file nell'archivio). */
export async function deleteImagingStudy(ctx: RequestContext, rawStudyId: unknown): Promise<{ patientId: string }> {
  const authed = requireUser(ctx);
  const id = parseId(rawStudyId, 'Studio');
  const prisma = getPrisma();
  const study = await prisma.imagingStudy.findUnique({ where: { id }, select: { patientId: true } });
  if (!study) throw notFound('Studio');
  await requirePatientPermission(authed, study.patientId, 'edit');
  await prisma.imagingStudy.delete({ where: { id } });
  await removeStored(dicomPaths.study(study.patientId, id));
  await writeAudit(ctx, 'imaging.study_deleted', { entity: 'imaging_study', entityId: id, details: { patientId: study.patientId } });
  return { patientId: study.patientId };
}
