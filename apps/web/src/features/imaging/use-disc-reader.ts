'use client';

import { scanDisc, type DiscFile, type DiscScan } from '@alby/dicom';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';

/*
 * Un sito non può accedere da solo ai dischi del computer. Si chiede all'utente di scegliere
 * la cartella (il lettore CD/DVD) e il browser domanda il permesso di leggerla:
 *  - Chrome / Edge: File System Access API (`showDirectoryPicker`), sola lettura;
 *  - Firefox / Safari: <input webkitdirectory>, che chiede conferma prima di dare i file.
 * I file vengono letti solo in questo computer: al server non arriva nulla.
 */

interface DirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirectoryHandle | FileHandle>;
}
interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
type PickerWindow = Window & { showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' }) => Promise<DirectoryHandle> };

export type DiscReaderState =
  | { status: 'idle' }
  | { status: 'listing'; found: number }
  | { status: 'scanning'; done: number; total: number }
  | { status: 'done'; scan: DiscScan; fileCount: number; folder: string }
  | { status: 'error'; message: string };

/** Un `File` del browser con l'interfaccia richiesta da `scanDisc`. */
function toDiscFile(path: string, file: File): DiscFile & { file: File } {
  return {
    path,
    size: file.size,
    file,
    read: async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
  };
}

async function listDirectory(dir: DirectoryHandle, signal: AbortSignal, onFound: (n: number) => void) {
  const out: (DiscFile & { file: File })[] = [];
  const walk = async (handle: DirectoryHandle, prefix: string) => {
    for await (const entry of handle.values()) {
      if (signal.aborted) throw new DOMException('Lettura annullata', 'AbortError');
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') await walk(entry, path);
      else {
        out.push(toDiscFile(path, await entry.getFile()));
        if (out.length % 25 === 0) onFound(out.length);
      }
    }
  };
  await walk(dir, '');
  return out;
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

export function useDiscReader() {
  const [state, setState] = useState<DiscReaderState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [canPickFolder, setCanPickFolder] = useState(false);

  // Si verifica solo nel browser (sul server `window` non esiste).
  useEffect(() => setCanPickFolder(typeof (window as PickerWindow).showDirectoryPicker === 'function'), []);
  useEffect(() => () => controller.current?.abort(), []);

  const analyse = useCallback(async (files: (DiscFile & { file: File })[], folder: string, signal: AbortSignal) => {
    if (!files.length) {
      setState({ status: 'error', message: 'La cartella è vuota: controlla che il disco sia inserito e di aver scelto l’unità giusta.' });
      return;
    }
    setState({ status: 'scanning', done: 0, total: files.length });
    const scan = await scanDisc(files, { signal, onProgress: (done, total) => setState({ status: 'scanning', done, total }) });
    setState({ status: 'done', scan, fileCount: files.length, folder });
  }, []);

  const run = useCallback(
    async (job: (signal: AbortSignal) => Promise<void>) => {
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      try {
        await job(c.signal);
      } catch (err) {
        if (isAbort(err)) setState({ status: 'idle' });
        else if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
          setState({ status: 'error', message: 'Permesso negato: per leggere il disco devi consentire l’accesso alla cartella.' });
        } else {
          console.error('[disco] lettura non riuscita', err);
          setState({ status: 'error', message: 'Non sono riuscito a leggere il disco. Riprova, oppure copia il contenuto del CD in una cartella e scegli quella.' });
        }
      }
    },
    [],
  );

  /** Chiede all'utente di scegliere il lettore (o una cartella) e lo analizza. */
  const pick = useCallback(() => {
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) {
      input.current?.click();
      return;
    }
    void run(async (signal) => {
      // `id`: il browser ricorda l'ultima posizione scelta (di solito il lettore).
      const dir = await picker({ id: 'cd-referti', mode: 'read' });
      setState({ status: 'listing', found: 0 });
      const files = await listDirectory(dir, signal, (found) => setState({ status: 'listing', found }));
      await analyse(files, dir.name, signal);
    });
  }, [analyse, run]);

  /** Ripiego per i browser senza `showDirectoryPicker`: i file arrivano da <input webkitdirectory>. */
  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = [...(e.target.files ?? [])];
      e.target.value = '';
      if (!list.length) return;
      void run(async (signal) => {
        // webkitRelativePath = "NOMECARTELLA/sotto/file": si toglie la cartella scelta.
        const folder = list[0]!.webkitRelativePath.split('/')[0] ?? '';
        const files = list.map((f) => toDiscFile(f.webkitRelativePath.split('/').slice(1).join('/') || f.name, f));
        await analyse(files, folder, signal);
      });
    },
    [analyse, run],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    setState({ status: 'idle' });
  }, []);

  /** Da rendere (nascosto) nella pagina: serve solo ai browser senza `showDirectoryPicker`. */
  const inputProps = {
    ref: input,
    type: 'file',
    multiple: true,
    className: 'sr-only',
    tabIndex: -1,
    onChange: onInputChange,
    // Attributi non standard per scegliere una cartella intera.
    ...({ webkitdirectory: '', directory: '' } as Record<string, string>),
  } satisfies InputHTMLAttributes<HTMLInputElement> & { ref: typeof input };

  return { state, pick, cancel, reset, canPickFolder, inputProps };
}
