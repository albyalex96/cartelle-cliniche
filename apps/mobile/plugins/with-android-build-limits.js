// Limiti della build Android, scritti in android/gradle.properties a ogni `expo prebuild`
// (la cartella android/ è generata: non si modifica a mano).
//
// - Solo arm64-v8a: è l'architettura di tutti i telefoni Android recenti. Le altre tre (armv7, x86, x86_64)
//   quadruplicherebbero la compilazione C++ (SQLCipher, Reanimated, Worklets…) e la memoria usata.
// - Meno lavori in parallelo e un tetto alla memoria di Gradle, per non bloccare il PC durante la build.
const { withGradleProperties } = require('expo/config-plugins');

const LIMITS = {
  reactNativeArchitectures: 'arm64-v8a',
  'org.gradle.workers.max': '2',
  'org.gradle.parallel': 'false',
  'org.gradle.jvmargs': '-Xmx3g -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8',
  'kotlin.daemon.jvmargs': '-Xmx1g',
};

module.exports = function withAndroidBuildLimits(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(LIMITS)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
