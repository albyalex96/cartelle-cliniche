import { redirect } from 'next/navigation';

/** L'elenco dei farmaci ora è consultabile da tutti: resta solo il vecchio indirizzo. */
export default function OldDrugCatalogPage() {
  redirect('/farmaci');
}
