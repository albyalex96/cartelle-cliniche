// Colore principale del tema: file neutro, usato sia dai Server Component sia dal selettore nel browser.

export const ACCENT_COOKIE = 'accent';

export const ACCENTS = [
  { value: 'teal', label: 'Verde acqua', swatch: 'oklch(0.6 0.118 184.704)' },
  { value: 'blue', label: 'Blu', swatch: 'oklch(0.546 0.245 262.881)' },
  { value: 'indigo', label: 'Indaco', swatch: 'oklch(0.511 0.262 276.966)' },
  { value: 'violet', label: 'Viola', swatch: 'oklch(0.541 0.281 293.009)' },
  { value: 'rose', label: 'Rosa', swatch: 'oklch(0.586 0.253 17.585)' },
  { value: 'orange', label: 'Arancione', swatch: 'oklch(0.646 0.222 41.116)' },
  { value: 'green', label: 'Verde', swatch: 'oklch(0.627 0.194 149.214)' },
  { value: 'neutral', label: 'Grigio', swatch: 'oklch(0.371 0 0)' },
] as const;

export type Accent = (typeof ACCENTS)[number]['value'];

export const DEFAULT_ACCENT: Accent = 'teal';

export function parseAccent(value: string | undefined): Accent {
  return ACCENTS.some((a) => a.value === value) ? (value as Accent) : DEFAULT_ACCENT;
}
