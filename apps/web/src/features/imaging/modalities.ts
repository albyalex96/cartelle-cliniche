/** Nomi leggibili delle "modalità" DICOM (tipo di apparecchio). File neutro: usato da server e client. */
export const MODALITY_LABELS: Record<string, string> = {
  MR: 'Risonanza',
  CT: 'TAC',
  US: 'Ecografia',
  CR: 'Radiografia',
  DX: 'Radiografia',
  MG: 'Mammografia',
  XA: 'Angiografia',
  NM: 'Medicina nucleare',
  PT: 'PET',
  OT: 'Altro',
  SR: 'Referto strutturato',
};
