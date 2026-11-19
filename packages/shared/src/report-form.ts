import type { ReportDraftDTO, ReportDTO } from './dto';

/** Referto salvato → valori del form di modifica (stringhe vuote per i campi mancanti), per la webapp e l'app. */
export function reportToFormValues(r: ReportDTO): ReportDraftDTO['values'] {
  return {
    // Tipo eliminato nel frattempo: '' = il referto conserva i campi con cui era stato salvato.
    templateId: r.templateId ?? '',
    title: r.title,
    examDate: r.examDate,
    samplingDate: r.samplingDate ?? '',
    reportDate: r.reportDate ?? '',
    reportNumber: r.reportNumber ?? '',
    facility: r.facility ?? '',
    doctor: r.doctor ?? '',
    doctorRole: r.doctorRole ?? '',
    body: r.body ?? '',
    notes: r.notes ?? '',
    custom: r.custom,
    results: r.results.map((x) => ({
      section: x.section ?? '',
      name: x.name,
      value: x.value,
      unit: x.unit ?? '',
      referenceRange: x.referenceRange ?? '',
      outOfRange: x.outOfRange,
    })),
  };
}
