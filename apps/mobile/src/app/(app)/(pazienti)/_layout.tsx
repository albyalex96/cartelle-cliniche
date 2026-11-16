import { Stack } from 'expo-router';
import { GlassTarget } from '@/ui/glass';

/** Scheda "Pazienti": le sue schermate, sotto la barra di vetro che le sfoca. */
export default function PatientsLayout() {
  return (
    <GlassTarget>
      <Stack />
    </GlassTarget>
  );
}
