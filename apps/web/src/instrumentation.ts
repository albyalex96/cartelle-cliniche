/**
 * Eseguito una volta all'avvio del server Next.js: fa partire il controllo periodico
 * dell'aggiornamento automatico degli elenchi pubblici (farmaci, prestazioni).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV === 'test') return;
  const { startCatalogUpdateScheduler } = await import('@alby/core');
  startCatalogUpdateScheduler();
}
