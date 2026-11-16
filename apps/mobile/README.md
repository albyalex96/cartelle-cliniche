# App Android — Cartelle Cliniche

App Expo (SDK 58, React Native 0.88, Expo Router) che usa l'API `/api/v1` del server con un token Bearer.
I tipi delle risposte vengono da `@alby/shared`, gli stessi della webapp.

## Sicurezza

- Token e indirizzo del server nel Keystore di Android (`expo-secure-store`), esclusi dal backup;
  `android.allowBackup` è disattivato per tutta l'app.
- L'app si sblocca con impronta, volto o PIN del telefono (`expo-local-authentication`) all'avvio e dopo
  un minuto in sottofondo. Senza un blocco schermo sul telefono non si può accedere.
- Copia locale (pazienti, referti, terapie e anche i documenti PDF/JPEG) in un database SQLite cifrato con
  SQLCipher; la chiave, casuale, sta nel Keystore. Se SQLCipher manca l'app non apre il database invece di
  salvare in chiaro. Uscendo dall'account (o se il server revoca il token) database e chiave vengono cancellati;
  i pazienti non più accessibili spariscono alla sincronizzazione successiva.
- Solo HTTPS. HTTP è ammesso solo nella build di sviluppo (`__DEV__`), per il server sul PC in rete locale.

## Sviluppo

```bash
npm install                      # dalla cartella principale del monorepo
npm run start -w @alby/mobile    # server di sviluppo Metro
npm run android -w @alby/mobile  # build di sviluppo installata sul telefono collegato via USB o sull'emulatore
```

### Build su Windows

Il progetto sta in un percorso lungo e la compilazione C++ supera i 260 caratteri: il `ninja` della CMake 3.22.1
(predefinita per Android) non gestisce i percorsi lunghi. Serve la CMake 4.x dell'SDK (ninja ≥ 1.12, con
`LongPathsEnabled` attivo in Windows):

1. in `android/local.properties` (file locale, rigenerato da `expo prebuild --clean`): `cmake.dir=<SDK>\\cmake\\4.1.2`;
2. nel terminale della build: `$env:CMAKE_POLICY_VERSION_MINIMUM = '3.5'` (CMake 4 rifiuta altrimenti i
   `CMakeLists.txt` che dichiarano versioni vecchie, come quello di expo-sqlite).

`subst` non funziona: Node usa il percorso reale e Gradle quello dell'unità virtuale.

**Expo Go non basta**: SQLCipher richiede una build di sviluppo (`npm run android -w @alby/mobile`).

Per provare con il server sul PC: `npm run dev` nella cartella principale, poi nell'app come indirizzo
`http://<IP del PC>:3000`.

Le cartelle `android/` e `ios/` vengono generate (`expo prebuild`) e non si modificano a mano: la configurazione sta in
`app.json` e nei config plugin.

| Comando | Cosa fa |
|---|---|
| `npm run typecheck -w @alby/mobile` | Controllo dei tipi |
| `npm run lint -w @alby/mobile` | Lint |
| `npm run doctor -w @alby/mobile` | Controlla versioni e configurazione di Expo |
