import type { ImagingStudyDetailDTO } from '@alby/shared';
import { MODALITY_LABELS } from './modalities';

export interface ViewerSeries {
  id: string;
  name: string;
  /** Es. "Risonanza · 24 immagini". */
  caption: string;
  imageIds: string[];
}

/** Serie di uno studio pronte per i visualizzatori (file neutro: usato da server e client). */
export function toViewerSeries(study: ImagingStudyDetailDTO): ViewerSeries[] {
  return study.series
    .filter((s) => s.instances.length > 0)
    .map((s, i) => ({
      id: s.id,
      name: s.description || `Serie ${s.number ?? i + 1}`,
      caption: `${s.modality ? `${MODALITY_LABELS[s.modality] ?? s.modality} · ` : ''}${s.instances.length === 1 ? '1 immagine' : `${s.instances.length} immagini`}`,
      imageIds: s.instances.map((x) => x.id),
    }));
}
