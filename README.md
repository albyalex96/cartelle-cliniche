# Cartelle Cliniche

Webapp per archiviare e consultare i dati medici della famiglia: pazienti, esami di laboratorio,
terapie e immagini diagnostiche. Pensata per essere estesa in futuro con un'app mobile.

## Struttura

```
apps/api         Server API: Fastify 5, Prisma 7, PostgreSQL
apps/web         Webapp: React 19, Vite, Tailwind CSS 4, shadcn/ui, TanStack Query
packages/shared  Schemi di validazione (Zod) e tipi condivisi da API, webapp e futura app mobile
```

## Avvio in sviluppo

Serve solo **Node.js 22 o superiore**. Il database PostgreSQL di sviluppo è un pacchetto npm
(`embedded-postgres`): non va installato nulla nel sistema e non serve Docker.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # poi cambia la password in DATABASE_URL
npm run dev
```

`npm run dev` avvia insieme:

- **db**: PostgreSQL su `127.0.0.1:54329`. I dati restano in `apps/api/.data/`. Le migrazioni vengono applicate in automatico.
- **api**: server su `http://127.0.0.1:3000`, che si riavvia da solo quando modifichi il codice.
- **web**: webapp su **http://localhost:5173**.

Al primo accesso la webapp chiede di creare l'account amministratore.

### Comandi utili

| Comando | Cosa fa |
|---|---|
| `npm run db:migrate` | Dopo una modifica a `apps/api/prisma/schema.prisma`: crea e applica la migrazione (il database deve essere avviato) |
| `npm run typecheck` | Controllo dei tipi su tutto il progetto |
| `npm run build` | Build di produzione della webapp |

Per aggiungere componenti shadcn: `cd apps/web && npx shadcn@latest add <componente>`.

## Ruoli e permessi

- **Amministratore**: gestisce tutto, compresi utenti e registro accessi.
- **Paziente** / **Medico**: vedono solo i pazienti a cui l'amministratore ha dato accesso, in sola
  lettura oppure in lettura e modifica.

Gli utenti creati dall'amministratore devono cambiare la password al primo accesso.

## Sicurezza

- Le password sono salvate con Argon2id.
- Le sessioni usano un cookie `HttpOnly` e `SameSite=Lax`. Nel database finisce solo l'hash del token.
- Le app mobile useranno lo stesso token con l'header `Authorization: Bearer` (login con `"client": "mobile"`).
- I tentativi di accesso sono limitati per impedire di indovinare le password per tentativi.
- Ogni accesso e ogni modifica ai dati vengono registrati nel registro accessi.
- Gli header di sicurezza HTTP (CSP, HSTS…) sono gestiti da Helmet.

## Produzione (VPS con Docker)

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" > .env
docker compose up -d --build
```

L'app ascolta su `127.0.0.1:3000` e va pubblicata tramite un reverse proxy con HTTPS
(ad esempio Caddy, nginx o Traefik). Le migrazioni del database vengono applicate a ogni avvio del container.
Ricordati di fare un backup regolare del volume `db-data`.

## Roadmap

1. ✅ Login, ruoli, pannello di amministrazione, anagrafica dei pazienti
2. Esami di laboratorio: referti, storico dei valori e grafici
3. Importazione dei referti PDF, con estrazione del testo in locale
4. Terapie: archivio farmaci AIFA, ricerca per nome o principio attivo, posologia
5. Visualizzatore di immagini DICOM (CD di ecografie, TAC e risonanze)
6. App mobile (Expo / React Native)
