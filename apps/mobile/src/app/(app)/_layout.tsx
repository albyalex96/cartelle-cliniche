import { Tabs } from 'expo-router/js-tabs';
import { ClipboardList, Pill, UserRound, Users } from 'lucide-react-native';
import { useEffect } from 'react';
import { SyncProvider } from '@/lib/sync-context';
import { clearTempDocuments } from '@/lib/temp-documents';
import { GlassProvider } from '@/ui/glass';
import { GlassTabBar, type TabIcons } from '@/ui/tab-bar';

const TABS: TabIcons = {
  '(pazienti)': { icon: Users, label: 'Pazienti' },
  farmaci: { icon: Pill, label: 'Farmaci' },
  prestazioni: { icon: ClipboardList, label: 'Prestazioni' },
  account: { icon: UserRound, label: 'Account' },
};

/** Area dell'app dopo l'accesso: quattro schede con la barra di vetro flottante in basso. */
export default function AppLayout() {
  // PDF temporanei rimasti da una chiusura improvvisa dell'app.
  useEffect(clearTempDocuments, []);
  return (
    <SyncProvider>
      <GlassProvider>
        <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <GlassTabBar {...props} tabs={TABS} />}>
          <Tabs.Screen name="(pazienti)" />
          <Tabs.Screen name="farmaci" />
          <Tabs.Screen name="prestazioni" />
          <Tabs.Screen name="account" />
        </Tabs>
      </GlassProvider>
    </SyncProvider>
  );
}
