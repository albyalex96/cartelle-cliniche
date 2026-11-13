# CLAUDE.md — regole del progetto Cartelle Cliniche

Queste regole sono state stabilite con il proprietario del progetto e vanno rispettate sempre.

## Git

- I commit possono indicare Claude come co-autore (`Co-Authored-By: ...`).
- **Regola vincolante**: ogni modifica, anche minima, va in un **commit separato** con il messaggio nel formato
  `type(scope): description` (es. `fix(ocr): margine attorno alla zona ritagliata`,
  `feat(referti): bottone + per inserire un referto`). Tipi: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`,
  `style`, `perf`, `build`. Niente commit che mescolano modifiche diverse.
- **Mai** inserire link alla sessione o alla chat (es. `Claude-Session: https://claude.ai/...`) in commit,
  descrizioni di pull request, commenti o file del repository: chiunque abbia accesso al repository
  potrebbe usarli per leggere la conversazione.

## Interfaccia (UI)

- Preferire i **Server Component**: dati, controlli dei permessi e rendering avvengono sul server.
- Usare i Client Component (`'use client'`) solo dove serve davvero interattività nel browser
  (form, menu, dialog, grafici, visualizzatore DICOM…), e **isolarli** il più possibile:
  componenti piccoli e "foglia", che ricevono dati già pronti dal server tramite props,
  invece di rendere client un'intera pagina o un intero layout.
- **Riusare i componenti esistenti**: limitare il più possibile la creazione di nuovi componenti; prima
  cercare se ne esiste già uno (o uno adattabile con una prop) e usare quello. È permesso riscriverne uno
  esistente se ne esce una versione migliore: meno latenza, Server Component al posto di un Client
  Component, meno JavaScript nel browser, ecc.

## Architettura (riferimento)

- `packages/core`: unico posto per accesso al database, permessi e registro accessi. Ogni servizio
  riceve un `RequestContext` e verifica da sé l'utente (`requireUser` / `requireAdmin` /
  `requirePatientPermission`) e scrive nel registro (`writeAudit`, solo metadati, mai dati sanitari).
- `apps/web`: le pagine chiamano `@alby/core` tramite `getRequestContext()` / `requirePageUser()`
  (`src/server/context.ts`); le mutazioni passano da Server Action in `src/server/actions/` che
  restituiscono un `ActionResult`; l'API per l'app mobile sta in `src/app/api/v1/` (solo token Bearer).
- `packages/shared`: solo codice sicuro anche nel browser (schemi Zod, tipi, costanti).
- Un modulo `'use client'` non deve esportare costanti usate da Server Component: metterle in un file neutro.
- App mobile futura: funzionamento offline con copia locale cifrata e sincronizzazione incrementale
  tramite `/api/v1` (l'elenco dei pazienti accessibili serve anche a rimuovere quelli revocati).
- I test (`npm test`) usano sempre il database `<nome>_test`, mai quello con i dati reali.
- **Il database e l'archivio di sviluppo (`.data/`) contengono dati veri: non leggerne il contenuto senza
  l'autorizzazione esplicita del proprietario, da chiedere ogni volta** (niente query sui dati, niente
  apertura di PDF, immagini o CD del proprietario, niente dati sanitari nei log mostrati). Le migrazioni si
  scrivono dallo schema (`schema.prisma`) e si applicano senza guardare i dati.
- I test (`npm test`) si possono eseguire senza chiedere: usano solo dati inventati nel database `_test`.
