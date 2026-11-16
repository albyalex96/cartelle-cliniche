// Firma della build di release con la chiave dell'app (android/ è generata: la configurazione si aggiunge qui).
//
// La chiave e le password NON stanno nel repository: si leggono dalle proprietà Gradle dell'utente
// (~/.gradle/gradle.properties) o dalle variabili d'ambiente ORG_GRADLE_PROJECT_<nome>:
//   ALBY_RELEASE_STORE_FILE      percorso del file .jks
//   ALBY_RELEASE_STORE_PASSWORD
//   ALBY_RELEASE_KEY_ALIAS
//   ALBY_RELEASE_KEY_PASSWORD
// Senza queste proprietà la build di release si ferma: un APK firmato con la chiave di debug non potrebbe
// più essere aggiornato con quello firmato bene.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (project.hasProperty('ALBY_RELEASE_STORE_FILE')) {
                storeFile file(ALBY_RELEASE_STORE_FILE)
                storePassword ALBY_RELEASE_STORE_PASSWORD
                keyAlias ALBY_RELEASE_KEY_ALIAS
                keyPassword ALBY_RELEASE_KEY_PASSWORD
            }
        }`;

const CHECK = `
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.name.toLowerCase().contains('release') } && !project.hasProperty('ALBY_RELEASE_STORE_FILE')) {
        throw new GradleException('Chiave di firma mancante: imposta ALBY_RELEASE_STORE_FILE e le password (vedi apps/mobile/README.md).')
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('ALBY_RELEASE_STORE_FILE')) {
      gradle = gradle.replace(/signingConfigs \{\r?\n/, (m) => `${m}${SIGNING.slice(1)}\n`);
      gradle = gradle.replace(
        /(release \{\r?\n(?:\s*\/\/.*\r?\n)*\s*)signingConfig signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release',
      );
      gradle += CHECK;
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
