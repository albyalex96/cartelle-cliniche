import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#11181C',
  muted: '#5F6B76',
  border: '#D5DAE0',
  primary: '#1F6FEB',
  onPrimary: '#FFFFFF',
  danger: '#C62828',
  dangerSurface: '#FDECEA',
};

const dark: typeof light = {
  background: '#0F1214',
  surface: '#1A1F23',
  text: '#ECEDEE',
  muted: '#9BA5AE',
  border: '#30373D',
  primary: '#4C8DF6',
  onPrimary: '#FFFFFF',
  danger: '#EF7A72',
  dangerSurface: '#3A1E1C',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = 12;
