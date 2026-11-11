import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from './config';

/**
 * Archivio dei file grandi (immagini DICOM) in una cartella del server (STORAGE_DIR):
 * nel database restano solo i dati descrittivi e il percorso relativo.
 * In Docker la cartella è un volume, da includere nei backup insieme al database.
 */

/** Percorso assoluto di un file dell'archivio. Rifiuta percorsi che escono dalla cartella. */
function resolveStored(rel: string): string {
  const root = getConfig().STORAGE_DIR;
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Percorso fuori dall'archivio: ${rel}`);
  return full;
}

/** Scrive un file in modo atomico: prima un file temporaneo, poi lo rinomina (mai file a metà). */
export async function writeStored(rel: string, bytes: Uint8Array): Promise<void> {
  const full = resolveStored(rel);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, bytes, { flag: 'wx' });
    await rename(tmp, full);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export function readStored(rel: string): Promise<Buffer> {
  return readFile(resolveStored(rel));
}

/** Elimina un file o un'intera cartella dell'archivio (nessun errore se non esiste). */
export async function removeStored(rel: string): Promise<void> {
  await rm(resolveStored(rel), { recursive: true, force: true });
}

/** Cartelle dell'archivio: dicom/<paziente>/<studio>/<immagine>.dcm */
export const dicomPaths = {
  patient: (patientId: string) => `dicom/${patientId}`,
  study: (patientId: string, studyId: string) => `dicom/${patientId}/${studyId}`,
  instance: (patientId: string, studyId: string, instanceId: string) => `dicom/${patientId}/${studyId}/${instanceId}.dcm`,
};
