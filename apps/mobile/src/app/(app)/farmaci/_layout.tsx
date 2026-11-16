import { Stack } from 'expo-router';
import { GlassTarget } from '@/ui/glass';

/** Scheda "Farmaci": le sue schermate, sotto la barra di vetro che le sfoca. */
export default function DrugsLayout() {
  return (
    <GlassTarget>
      <Stack />
    </GlassTarget>
  );
}
