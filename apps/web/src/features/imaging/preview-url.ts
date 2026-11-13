/** Indirizzo dell'anteprima di un'immagine DICOM. File neutro: usato da server e client. */
export const previewUrl = (instanceId: string, size: 'thumb' | 'full' = 'full') =>
  `/api/imaging/${instanceId}${size === 'thumb' ? '?size=thumb' : ''}`;
