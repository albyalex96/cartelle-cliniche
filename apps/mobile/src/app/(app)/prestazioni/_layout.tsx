import { Stack } from 'expo-router';
import { GlassTarget } from '@/ui/glass';

/** Scheda "Prestazioni": le sue schermate, sotto la barra di vetro che le sfoca. */
export default function ServicesLayout() {
  return (
    <GlassTarget>
      <Stack />
    </GlassTarget>
  );
}
