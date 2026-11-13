# Cartelle Cliniche

Webapp per archiviare e consultare i dati medici della famiglia: pazienti, esami di laboratorio,
terapie e immagini diagnostiche. In futuro avrà anche un'app mobile utilizzabile offline.

## Struttura

```
apps/web         Next.js 16 (App Router): pagine come Server Component, Server Actions,
                 API REST /api/v1 per l'app mobile. UI con shadcn/ui e Tailwind CSS 4.
packages/core    Logica applicativa e di sicurezza: database (Prisma 7 + PostgreSQL), sessioni,
                 permessi, registro accessi. Usata sia dalle pagine sia dall'API mobile.
packages/shared  Schemi di validazione (Zod), tipi e costanti condivisi con il browser.
```

## Avvio in sviluppo

Serve solo **Node.js 22 o superiore**. Il database PostgreSQL di sviluppo arriva come pacchetto npm
(`embedded-postgres`), quindi non va installato nulla nel sistema e non serve Docker.

```bash
npm install
cp .env.example .env        # poi metti una password casuale in DATABASE_URL
npm run dev
```

`npm run dev` avvia PostgreSQL (porta 54329, dati in `.data/`), applica le migrazioni e poi lancia
Next.js su **http://localhost:3000**. Al primo accesso l'app chiede di creare l'account amministratore.

Il database **resta acceso** anche quando chiudi `npm run dev`, così il server successivo lo ritrova subito.
Per spegnerlo usa `npm run db:stop`.

### Comandi utili

