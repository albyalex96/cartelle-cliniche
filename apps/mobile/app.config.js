// Configurazione Expo: app.json più la versione, letta dall'unica fonte `version.json` (cartella principale).
const { version } = require('../../version.json');

/** Numero di build Android crescente ricavato dalla versione: 1.2.3 → 10203. */
function versionCode(v) {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map(Number);
  return major * 10000 + minor * 100 + patch;
}

module.exports = ({ config }) => ({
  ...config,
  version,
  android: { ...config.android, versionCode: versionCode(version) },
});
