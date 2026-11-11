import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { ApiErrorBody } from '@alby/shared';
import Fastify, { type FastifyError } from 'fastify';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { registerAuth } from './auth/guard.js';
import { config } from './config.js';
import { HttpError } from './http.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { patientRoutes } from './routes/patients.js';
import { setupRoutes } from './routes/setup.js';
import { userRoutes } from './routes/users.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    let body: ApiErrorBody;

    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message;
      }
      body = { statusCode: 400, code: 'VALIDATION', message: 'Alcuni dati non sono validi', fields };
    } else if (err instanceof HttpError) {
      body = { statusCode: err.statusCode, code: err.code, message: err.message };
    } else if ((err as { code?: unknown }).code === 'P2002') {
      body = { statusCode: 409, code: 'CONFLICT', message: 'Esiste già un elemento con questi dati (es. email o codice fiscale)' };
    } else if ((err as { code?: unknown }).code === 'P2025') {
      body = { statusCode: 404, code: 'NOT_FOUND', message: 'Elemento non trovato' };
    } else if (err.statusCode === 429) {
      body = { statusCode: 429, code: 'RATE_LIMIT', message: 'Troppi tentativi: riprova tra qualche minuto' };
    } else if (err.statusCode && err.statusCode < 500) {
      body = { statusCode: err.statusCode, code: err.code ?? 'BAD_REQUEST', message: 'Richiesta non valida' };
    } else {
      req.log.error({ err }, 'Errore non gestito');
      body = { statusCode: 500, code: 'INTERNAL', message: 'Si è verificato un errore imprevisto' };
    }

    return reply.code(body.statusCode).send(body);
  });

  registerAuth(app);

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(setupRoutes, { prefix: '/api/setup' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(patientRoutes, { prefix: '/api/patients' });
  await app.register(auditRoutes, { prefix: '/api/audit' });

  // In produzione lo stesso server distribuisce anche la webapp.
  const webDist = config.WEB_DIST;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
  }

  app.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api/') && webDist && existsSync(webDist) && req.method === 'GET') {
      return reply.sendFile('index.html');
    }
    const body: ApiErrorBody = { statusCode: 404, code: 'NOT_FOUND', message: 'Risorsa non trovata' };
    return reply.code(404).send(body);
  });

  return app;
}
