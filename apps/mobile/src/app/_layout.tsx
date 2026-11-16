import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

/** Tiene lo splash screen finché non si sa se c'è un accesso salvato. */
function SplashScreenController() {
  const { status } = useSession();
  if (status !== 'loading') SplashScreen.hide();
  return null;
}

/**
 * Ogni gruppo di schermate è raggiungibile solo nello stato giusto: quando lo stato cambia
 * (login, blocco, uscita) Expo Router porta da solo alla schermata disponibile.
 */
function RootNavigator() {
  const { status, user } = useSession();
  const ready = status === 'ready';
  const mustChange = ready && user?.mustChangePassword === true;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={ready && !mustChange}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={mustChange}>
        <Stack.Screen name="cambia-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="sblocca" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="accedi" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <SplashScreenController />
      <StatusBar style="auto" />
      <RootNavigator />
    </SessionProvider>
  );
}
