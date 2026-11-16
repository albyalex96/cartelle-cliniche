import { Directory, File, Paths } from 'expo-file-system';

/**
 * Il visualizzatore PDF di Android legge solo file: il PDF, decifrato dal database, viene scritto in una cartella
 * privata della cache dell'app (inaccessibile alle altre app) e cancellato appena si chiude la schermata.
 * All'avvio si svuota comunque la cartella, nel caso l'app sia stata chiusa di colpo con un documento aperto.
 */
const folder = () => new Directory(Paths.cache, 'documenti');

export function writeTempDocument(data: Uint8Array, extension: string): File {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);
  file.create({ overwrite: true });
  file.write(data);
  return file;
}

export function deleteTempDocument(file: File | null) {
  try {
    if (file?.exists) file.delete();
  } catch {
    // Verrà comunque tolto dalla pulizia all'avvio.
  }
}

export function clearTempDocuments() {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Niente da pulire.
  }
}
