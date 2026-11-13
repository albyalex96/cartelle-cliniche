const dateFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const relativeFmt = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' });

/** 'YYYY-MM-DD' → '02/03/1950' */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  return dateFmt.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateTimeFmt.format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'mai';
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, sec] of units) {
    if (Math.abs(diffSec) >= sec) return relativeFmt.format(Math.round(diffSec / sec), unit);
  }
  return 'adesso';
}

/** 1536 → '1,5 KB' */
export function formatBytes(bytes: number): string {
  const units = ['byte', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: i === 0 || value >= 100 ? 0 : 1 })} ${units[i]}`;
}

export function ageFrom(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

export function initials(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map((p) => p!.trim()[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

const euroFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** 25 → '25,00 €' */
export function formatEuro(amount: number | null | undefined): string {
  return amount == null ? '—' : euroFmt.format(amount);
}
