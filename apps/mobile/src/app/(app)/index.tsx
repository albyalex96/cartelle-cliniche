import { Stack } from 'expo-router';
import { useSession } from '@/lib/session';
import { Button, Paragraph, Screen, Title } from '@/ui/controls';

/** Schermata iniziale provvisoria: l'elenco dei pazienti arriva con la sincronizzazione (Fase 2–3). */
export default function HomeScreen() {
  const { user, server, signOut } = useSession();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Cartelle Cliniche' }} />
      <Title>Ciao{user ? `, ${user.displayName}` : ''}</Title>
      <Paragraph muted>Collegato a {server}</Paragraph>
      <Paragraph>Qui compariranno i pazienti, disponibili anche senza connessione.</Paragraph>
      <Button title="Esci dall’account" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
