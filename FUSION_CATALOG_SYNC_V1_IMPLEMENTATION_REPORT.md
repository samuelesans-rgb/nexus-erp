# FUSION Catalog Sync V1 — Implementation Report

## Result

READY FOR CONTROLLED DEPLOY. Implementazione, migration e verifiche DB sono complete sul database dedicato `nexus_erp_test`. Nessuna modifica o connessione è stata effettuata su produzione o sul POS live.

## Architettura

Il flusso è unidirezionale: FUSION XML1745 → `FusionCatalogReader` locale → snapshot atomico → HTTPS autenticato → Catalog/Item Nexus. Il reader catalogo è un modulo distinto dal trasporto `FusionXml1745PrinterAdapter` usato dagli ORDER. Il cloud non apre connessioni verso FUSION; la sincronizzazione manuale incrementa un comando persistente restituito al connector nel successivo heartbeat.

## Evidenze protocollo

Le fonti offline esaminate sono `XML1745_FINAL_SPEC.md`, `EVIDENCE_MATRIX.md`, `FINAL_REPORT.md`, `FINAL_LIVE_TEST.md`, `NEXUS_FUSION_XML1745_ADAPTER_DESIGN.md` e `DATA_REQ_LIVE_RECONCILIATION.md` in `/home/ubuntu/pt15-analysis`.

- Richiesta provata: `<CE><DATA_REQ><PLU>N</PLU></DATA_REQ></CE>`.
- `N` è upper bound inclusivo (`PLU.id <= N`), non un ID puntuale; non esiste modified-since.
- Framing: terminatore `</CE>`, senza length prefix, CR/LF o NUL; buffer osservato circa 4096 byte; timeout osservato circa 5 secondi.
- Campi provati in `DATA_SEND`: PLU, DESC e PRICE. PRICE è espresso in centesimi. Il reparto non viene importato perché non è restituito dal percorso provato.
- Il client invia `<CE><ACK></ACK></CE>` dopo ogni `DATA_SEND` e dopo `DB_END`, sulla stessa socket.
- PLU mancanti producono semplicemente gap; un cursore vuoto termina con `DB_END`.
- Limite massimo PLU/query non provato: `FUSION_CATALOG_MAX_PLU` è quindi obbligatorio e validato fail-closed.
- Keep-alive generale e frame concatenati non sono assunti come requisito; il reader supporta comunque frammentazione e accumulo delimitato.

## Modello e migration

La migration `20260901170000_fusion_catalog_sync_v1` aggiunge:

- `FusionCatalogMapping`: mapping company/location scoped e univoco tra PLU e Item, fingerprint, ownership sincronizzata, review e missing state;
- `FusionCatalogSyncState`: comando manuale versionato, stato READY/SYNCING/STALE/ERROR, timestamp e contatori UI;
- enum `FusionCatalogSyncStatus`.

La migration è soltanto reviewabile: non è stata applicata. I nuovi Item usano `FUSION_<PLU>`, `PRODUCT`, UDM `PZ`, IVA nulla e `needsReview=true`. Se `PZ` manca o il codice collide, l’import fallisce chiuso. Prezzi sono ricevuti come integer cents e convertiti in stringa decimale per Prisma; documenti e prezzi storici non vengono toccati.

Il claim ORDER risolve il PLU dal mapping persistente della stessa company/location. Se non esiste ancora, mantiene il fallback al `productMappings` JSON V1 del connector, consentendo una migrazione graduale senza interrompere il flusso collaudato.

## Endpoint e sicurezza

`POST /api/kitchen-connector/v1/catalog-sync` usa la credential device esistente. Company, location e connector derivano esclusivamente dalla credential server-side. Il body è limitato a 256 KiB, validato campo per campo, limitato a 500 record cambiati e soggetto al rate limiter connector. Non esiste mass assignment: vengono aggiornati soltanto `Item.name`, `Item.salePrice` e i campi del mapping FUSION. L’operazione usa transazione Serializable, advisory lock per sede, chiave idempotente e audit log.

## Ownership

FUSION controlla PLU, nome base sincronizzato e prezzo base. Nexus controlla IVA, immagini, descrizione commerciale estesa, menu placement/presentation, kitchen station/routing, disponibilità operativa e metadati gestionali. La UI espone esplicitamente questa regola. Un successivo sync ripristina i campi FUSION-owned senza toccare quelli Nexus-owned.

## Algoritmo, snapshot e scheduling

Il connector legge una riconciliazione completa, normalizza gli spazi del nome e calcola SHA-256 deterministico su `[plu, normalizedName, priceCents]`. Invia a Nexus soltanto nuovi o modificati e la lista dei PLU diventati mancanti. Nessuna cancellazione automatica viene eseguita.

Lo snapshot V1 è JSON persistente in `~/.local/state/nexus-kitchen/catalog/fusion.json`, con PLU, campi canonici, fingerprint, `lastSeenAt`, `lastChangedAt` e sync state. La scrittura usa file temporaneo esclusivo, fsync, rename atomico e fsync directory; uno sync interrotto conserva l’ultimo snapshot valido.

