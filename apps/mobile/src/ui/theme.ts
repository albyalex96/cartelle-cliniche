import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router';
import { useColorScheme } from 'react-native';

/** Colori dell'app: chiaro e scuro seguono l'impostazione del telefono. */
const light = {
  dark: false,
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#11181C',
  muted: '#5F6B76',
  border: '#D5DAE0',
  primary: '#1F6FEB',
  primarySurface: '#E7F0FD',
  onPrimary: '#FFFFFF',
  danger: '#C62828',
  dangerSurface: '#FDECEA',
  /** Valori fuori dall'intervallo di riferimento. */
  warning: '#B45309',
  warningSurface: '#FEF3C7',
  /** Effetto vetro: riempimento traslucido, bordo sottile e riflesso più chiaro sul lato alto. */
  glassFill: 'rgba(255,255,255,0.72)',
  /** Velo sopra la sfocatura (più leggero: la sfocatura fa già il resto). */
  glassTint: 'rgba(255,255,255,0.38)',
  glassBorder: 'rgba(15,23,42,0.10)',
  glassHighlight: 'rgba(255,255,255,0.95)',
  shadow: 'rgba(15,23,42,0.18)',
};

const dark: typeof light = {
  dark: true,
  background: '#0F1214',
  surface: '#1A1F23',
  text: '#ECEDEE',
  muted: '#9BA5AE',
  border: '#30373D',
  primary: '#4C8DF6',
  primarySurface: '#16263D',
  onPrimary: '#FFFFFF',
  danger: '#EF7A72',
  dangerSurface: '#3A1E1C',
  warning: '#F5B454',
  warningSurface: '#3A2A12',
  glassFill: 'rgba(30,36,42,0.70)',
  glassTint: 'rgba(24,28,33,0.42)',
  glassBorder: 'rgba(255,255,255,0.10)',
  glassHighlight: 'rgba(255,255,255,0.22)',
  shadow: 'rgba(0,0,0,0.6)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Tema della navigazione (barra superiore, sfondo delle schermate) con gli stessi colori dell'app. */
export function navigationTheme(t: Theme): NavigationTheme {
  const base = t.dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: t.primary,
      background: t.background,
      card: t.surface,
      text: t.text,
      border: t.border,
      notification: t.danger,
    },
  };
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = 16;

/** Bordo "di vetro": sottile, con un riflesso chiaro in alto (come la luce su una lastra). */
export const glassEdge = (t: Theme) => ({
  borderWidth: 1,
  borderColor: t.glassBorder,
  borderTopColor: t.glassHighlight,
});

/** Ombra morbida per gli elementi che galleggiano (Android usa `elevation`). */
export const floating = (t: Theme) => ({
  shadowColor: t.shadow,
  shadowOpacity: 1,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 10,
});
