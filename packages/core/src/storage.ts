import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
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

/** Data dell'ultima modifica di un file dell'archivio, o `null` se non esiste. */
export async function storedMtime(rel: string): Promise<Date | null> {
  try {
    return (await stat(resolveStored(rel))).mtime;
  } catch {
    return null;
  }
}

/** Elimina un file o un'intera cartella dell'archivio (nessun errore se non esiste). */
export async function removeStored(rel: string): Promise<void> {
  await rm(resolveStored(rel), { recursive: true, force: true });
}

/**
 * Quanti file contiene l'archivio e quanto spazio occupano, più lo spazio libero sul disco.
 * Guarda solo nomi e dimensioni dei file, mai il contenuto.
 */
export async function storageUsage(): Promise<{ files: number; bytes: number; diskFreeBytes: number | null; diskTotalBytes: number | null }> {
  const root = getConfig().STORAGE_DIR;
  let files = 0;
  let bytes = 0;
  const pending = [root];
  while (pending.length) {
    const dir = pending.pop()!;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const sizes = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map((e) =>
          stat(path.join(dir, e.name)).then(
            (s) => s.size,
            () => null,
          ),
        ),
    );
    for (const size of sizes) {
      if (size === null) continue;
      files++;
      bytes += size;
    }
    for (const e of entries) if (e.isDirectory()) pending.push(path.join(dir, e.name));
  }

  // La cartella può non esistere ancora (nessun file caricato): si guarda il disco della prima cartella che esiste.
  let disk: { free: number; total: number } | null = null;
  for (let dir = root; ; dir = path.dirname(dir)) {
    disk = await statfs(dir).then(
      (s) => ({ free: s.bavail * s.bsize, total: s.blocks * s.bsize }),
      () => null,
    );
    if (disk || dir === path.dirname(dir)) break;
  }
  return { files, bytes, diskFreeBytes: disk?.free ?? null, diskTotalBytes: disk?.total ?? null };
}

/** Cartelle dell'archivio: dicom/<paziente>/<studio>/<immagine>.dcm */
export const dicomPaths = {
  patient: (patientId: string) => `dicom/${patientId}`,
  study: (patientId: string, studyId: string) => `dicom/${patientId}/${studyId}`,
  instance: (patientId: string, studyId: string, instanceId: string) => `dicom/${patientId}/${studyId}/${instanceId}.dcm`,
  /** Anteprima già calcolata di un'immagine (si può sempre rigenerare dal file originale). */
  preview: (patientId: string, studyId: string, instanceId: string, size: string) => `dicom/${patientId}/${studyId}/${instanceId}.${size}.png`,
};

/** Copie locali dei fogli illustrativi AIFA (dati pubblici): leaflets/<codice farmaco>.pdf */
export const leafletPath = (aic6: string) => `leaflets/${aic6}.pdf`;
