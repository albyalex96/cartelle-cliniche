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
export const radius = 12;
