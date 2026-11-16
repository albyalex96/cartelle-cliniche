const date = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** "2025-06-01" → "01/06/2025" ('' se vuota o non valida). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : date.format(d);
}

/** Etichetta corta per gli assi dei grafici: "giu 25". */
export function formatMonth(iso: string): string {
  return shortDate.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** Età compiuta alla data di oggi. */
export function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** 12.5 → "12,50 €". */
export const formatEuro = (n: number) => euro.format(n);
