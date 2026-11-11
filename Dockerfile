# Immagine per la VPS: un solo container serve API e webapp.
# Il database PostgreSQL gira in un container separato (vedi docker-compose.yml).

# ---------- build: compila la webapp e genera il client Prisma
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run db:generate && npm run build

# ---------- runtime: solo le dipendenze di produzione dell'API
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIST=../web/dist
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @alby/api --include-workspace-root=false --ignore-scripts \
    && npm cache clean --force
COPY packages/shared/src packages/shared/src
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY --from=build /app/apps/api/src/generated apps/api/src/generated
COPY --from=build /app/apps/web/dist apps/web/dist

USER node
WORKDIR /app/apps/api
EXPOSE 3000
# All'avvio applica le migrazioni del database, poi avvia il server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
