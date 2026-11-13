import type { ImagingStudyDTO } from '@alby/shared';
import { MODALITY_LABELS } from '@/features/imaging/modalities';
import { formatDate } from '@/lib/format';

/** Dati per la sezione "Immagini" del form del referto. File neutro: preparato dal server, usato dal client. */
export interface ReportImaging {
  /** Dati per confrontare un CD con il paziente (vedi `DiscImportDialog`). */
  patient: { id: string; firstName: string; lastName: string; birthDate: string | null; fiscalCode: string | null };
  studies: {
    id: string;
    /** Nome scelto o letto dal CD (`null` se manca). */
    name: string | null;
    title: string;
    /** Es. "14/03/2024 · Risonanza · 24 immagini". */
    caption: string;
    coverInstanceId: string | null;
    imageCount: number;
    /** Lo studio è già collegato a un altro referto (salvando passa a questo). */
    linkedElsewhere: boolean;
  }[];
  /** Studi già collegati al referto che si sta modificando. */
  linkedIds: string[];
}

export function toReportImaging(patient: ReportImaging['patient'], studies: ImagingStudyDTO[], reportId: string | null): ReportImaging {
  return {
    patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, birthDate: patient.birthDate, fiscalCode: patient.fiscalCode },
    studies: studies.map((s) => ({
      id: s.id,
      name: s.description,
      title: s.description || 'Studio senza descrizione',
      caption: [
        s.studyDate && formatDate(s.studyDate),
        s.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(', '),
        s.imageCount === 1 ? '1 immagine' : `${s.imageCount} immagini`,
      ]
        .filter(Boolean)
        .join(' · '),
      coverInstanceId: s.coverInstanceId,
      imageCount: s.imageCount,
      linkedElsewhere: s.reportId !== null && s.reportId !== reportId,
    })),
    linkedIds: reportId ? studies.filter((s) => s.reportId === reportId).map((s) => s.id) : [],
  };
}