| Comando | Cosa fa |
|---|---|
| `npm run db:start` / `npm run db:stop` | Avvia o ferma il database di sviluppo |
| `npm run db:migrate` | Dopo una modifica a `packages/core/prisma/schema.prisma`: crea e applica la migrazione |
| `npm test` | Test della logica di sicurezza, su un database **separato** (`cartelle_test`) |
| `npm run typecheck` | Controllo dei tipi su tutto il progetto |
| `npm run build` | Build di produzione |
| `npm run farmaci:importa` | Scarica dall'AIFA l'elenco aggiornato dei farmaci (si può fare anche dall'app, come amministratore: Elenco farmaci) |
| `npm run prestazioni:importa` | Scarica dal portale SIST della Regione Puglia il catalogo delle prestazioni specialistiche con le tariffe (si può fare anche dall'app, come amministratore: Prestazioni) |

Per aggiungere componenti shadcn: `cd apps/web && npx shadcn@latest add <componente>`.

## Ruoli e permessi

- **Amministratore**: gestisce tutto, compresi utenti e registro accessi.
- **Paziente** / **Medico**: vedono solo i pazienti a cui l'amministratore ha dato accesso, in sola
  lettura oppure in lettura e modifica.

Gli utenti creati dall'amministratore devono cambiare la password al primo accesso.

## Sicurezza

- I controlli di accesso stanno in `packages/core` e valgono per pagine, Server Action e API.
  Una Server Action è un endpoint pubblico, quindi l'interfaccia non viene mai considerata sufficiente.
- Le password sono salvate con Argon2id.
- **Sessioni della webapp**: cookie `HttpOnly` e `SameSite=Lax`. Nel database finisce solo l'hash del token.
  Una sessione scade dopo 30 giorni di inattività e comunque dopo 90 giorni dal login.
- **API mobile**: solo token `Authorization: Bearer`, il cookie viene ignorato.
- I tentativi di accesso sono limitati per impedire di indovinare le password per tentativi.
- La Content Security Policy usa un nonce generato per ogni richiesta. Ci sono anche header di sicurezza
  contro l'inserimento dell'app in altri siti (clickjacking) e l'interpretazione errata del tipo dei file (MIME sniffing).
- Ogni accesso e ogni modifica ai dati vengono registrati, ma il registro non contiene dati sanitari.

## Produzione (VPS con Docker)

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" > .env
docker compose up -d --build
```

Il servizio `migrate` applica le migrazioni prima di avviare l'app. L'app ascolta su `127.0.0.1:3000`
e va pubblicata tramite un reverse proxy con HTTPS (ad esempio Caddy, nginx o Traefik).
Ricordati di fare un backup regolare dei volumi `db-data` (database, PDF dei referti) e `storage` (immagini DICOM dei CD).

Dopo il primo avvio, dalla pagina Elenco farmaci (come amministratore) scarica l'elenco AIFA (serve che il server possa
raggiungere `drive.aifa.gov.it`; l'operazione dura circa un minuto: se il reverse proxy ha un timeout più breve,
alzalo per quella richiesta oppure riprova, l'elenco precedente resta valido finché il nuovo non è completo).
Dati dei farmaci: AIFA, licenza CC BY 4.0.

Allo stesso modo, dalla pagina Prestazioni si scarica il catalogo delle prestazioni specialistiche ambulatoriali della
Regione Puglia (serve che il server possa raggiungere `sist.sanita.puglia.it`). I file sono il "Catalogo Unico Regionale
delle Prestazioni Specialistiche" e il "Nomenclatore Tariffario Completo" pubblicati dalla Regione: le tariffe valgono
alla data del file del Nomenclatore, indicata nella pagina.

## PDF scansionati (OCR)

Quando un PDF non contiene testo selezionabile, l'app può riconoscerlo dall'immagine con Tesseract.
**Tutto avviene sul server**: nessun servizio esterno e nessun download, perché la lingua italiana è inclusa nell'immagine
Docker o in `node_modules`. Il registro accessi conserva solo i numeri (pagine, durata, affidabilità media), mai il testo.

- **Accensione**: `OCR_ENABLED=true` nel `.env`. Con `false` (predefinito) l'app si comporta come prima e chiede di
  compilare a mano. Per tornare indietro basta rimettere `false` e riavviare.
- **Motori**: `OCR_ENGINE=native` usa il programma `tesseract`, installato nell'immagine Docker, più veloce e leggero.
  `wasm` usa tesseract.js, che non richiede installazioni ed è adatto allo sviluppo su Windows.
- **Risorse**: un OCR alla volta (gli altri aspettano in coda), una pagina alla volta, massimo `OCR_MAX_PAGES` pagine.
  Misurato con `npm run ocr:benchmark -w @alby/pdf` su scansioni finte: motore `wasm` su PC desktop ≈ 3,7 s per pagina A4
  piena, 1 core, +260 MB di memoria al picco. Su una vCPU di VPS i tempi crescono.
- **Zone scelte dall'utente**: per una scansione non parte nessuna lettura automatica. Accanto al form compaiono le
  pagine del documento, e chi compila trascina un riquadro sulla zona da leggere. Le righe dei valori vengono aggiunte
  alla tabella; il testo invece va nel campo del form su cui si è cliccato (data, medico, testo del referto…). La lettura
  di tutta la pagina resta disponibile con un bottone facoltativo. Così intestazioni, timbri e firme non vengono letti
  per errore.
- **Revisione obbligatoria**: niente viene salvato da solo. I valori letti con poca sicurezza vengono evidenziati, e se
  restano invariati il salvataggio chiede conferma. Il referto salvato viene segnato come "letto da una scansione"
  (`parserId = generico-ocr`).
- Il codice sta in `packages/pdf/src/ocr/`, `packages/core/src/services/ocr.ts` e, per l'interfaccia, in
  `apps/web/src/features/reports/scan-*.ts(x)`.

## Roadmap

1. ✅ Login, ruoli, pannello di amministrazione, anagrafica dei pazienti
2. ✅ Esami di laboratorio: referti, storico dei valori e grafici dell'andamento
3. ✅ Importazione dei referti PDF, con estrazione del testo in locale
4. ✅ Terapie: elenco farmaci AIFA, ricerca per nome o principio attivo, posologia
5. Immagini DICOM: ✅ lettura del CD/DVD e archivio; visualizzatore da fare
6. App mobile (Expo / React Native) con dati disponibili offline e sincronizzazione
