# Immagine per la VPS (Next.js "standalone": solo i file necessari al server).
# Il database PostgreSQL gira in un container separato (vedi docker-compose.yml).

# ---------- build: dipendenze complete, client Prisma, build di Next.js
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- migrate: applica le migrazioni del database (usato dal servizio "migrate")
FROM build AS migrate
CMD ["npm", "run", "db:deploy", "-w", "@alby/core"]

# ---------- runtime: immagine finale minimale
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# Cartella delle immagini DICOM (montata come volume): deve appartenere all'utente che esegue l'app.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
