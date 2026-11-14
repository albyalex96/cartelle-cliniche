// Dimensione del testo: file neutro, usato sia dai Server Component sia dal selettore nel browser.
// Tailwind misura tutto in rem, quindi cambiando la dimensione di base si ingrandisce l'intera interfaccia.

export const TEXT_SIZE_COOKIE = 'text-size';

export const TEXT_SIZES = [
  { value: 'small', label: 'Piccolo', sample: 'text-xs' },
  { value: 'normal', label: 'Normale', sample: 'text-sm' },
  { value: 'large', label: 'Grande', sample: 'text-base' },
  { value: 'xlarge', label: 'Molto grande', sample: 'text-lg' },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['value'];

export const DEFAULT_TEXT_SIZE: TextSize = 'normal';

export function parseTextSize(value: string | undefined): TextSize {
  return TEXT_SIZES.some((s) => s.value === value) ? (value as TextSize) : DEFAULT_TEXT_SIZE;
}
