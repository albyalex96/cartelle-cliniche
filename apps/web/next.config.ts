import path from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // I pacchetti del monorepo sono TypeScript sorgente: Next li compila.
  transpilePackages: ['@alby/core', '@alby/shared', '@alby/pdf', '@alby/dicom'],
  // pdfjs viene caricato da Node così com'è (non va impacchettato nel bundle del server).
  serverExternalPackages: ['pdfjs-dist'],
  // Immagine Docker più piccola: solo i file necessari per avviare il server.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  experimental: {
    // Caricamento di PDF (max 20 MB) e immagini DICOM (a gruppi di ~16 MB, una singola immagine fino a 60 MB).
    serverActions: { bodySizeLimit: '64mb' },
  },
  async headers() {
    return [
      {
        // Nessuna pagina può essere incorporata in altri siti…
        source: '/((?!api/files/|api/farmaci/).*)',
        headers: [...securityHeaders, { key: 'X-Frame-Options', value: 'DENY' }],
      },
      // …tranne i PDF (referti e fogli illustrativi), mostrati dentro le pagine dell'app (solo dallo stesso sito).
      ...['/api/files/:path*', '/api/farmaci/:path*'].map((source) => ({
        source,
        headers: [
          ...securityHeaders,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      })),
    ];
  },
};

export default nextConfig;
