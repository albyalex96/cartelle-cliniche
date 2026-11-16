import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SyncProvider } from '@/lib/sync-context';
import { clearTempDocuments } from '@/lib/temp-documents';

export default function AppLayout() {
  // PDF temporanei rimasti da una chiusura improvvisa dell'app.
  useEffect(clearTempDocuments, []);
  return (
    <SyncProvider>
      <Stack />
    </SyncProvider>
  );
}
