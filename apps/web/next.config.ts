import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // I pacchetti del monorepo sono TypeScript sorgente: Next li compila.
  transpilePackages: ['@alby/core', '@alby/shared'],
  // Immagine Docker più piccola: solo i file necessari per avviare il server.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
