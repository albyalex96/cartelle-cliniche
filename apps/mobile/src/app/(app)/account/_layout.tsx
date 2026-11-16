import { Stack } from 'expo-router';
import { GlassTarget } from '@/ui/glass';

/** Scheda "Account": le sue schermate, sotto la barra di vetro che le sfoca. */
export default function AccountLayout() {
  return (
    <GlassTarget>
      <Stack />
    </GlassTarget>
  );
}
