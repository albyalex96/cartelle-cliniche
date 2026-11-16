import { Stack } from 'expo-router';
import { SyncProvider } from '@/lib/sync-context';

export default function AppLayout() {
  return (
    <SyncProvider>
      <Stack />
    </SyncProvider>
  );
}
