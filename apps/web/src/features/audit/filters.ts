/** Filtri del registro accessi (usati sia dalla pagina server sia dal selettore client). */
export const AUDIT_FILTERS = [
  { value: 'all', label: 'Tutte le attività' },
  { value: 'auth', label: 'Accessi e password' },
  { value: 'patient', label: 'Pazienti' },
  { value: 'user', label: 'Utenti' },
  { value: 'report', label: 'Referti' },
  { value: 'imaging', label: 'Immagini' },
  { value: 'medication', label: 'Terapie' },
  { value: 'lab', label: 'Andamento esami' },
  { value: 'drugs', label: 'Elenco farmaci' },
] as const;
