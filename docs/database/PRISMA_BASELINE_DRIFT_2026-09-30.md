# Baseline drift Prisma — decision record 2026-09-30

## Stato e autorità

Decisione documentale per il test incrementale Inventory Procurement; nessuna modifica SQL o applicativa. HEAD di riferimento: `df31ab911a395f82293bbb584ad0c8de87aa5740`.

Le **48 migration committate**, applicate con successo da database vuoto, costituiscono la baseline SQL effettiva. Lo schema Prisma è una rappresentazione parziale e storicamente non perfettamente allineata: non sostituisce questa autorità per il presente audit.

Il precedente confronto read-only ha verificato che production `nexus_erp` e baseline `nexus_procurement_audit_test` coincidono sugli oggetti analizzati: 430 definizioni di constraint/indici sulle 37 tabelle interessate. Questo dato non dichiara equivalenza globale di tutto il database. In questo task non sono stati interrogati né modificati database.

Fonti locali: `/home/ubuntu/nexus-test-env/procurement-audit-20260930/RESULT.txt` e `baseline-drift.txt`. Lo schema locale usato dal report coincide byte per byte con lo schema committato HEAD; le aggiunte Procurement del worktree non appartengono a quel report.

## Drift noto e preservazione

Il report contiene **62 differenze logiche / 63 operazioni**: 36 intentional SQL extensions, 14 harmless naming drift, 11 historical schema drift e 1 semantic historical mismatch (rimozione/aggiunta della stessa FK).

- Preservare le intentional SQL extensions: FK composite di tenant/location, controlli di membership, unique e indici di supporto. Il constraint Membership deferrable e i CHECK raw SQL richiedono verifica catalogo oltre al diff Prisma; non tutte le estensioni sono intrinsecamente irrappresentabili in Prisma.
- Il naming drift non deve causare rename automatici: mantenere i nomi SQL esistenti, inclusi quelli troncati da PostgreSQL.
- Gli indici e le FK storici assenti dallo schema non devono essere rimossi automaticamente: ciò include le FK FusionCatalogMapping, gli indici Inventory pre-location e gli indici RestaurantReservation staff-call/waitlist.
- Nessun futuro `prisma db push` deve essere usato per ripulire automaticamente questa baseline. Ogni eventuale allineamento storico richiede un task e una decisione separati.

## FusionCatalogSyncState: decisione funzionale differita

Oggetto: `FusionCatalogSyncState_companyId_connectorId_fkey`, colonne `(companyId, connectorId)` verso KitchenConnectorDevice.

| Rappresentazione | ON UPDATE | ON DELETE |
| --- | --- | --- |
| Database / migration | NO ACTION | CASCADE |
| schema.prisma HEAD / worktree | CASCADE | CASCADE |

Il mismatch risale al commit `5cc781a`. L'intenzione storica non è documentata. Questo record **non dichiara semanticamente corretta nessuna delle due azioni**. La scelta funzionale rimane aperta.

Fino a decisione separata non modificare la FK production né la migration storica. Il confronto incrementale Procurement deve normalizzare/escludere esclusivamente questo mismatch già noto, conservando e verificando la definizione SQL esistente. Non sopprimere qualsiasi differenza futura sulla stessa tabella o FK.

## Snapshot e confronto incrementale

Manifesti fuori repository: `known-baseline-drift.json` (macchina) e `known-baseline-drift.md` (umano), nella directory degli artefatti sopra indicata. Registrano tutte le operazioni originali, classificazione, hash del report e dei due schema, e SQL/hash delle due migration Procurement. Sono evidenze, non comandi di migrazione né un filtro eseguibile.

Gate documentale: **YES, il test incrementale può procedere in un task successivo** sul solo database isolato, con guard sul nome esatto `nexus_procurement_audit_test` e sulle credenziali dedicate. Nessuna migration è applicata da questo record; il gate non certifica PASS della feature o delle migration.

Il criterio richiesto è:

`DELTA_AFTER_PROCUREMENT - KNOWN_BASELINE_DRIFT = SOLO OGGETTI PROCUREMENT ATTESI`

Applicarlo con due confronti distinti:

1. Catalogo SQL prima/dopo: la modifica netta deve coincidere con il contenuto esatto delle due migration, nell'ordine `20260824150000_inventory_procurement_v1`, poi `20260824170000_inventory_procurement_snapshots`. Le definizioni baseline devono restare invariate. Qualsiasi modifica fuori dal delta atteso richiede STOP_AND_REVIEW.
2. Diff DB/schema worktree dopo: sottrarre soltanto le differenze baseline puntuali e verificate. Non pretendere zero drift globale; ogni residuo deve appartenere agli oggetti Procurement attesi e avere una spiegazione precisa. Il diff DB/HEAD dopo includerebbe anche le nuove strutture Procurement, perché HEAD non le contiene: non confonderlo con DB/worktree.

Il delta SQL atteso comprende ItemSupplier e WarehouseItemPolicy (colonne, PK, FK, unique, indici, CHECK), unique Warehouse `(companyId, locationId, id)`, e su BusinessDocumentLine le tre colonne nullable `stockUnitOfMeasureId`, `purchaseConversionFactor`, `warehouseBinId`, due FK, CHECK conversione e indice bin. Confrontare tipi, nullabilità, default, azioni referenziali, predicati e nomi con il SQL registrato.

Verificare separatamente i **6 CHECK Procurement** e l'unique parziale `ItemSupplier_one_preferred_active_key` con predicato `preferred AND active`: Prisma non offre una verifica completa di questi oggetti. L'indice SQL `BusinessDocumentLine_companyId_warehouseBinId_idx` non è rappresentato nel worktree Prisma corrente: è un residuo Procurement atteso da verificare, non drift baseline e non una correzione implicitamente autorizzata.

La normalizzazione documentale sblocca il test delle migration senza scegliere una strategia di riparazione storica. Non autorizza modifiche a schema, migration, feature, production o applicazione automatica di diff Prisma. Nessun commit, staging o deploy in questo task.
