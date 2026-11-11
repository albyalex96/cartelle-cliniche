import { AppError } from '../errors';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Limite di tentativi in memoria (sufficiente per un singolo server).
 * Lancia un errore 429 se la chiave ha superato `max` tentativi nella finestra.
 */
export function consumeRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > max) {
    const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / 60_000));
    throw new AppError(429, `Troppi tentativi: riprova tra ${minutes} minut${minutes === 1 ? 'o' : 'i'}`, 'RATE_LIMIT');
  }
}

/** Solo per i test. */
export function resetRateLimits() {
  buckets.clear();
}
