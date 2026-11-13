import { UrlSearch } from '@/components/url-search';

/** Ricerca nell'elenco pazienti: l'unica parte client è il campo, che aggiorna `?q=` nell'indirizzo. */
export function PatientSearch({ defaultValue }: { defaultValue: string }) {
  return <UrlSearch defaultValue={defaultValue} placeholder="Cerca per nome, cognome o codice fiscale…" label="Cerca pazienti" />;
}