Configurazione:

- `CATALOG_SYNC_ENABLED=true` (default);
- `CATALOG_SYNC_INTERVAL_MS=30000`, minimo 10000;
- `CATALOG_SYNC_FULL_INTERVAL_MS=900000`, minimo 60000;
- `CATALOG_SYNC_MAX_BACKOFF_MS=300000`;
- `FUSION_CATALOG_MAX_PLU` obbligatorio quando abilitato;
- `FUSION_CATALOG_SNAPSHOT` opzionale.

Il lock in-process impedisce sync concorrenti. Il backoff è esponenziale e limitato. Errori catalogo vengono riportati nello stato ERROR ma non fermano polling/spool/ORDER.

## Manual sync e UI

Il pulsante “Sincronizza ora con FUSION” crea una richiesta versionata per il connector FUSION attivo della location corrente. Il heartbeat restituisce soltanto il comando scoped al device. La pagina mostra stato, ultimo sync, PLU, creati, aggiornati, invariati, mancanti ed errori.

## Test e regressioni

Test locali senza hardware coprono builder e parser chiusi, uno/più PLU, gap, DB_END e ACK, malformed frame, timeout, disconnect, duplicato identico/conflittuale, cambio nome/prezzo, nuovo/invariato/mancante, persistenza dopo restart e regressione ORDER/connector. Le suite eseguite:

- `npm run test:integration:fusion-catalog`: PASS (5 test aggregati);
- `npm run test:integration:fusion-xml1745`: PASS (5);
- `npm run test:e2e:kitchen-connector`: PASS (1);
- TypeScript: PASS;
- ESLint: PASS con warning preesistenti non bloccanti;
- Next.js production build: PASS;
- `git diff --check`: PASS.

## Database Integration Validation

- Database usato: `nexus_erp_test`; suffisso `_test` verificato prima di ogni comando mutativo.
- Database produzione usato: no.
- Backup safety: schema-only pre-migration salvato nel container PostgreSQL e verificato con SHA-256; nessuna credenziale è riportata.
- Migration: `20260901170000_fusion_catalog_sync_v1` era l’unica pendente, è stata applicata con `prisma migrate deploy`; status successivo “Database schema is up to date”.
- Endpoint/import/update: passano autenticazione device, scope company/location derivato server-side, nuovo PLU, mapping, cambio nome/prezzo e preservazione dei campi Nexus-owned.
- Idempotenza: retry con la stessa chiave non crea Item o mapping duplicati; una reconciliation invariata non esegue update.
- Missing: mapping marcato missing, Item conservato senza delete.
- Isolamento/security: credential non valida rifiutata, company/location manipolate nel payload ignorate, PLU duplicati rifiutati e collisione tardiva completamente rollbackata.
- Manual sync: due richieste ravvicinate sono versionate; il test completo comando → simulator DATA_REQ/ACK/DB_END → connector upload → DB passa senza hardware.
- Safety assertion: catalog test ha creato 0 BusinessDocument, 0 FinancialMovement, 0 RestaurantOrder, 0 KitchenPrintJob e 0 operazioni fiscali.
- ORDER regression: mapping persistente ha precedenza; fallback JSON e ledger precedente restano operativi.
- Totale quality suite: 34 test, 34 pass, 0 fail (Catalog, FUSION XML1745, DB, Kitchen Connector, Restaurant e simulator E2E).

## Android / Termux

Il runtime usa soltanto API Node.js standard (`net`, `fs/promises`, `crypto`, `os`, `path`) e `fetch`; non aggiunge dipendenze native. È compatibile per quanto ragionevolmente verificabile con Node.js su Linux/Crostini e Termux Android.

## Deploy, rollback e validazione live

Deploy controllato: (1) backup DB; (2) test migration su `_test`; (3) deploy web e migration; (4) aggiornamento connector con upper bound PLU amministrativamente verificato; (5) prima sync in finestra controllata; (6) review Item `needsReview`; (7) migrazione graduale dei mapping JSON ORDER ai mapping persistenti. Il JSON ORDER esistente resta supportato in questa release.

Rollback applicativo: fermare/riportare il connector alla release precedente e disabilitare `CATALOG_SYNC_ENABLED`; le tabelle additive possono restare senza impatto. Non eliminare automaticamente Item o mapping creati. Un rollback schema, se richiesto, deve avvenire solo dopo export e verifica manuale dei dati.

Validazione live futura, eseguita dal dispositivo LAN e non dalla VPS: DATA_REQ read-only con upper bound approvato, verifica conteggi/preview, import controllato, seconda sync invariata, modifica prezzo descrizione di un PLU di prova, missing simulato solo dopo approvazione, quindi ORDER di regressione separato e osservazione che non siano nati documenti fiscali o movimenti finanziari.

## File modificati per Catalog Sync

`prisma/schema.prisma`, migration Catalog Sync, `lib/fusion-catalog-sync.ts`, route catalog-sync e heartbeat, reader/runtime connector, pagina/action/panel Kitchen Settings, test Catalog Sync, `package.json` e questo report.
