import type { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import PdfRendererView from 'react-native-pdf-renderer';
import { deleteTempDocument, writeTempDocument } from '@/lib/temp-documents';
import { Message } from './blocks';

/**
 * PDF nel visualizzatore nativo di Android: file temporaneo nella cache privata dell'app, cancellato
 * alla chiusura della schermata (vedi `temp-documents`).
 */
export function PdfViewer({ data }: { data: Uint8Array }) {
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let written: File | null = null;
    try {
      written = writeTempDocument(data, 'pdf');
      setFile(written);
    } catch {
      setFailed(true);
    }
    return () => deleteTempDocument(written);
  }, [data]);
  if (failed) return <Message>Impossibile aprire il PDF.</Message>;
  if (!file) return null;
  return <PdfRendererView style={styles.flex} source={file.uri} distanceBetweenPages={12} maxZoom={6} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
