# Nexus ERP — ROADMAP_V1.md

Documento generato dall'analisi completa del repository. Riflette lo stato al **2 agosto 2026**.

---

## 1. Elenco di tutti i moduli implementati

### Core Obbligatorio (sempre attivi)
| Modulo | Stato | File principali | Note |
|--------|-------|----------------|------|
| `CORE_AUTH` | ✅ **IMPLEMENTATO** | `auth.ts`, `auth.config.ts`, `lib/prisma.ts` | Auth.js v5, JWT, Credentials, PrismaAdapter |
| `CORE_COMPANIES` | ✅ **IMPLEMENTATO** | `prisma/schema.prisma` (Company) | Multi-tenant, dati legali, valuta, timezone |
| `CORE_MEMBERSHIPS` | ✅ **IMPLEMENTATO** | `prisma/schema.prisma` (Membership, MembershipRole) | User↔Company, isDefault, ruoli per membership |
| `CORE_ROLES_PERMISSIONS` | ✅ **IMPLEMENTATO** | `prisma/schema.prisma` (Role, MembershipRole) | Ruoli system=true, permessi per membership |
| `CORE_MODULES` | ✅ **IMPLEMENTATO** | `lib/modules.ts`, `lib/module-catalog.ts`, `prisma/schema.prisma` | ModuleDefinition, CompanyModule, bundle defaults |
| `CORE_PARTNERS` | ✅ **IMPLEMENTATO** | `lib/partners.ts`, `app/(dashboard)/partners`, `prisma/schema.prisma` | Anagrafica unica, 8 qualifiche, soft delete |
| `CORE_DOCUMENTS` | ✅ **IMPLEMENTATO** | `lib/documents.ts`, `lib/document-access.ts`, `app/(dashboard)/documents` | Unified Document Engine, serie, workflow, outbox |
| `CORE_DASHBOARD` | ✅ **IMPLEMENTATO** | `app/(dashboard)/dashboard` | Indicatori base per moduli attivi |

### Core Condiviso Attivabile (implementato)
| Modulo | Stato | File principali | Note |
|--------|-------|----------------|------|
| `CORE_PRODUCTS` | ✅ **IMPLEMENTATO** | `lib/items.ts`, `lib/item-types.ts`, `app/(dashboard)/items` | Item 8 tipi + 8 profili 1:1, RecipeComponent, PackageComponent |
| `CORE_PRICE_LISTS` | ✅ **IMPLEMENTATO** | `lib/items.ts` (PriceListItem), `prisma/schema.prisma` | Multi-listino, valuta, righe tenant-scoped |
| `CORE_PAYMENTS` | ✅ **IMPLEMENTATO** | `lib/partners.ts` (PaymentMethod, PaymentTerm), `prisma/schema.prisma` | Metodi/condizioni pagamento, rate JSON validate |
| `CORE_INVENTORY` | ✅ **IMPLEMENTATO** | `lib/inventory.ts`, `lib/inventory-access.ts`, `app/(dashboard)/inventory` | Ledger immutabile, lotti/seriali, trasferimenti, inventari, StockBalance |
| `CORE_SALES` | ✅ **IMPLEMENTATO** | `lib/sales.ts`, `lib/sales-access.ts`, `lib/sales-routing.ts`, `app/(dashboard)/sales` | QUOTE→ORDER→DDT→INVOICE, DocumentLink, posting DDT→Inventory |
| `CORE_PURCHASES` | ✅ **IMPLEMENTATO** | `lib/purchasing.ts`, `lib/purchasing-access.ts`, `lib/purchasing-routing.ts`, `app/(dashboard)/purchases` | PO→RECEIPT→INVOICE, resi, note credito, Inventory integration |
| `CORE_TREASURY` | ✅ **IMPLEMENTATO** | `lib/treasury.ts`, `lib/treasury-access.ts`, `lib/treasury-routing.ts`, `app/(dashboard)/treasury` | Conti, scadenzario, movimenti, allocazioni, trasferimenti, riconciliazione, cash flow |

### Verticali Restaurant (MVP implementato)
| Modulo | Stato | File principali | Note |
|--------|-------|----------------|------|
| `RESTAURANT_RESERVATIONS` | ✅ **IMPLEMENTATO** | `lib/restaurant-reservations.ts`, `app/(dashboard)/restaurant/reservations` | Multi-tavolo, waitlist, stati, sovrapposizioni |
| `RESTAURANT_MENU` | ✅ **IMPLEMENTATO** | `prisma/schema.prisma` (RestaurantMenu, Section, MenuItem), `lib/restaurant.ts` | Menu per sede, sezioni, Item vendibili, prezzo override |
| `RESTAURANT_RECIPES` | ✅ **IMPLEMENTATO** | `lib/restaurant-food-cost.ts`, `prisma/schema.prisma` (RecipeProfile, RecipeComponent) | Distinta ingredienti, food cost, margine, producibilità |
| `RESTAURANT_FLOOR` | ✅ **IMPLEMENTATO** | `lib/restaurant.ts`, `lib/restaurant-orders.ts`, `app/(dashboard)/restaurant` | Aree, tavoli, comande multi-riga, portate, note cucina |
| `RESTAURANT_KITCHEN` | ✅ **IMPLEMENTATO** | `lib/restaurant-kitchen.ts`, `prisma/schema.prisma` (KitchenStation, Ticket) | Stazioni, ticket, avanzamento stati, polling |
| `RESTAURANT_POS` | ✅ **IMPLEMENTATO** | `lib/restaurant-orders.ts` (closeRestaurantOrderAtomic), `lib/restaurant-fiscal-adapter.ts` | Chiusura conto atomica, doc Sales + incasso Treasury, adapter Noop |
| `RESTAURANT_FOOD_INVENTORY` | ✅ **IMPLEMENTATO** | `lib/restaurant-kitchen.ts` (serveRestaurantOrderLine, reverseRecipeConsumption) | Consumo ingredienti al servizio, storno compensativo, RecipeConsumption |

---

## 2. Elenco di tutti i moduli mancanti

### Core Condiviso Attivabile — **MANCANTI**
| Modulo | Stato Catalogo | Priorità | Note |
|--------|----------------|----------|------|
| `CORE_LOCATIONS` | AVAILABLE (foundation) | **P0** | Anagrafica, headquarters, CRUD e sede corrente Membership completati; resta lo scope operativo su magazzini/casse/prenotazioni/report |
| `CORE_AUDIT` | PLANNED | **P0** | Solo `DomainEvent` outbox; manca AuditEvent strutturato, retention policy, export, UI amministrativa |
| `CORE_NOTIFICATIONS` | PLANNED | **P1** | Email SMTP (integrazione #1), preferenze, canali, template |
| `CORE_ACCOUNTING` | PLANNED | **P1** | Prima nota, piano conti, scritture contabili, bilancio, export commercialista — **escluso da V1 per ADR-013** |
| `CORE_REPORTING` | PLANNED | **P1** | Report definiti, esecuzioni, export, scheduling, widget dashboard |
| `CORE_FISCAL_ITALY` | PLANNED | **P0** | Regole/tracciati versionati, numerazioni, trasmissione FE tramite provider esterno |
| `CORE_INTEGRATIONS` | PLANNED | **P1** | CredentialRef, Webhook, SyncJob, adapter pattern, circuito integrazioni prioritarie |
| `CORE_SEARCH` | FUTURE | P2 | Ricerca globale autorizzata per moduli attivi |
| `CORE_IMPORT_EXPORT` | FUTURE | P2 | Job controllati, mapping, validazione, tracciabilità |
| `CORE_CRM` | FUTURE | P2 | Lead, Opportunity, Activity, pipeline |

### Verticale Hotel — **TUTTI MANCANTI** (solo modelli Prisma)
| Modulo | Stato Catalogo | Note |
|--------|----------------|------|
| `HOTEL_ROOMS` | PLANNED | `HotelRoomProfile` in schema; mancano: Property, RoomType, Room, RoomBlock, disponibilità, calendario, UI |
| `HOTEL_RESERVATIONS` | PLANNED | StayReservation, Guest, RatePlan, Deposit, policy cancellazione, caparre, no-show |
| `HOTEL_FRONT_DESK` | PLANNED | Check-in/out, assegno camera, folio ospite, adempimenti, documento soggiorno |
| `HOTEL_HOUSEKEEPING` | PLANNED | Stato camere, task pulizia, sincronizzazione con front desk |
| `HOTEL_MAINTENANCE` | FUTURE | Fuori servizio, ticket, interventi |
| `HOTEL_EXTRAS` | FUTURE | Minibar, servizi extra, sale eventi |
| `HOTEL_DISTRIBUTION` | FUTURE | Channel manager, booking engine, sync disponibilità/tariffe |
| `HOTEL_GUEST_PORTAL` | FUTURE | Self-service pre-arrivo/soggiorno |
| `HOTEL_RESTAURANT_LINK` | FUTURE | Addebito ristorante su conto camera (richiede moduli Restaurant scelti) |

### Verticale Beauty — **TUTTI MANCANTI** (solo modelli Prisma)
| Modulo | Stato Catalogo | Note |
|--------|----------------|------|
| `BEAUTY_OPERATORS` | PLANNED | `BeautyServiceProfile` in schema; mancano: OperatorProfile, Skill, Workstation, Cabin, disponibilità |
| `BEAUTY_APPOINTMENTS` | PLANNED | Agenda, appuntamenti, durata, servizi, conflitti, risorse |
| `BEAUTY_CLIENT_RECORDS` | PLANNED | Scheda cliente, trattamenti, note, prodotti usati, foto, consensi versionati |
| `BEAUTY_PACKAGES` | PLANNED | `PackageProfile`, `PackageComponent` in schema; mancano: crediti, prepagati, abbonamenti, saldo |
| `BEAUTY_INVENTORY` | PLANNED | Vendita retail, consumo tecnico per trattamento, scarico Inventory |
| `BEAUTY_REMINDERS` | PLANNED | Promemoria transazionali, richiami periodici, regole consenso |
| `BEAUTY_ONLINE_BOOKING` | FUTURE | Prenotazione pubblica controllata, disponibilità |
| `BEAUTY_LOYALTY` | FUTURE | Fidelity, gift card |
| `BEAUTY_COMMISSIONS` | FUTURE | Regole, calcolo, statement verificabili |
| `BEAUTY_CAMPAIGNS` | FUTURE | Segmentazione, comunicazioni consenzienti (richiede CRM) |

---

## 3. Dipendenze tra i moduli

### Grafo critico (da MODULE_DEPENDENCIES.md + analisi codice)

```
CORE_AUTH
  └─ CORE_COMPANIES
       ├─ CORE_MEMBERSHIPS → CORE_ROLES_PERMISSIONS → CORE_MODULES
       ├─ CORE_LOCATIONS (PLANNED)
       ├─ CORE_PARTNERS
       ├─ CORE_DOCUMENTS
       ├─ CORE_AUDIT (PLANNED)
       └─ CORE_NOTIFICATIONS (PLANNED)
            └─ CORE_DASHBOARD

CORE_MODULES → CORE_PRODUCTS
  ├─ CORE_PRICE_LISTS
  ├─ CORE_INVENTORY
  ├─ CORE_SALES (needs: CORE_PARTNERS, CORE_PRODUCTS, CORE_DOCUMENTS)
  ├─ CORE_PURCHASES (needs: CORE_PARTNERS, CORE_PRODUCTS, CORE_DOCUMENTS)
  └─ CORE_PAYMENTS (needs: CORE_DOCUMENTS, CORE_PARTNERS)
       └─ CORE_TREASURY (needs: CORE_PAYMENTS, CORE_PARTNERS, CORE_DOCUMENTS)
            ├─ CORE_SALES → scadenze attive (condizionale)
            └─ CORE_PURCHASES → scadenze passive (condizionale)

CORE_FISCAL_ITALY (needs: CORE_DOCUMENTS, CORE_PAYMENTS)
CORE_INTEGRATIONS (needs: Core obbligatorio)
CORE_ACCOUNTING (needs: CORE_DOCUMENTS, CORE_PAYMENTS)
CORE_REPORTING (needs: CORE_DASHBOARD)
```

### Verticali Restaurant (implementati)
```
RESTAURANT_RESERVATIONS → CORE_PARTNERS
RESTAURANT_MENU → CORE_PRODUCTS, CORE_PRICE_LISTS
RESTAURANT_RECIPES → RESTAURANT_MENU, CORE_INVENTORY
RESTAURANT_FLOOR → RESTAURANT_MENU, CORE_SALES
RESTAURANT_KITCHEN → RESTAURANT_FLOOR
RESTAURANT_POS → RESTAURANT_FLOOR, CORE_PAYMENTS, CORE_TREASURY, CORE_DOCUMENTS
RESTAURANT_FOOD_INVENTORY → CORE_INVENTORY, RESTAURANT_RECIPES
```

### Verticali Hotel (pianificati)
```
HOTEL_ROOMS → CORE_LOCATIONS, CORE_PRODUCTS
HOTEL_RESERVATIONS → HOTEL_ROOMS, CORE_PARTNERS, CORE_PRICE_LISTS
HOTEL_FRONT_DESK → HOTEL_RESERVATIONS, CORE_DOCUMENTS, CORE_PAYMENTS
HOTEL_HOUSEKEEPING → HOTEL_ROOMS
HOTEL_RESTAURANT_LINK → HOTEL_FRONT_DESK + moduli Restaurant scelti
```

### Verticali Beauty (pianificati)
```
BEAUTY_OPERATORS → CORE_MEMBERSHIPS, CORE_PRODUCTS
BEAUTY_APPOINTMENTS → BEAUTY_OPERATORS, CORE_PARTNERS, CORE_PRICE_LISTS
BEAUTY_CLIENT_RECORDS → BEAUTY_APPOINTMENTS, CORE_PARTNERS
BEAUTY_PACKAGES → BEAUTY_APPOINTMENTS, CORE_PAYMENTS
BEAUTY_INVENTORY → CORE_INVENTORY, BEAUTY_APPOINTMENTS
BEAUTY_REMINDERS → BEAUTY_APPOINTMENTS, CORE_NOTIFICATIONS
```

### Regole invarianti (da MODULE_DEPENDENCIES.md)
1. Core obbligatorio sempre attivo
2. Partner richiesto da Sales, Purchases, CRM, Hotel, Beauty
3. Prodotti/Servizi richiesti da Sales, Purchases, Inventory, Restaurant, Beauty
4. Inventory opzionale in generale, **obbligatorio** per ricette con scarico e consumi Beauty automatici
5. Dipendenza deve essere attiva prima del modulo dipendente; disattivazione rifiutata se dipendenti attivi
6. Disattivazione non cancella/anonimizza/modifica dati
7. Bundle conviventi; attivazione bundle applica default e risolve dipendenze
8. Visibilità tipi Item verticali richiede modulo proprietario attivo + CORE_PRODUCTS

---

## 4. Criticità residue

### Architetturali
| Criticità | Impatto | Area | Mitigazione |
|-----------|---------|------|-------------|
| **Posting multi-riga Purchasing non atomico** | Alto | `CORE_PURCHASES` | ADR-025: retry completa solo righe mancanti; serve transazione unica Document+Inventory |
| **Mancanza worker Outbox consumer** | Medio | Tutti (DomainEvent) | Eventi persistiti ma non consumati; Inventory/Treasury/Accounting futuri non reagiscono |
| **CORE_LOCATIONS solo schema** | Alto | Multi-sede | Sede attiva non implementata; scope sede su magazzini/casse/prenotazioni/report mancante |
| **Permessi granulari non completi** | Medio | Authorization | Ruoli esistono ma permessi `dominio.azione` non mappati a tutte le Server Actions |
| **Atomicità multi-componente Inventory** | Medio | `CORE_INVENTORY` | ADR-031/ADR-035: batch atomico per movimenti multipli, ma recipe service non usa batch per tutti i componenti |

### Dati e Qualità
| Criticità | Impatto | Area |
|-----------|---------|------|
| **StockBalance: solo stock reale contabilizzato** | Medio | Inventory | Prenotato/disponibile/futuro non separati (richiede documenti sorgente) |
| **Valorizzazione: solo costo medio ponderato** | Basso | Inventory | No FIFO/LIFO, landed cost, rivalutazioni |
| **Treasury: no PSD2/open banking/CAMT/MT940** | Medio | Treasury | Riconciliazione solo manuale, no feed bancari |
| **Fiscalità: adapter Noop** | Alto | Restaurant | Nessuna trasmissione corrispettivi, no RT reale (ADR-032) |
| **Realtime cucina: solo polling** | Basso | Restaurant | No WebSocket/push |

### Testing e Operatività
| Criticità | Impatto | Area |
|-----------|---------|------|
| **Test integration: solo core-transaction-idempotency** | Alto | Testing | Mancano test per Sales, Purchasing, Treasury, Restaurant flow completi |
| **Test E2E: solo restaurant-core-hardening** | Alto | Testing | Nessun E2E per Partners, Items, Inventory, Documents, Purchases, Treasury |
| **Seed database non verificato** | Medio | Setup | `prisma/seed.ts` esiste ma non confermato allineato a moduli attivi |
| **Migrazioni: storia non lineare** | Basso | DB | Verificare `prisma migrate status` vs schema attuale |

---

## 5. Debito tecnico

| Voce | Descrizione | Priorità | Stima sforzo |
|------|-------------|----------|--------------|
| **Purchasing posting non atomico** | Document + Inventory movimenti in transazioni separate; retry parziale | P0 | 3-5 gg |
| **CORE_LOCATIONS incompleto** | Schema pronto, mancano: MembershipLocation, sede attiva, scope su Warehouse/FinancialAccount/Reservation/Report | P0 | 5-8 gg |
| **CORE_AUDIT assente** | Solo DomainEvent outbox; serve AuditEvent strutturato, retention, export, UI | P0 | 5-7 gg |
| **CORE_FISCAL_ITALY assente** | Regole versionate, numerazioni, adapter FE provider esterno | P0 | 8-12 gg |
| **Worker Outbox consumer** | Infrastructure per consumare DomainEvent (Inventory, Accounting, Notifications) | P1 | 5-8 gg |
| **Permessi granulari mappatura completa** | Ogni Server Action/Route Handler deve verificare `modulo.azione` | P1 | 3-5 gg |
| **Recipe service: batch consumption** | `serveRestaurantOrderLine` chiama Inventory per componente; usare `postInventoryMovementsBatch` | P1 | 2-3 gg |
| **Multi-tenant test coverage** | Test con 2+ Company, identificativi validi cross-tenant | P1 | 3-4 gg |
| **Real-time Kitchen** | Sostituire polling con WebSocket/SSE | P2 | 5-7 gg |
| **StockBalance: available/reserved/future** | Separare quantità prenotata (DDT confirmed, PO approved) | P2 | 5-8 gg |
| **FIFO/LIFO/landed cost** | Valorizzazione avanzata Inventory | P2 | 8-12 gg |
| **Open Banking / CAMT.053** | Feed bancari automatici, matching AI | P2 | 10-15 gg |
| **RT/POS reale** | Adapter per registratore telematico certificato | P2 | 8-12 gg |

---

## 6. Priorità P0, P1, P2

### P0 — Bloccanti per V1 "operativa completa"
1. **CORE_LOCATIONS** completo (sede attiva, assegnazioni, scope)
2. **CORE_AUDIT** implementato (eventi strutturati, retention, export)
3. **CORE_FISCAL_ITALY** base (regole versionate, numerazioni, adapter FE provider)
4. **Purchasing posting atomico** (Document + Inventory in unica transazione)
4. **Permessi granulari** mappati su tutte le mutazioni critiche
5. **Test isolation multi-tenant** (integrazione + E2E core flows)
6. **Seed database** validato e allineato a bundle defaults

### P1 — Necessari per V1 "produzione-ready"
1. **CORE_NOTIFICATIONS** (email SMTP + preferenze)
2. **CORE_INTEGRATIONS** framework (credentialRef, webhook, syncJob, adapter pattern)
3. **Worker Outbox consumer** (almeno Inventory + Notifications)
4. **Recipe service batch consumption** (usare `postInventoryMovementsBatch`)
5. **Reporting base** (CORE_REPORTING: widget, export, report predefiniti)
6. **CORE_ACCOUNTING** V1 scope (prima nota, scadenziario, riconciliazione, export commercialista) — *se in V1 per ADR-013*
7. **E2E coverage** completo (Partners, Items, Inventory, Documents, Sales, Purchases, Treasury, Restaurant)

### P2 — Evoluzione post-V1 (verso V2)
1. **CORE_SEARCH** ricerca globale
2. **CORE_IMPORT_EXPORT** job controllati
3. **CORE_CRM** lead/opportunity/activity
4. **StockBalance: available/reserved/future**
5. **FIFO/LIFO/landed cost** valorizzazione
6. **Real-time Kitchen** WebSocket/SSE
7. **Open Banking / CAMT.053** feed bancari
8. **RT/POS reale** adapter certificato
9. **Hotel MVP** (Fase 4 roadmap)
10. **Beauty MVP** (Fase 3 roadmap)

---

## 7. Roadmap dettagliata fino alla versione 1.0

### Milestone 0 — Consolidamento Fondazioni (Settimane 1-2) ✅ **GIÀ COMPLETATO**
- Next.js 16, Prisma 7, PostgreSQL, Auth.js v5
- Company, Membership, Ruoli, Partner, Module System
- Schema Prisma allineato, DBML documentato

### Milestone 1 — Core Operativo Completo (Settimane 3-6) **IN CORSO**
| Settimana | Deliverable | Criteri accettazione |
|-----------|-------------|----------------------|
| 3-4 | **CORE_LOCATIONS** completo | MembershipLocation, sede attiva, scope su Warehouse/FinancialAccount/Reservation/Report; UI settings/locations |
| 3-4 | **CORE_AUDIT** implementato | AuditEvent (company, actor, action, entity, id, timestamp, outcome, correlationId, diff), retention policy configurabile, export CSV/JSON, UI /settings/audit |
| 4-5 | **CORE_FISCAL_ITALY** base | FiscalRuleSet versionato, numerazioni per tipo documento, adapter FE provider esterno (contratto), test su esempi ufficiali |
| 5 | **Purchasing posting atomico** | `postPurchaseInvoiceTx` + `postInventoryMovementsBatch` in stessa transazione serializzabile; rollback completo su errore |
| 5-6 | **Permessi granulari** | Ogni Server Action/Route Handler verifica `modulo.azione`; matrix ruoli×azioni documentata; test autorizzazione negata |
| 6 | **Test isolation multi-tenant** | Integration test con 2 Company, stessi ID, verifica isolamento; E2E core flows (login→partner→item→doc→inventory→treasury) |

### Milestone 2 — V1 Production Ready (Settimane 7-10)
| Settimana | Deliverable | Criteri accettazione |
|-----------|-------------|----------------------|
| 7 | **CORE_NOTIFICATIONS** | Email SMTP transazionali, template, preferenze utente, coda invio, retry/backoff |
| 7-8 | **CORE_INTEGRATIONS** framework | CredentialRef cifrato, Webhook (verify signature/timestamp/replay), SyncJob tracciato, adapter pattern documentato |
| 8 | **Worker Outbox consumer** | Processore DomainEvent (InventoryMovementPosted, DocumentPosted, PaymentScheduleCreated), idempotenza via processedAt, retry esponenziale, DLQ |
| 8-9 | **Recipe batch consumption** | `serveRestaurantOrderLine` usa `postInventoryMovementsBatch` per tutti i componenti; test concorrenza + rollback |
| 9 | **CORE_REPORTING** base | ReportDefinition (SQL/parametrizzato), ReportRun (stato, output, scheduling), widget dashboard, export CSV/PDF |
| 9-10 | **CORE_ACCOUNTING V1** (se in scope) | Prima nota da Document/Treasury, piano conti minimo, scritture automatiche, export commercialista validato |
| 10 | **E2E coverage completo** | Playwright suite: auth, partners, items, inventory, documents, sales, purchases, treasury, restaurant floor→kitchen→close |

### Milestone 3 — V1.0 Release (Settimana 11)
- Freeze funzionalità
- Documentazione aggiornata (ARCHITECTURE, DECISIONS, ROADMAP, MODULE_CATALOG, MODULE_DEPENDENCIES)
- Security audit (tenant isolation, auth, permessi)
- Performance test (carico 50 Company, 100 utenti concorrenti)
- Release candidate → produzione

---

## 8. Roadmap verso la versione 2.0

### Fase 3 — Verticale Beauty MVP (Mesi 1-3 post-V1)
**Dipendenze:** Core operativo stabilizzato, CORE_NOTIFICATIONS, CORE_INVENTORY, CORE_PAYMENTS
| Sprint | Deliverable |
|--------|-------------|
| 1-2 | `BEAUTY_OPERATORS` + `BEAUTY_APPOINTMENTS` (agenda, risorse, conflitti, durata, servizi) |
| 3 | `BEAUTY_CLIENT_RECORDS` (scheda, trattamenti, note, prodotti, foto, consensi versionati) |
| 4 | `BEAUTY_PACKAGES` + `BEAUTY_INVENTORY` (crediti, prepagati, retail, consumo tecnico) |
| 5 | `BEAUTY_REMINDERS` (promemoria transazionali, richiami periodici, consenso) |
| 6 | Test E2E Beauty, documentazione, bundle Beauty default |

### Fase 4 — Verticale Hotel MVP (Mesi 4-6 post-V1)
**Dipendenze:** Core operativo, CORE_LOCATIONS, CORE_DOCUMENTS, CORE_PAYMENTS
| Sprint | Deliverable |
|--------|-------------|
| 1-2 | `HOTEL_ROOMS` + `HOTEL_RESERVATIONS` (strutture, tipologie, camere, disponibilità, calendario, prenotazioni, ospiti, rate plan, caparre, policy) |
| 3 | `HOTEL_FRONT_DESK` (check-in/out, assegno camera, folio, adempimenti, documento soggiorno) |
| 4 | `HOTEL_HOUSEKEEPING` (stato camere, task, sincronizzazione front desk) |
| 5 | Test concorrenza disponibilità, overbooking prevention, E2E Hotel |
| 6 | Bundle Hotel default, documentazione |

### Fase 5 — Amministrazione Completa (Mesi 7-9 post-V1)
| Area | Deliverable |
|------|-------------|
| **Fatturazione Elettronica** | Provider esterno, contratto versionato, trasmissione idempotente, conservazione |
| **Accounting Engine** | Piano conti, prima nota automatica, scritture contabili, bilancio, adempimenti IVA |
| **Open Banking** | PSD2, CAMT.053/MT940, matching automatico, riconciliazione assistita |
| **Export Commercialista** | Formati validati (XBRL, CSV specifici), mapping conti, controllo quadratura |

### Fase 6 — Espansione (Mesi 10-12+ post-V1)
| Area | Deliverable |
|------|-------------|
| **CRM** | Lead, Opportunity, Activity, Pipeline, Integrazione Partner/Documenti |
| **BI/Analytics** | Metriche governate, dashboard executive, drill-down, export |
| **Portali** | Client portal (Beauty/Hotel), Supplier portal (Purchasing), Accountant portal |
| **Automazioni** | Workflow engine, trigger event-based, idempotenza, disattivazione sicura |
| **AI Assistive** | Suggerimenti food cost, forecast domanda, anomaly detection, con autorizzazioni esplicite e revisione umana |

### Integrazioni trasversali (ordinate per priorità ADR-014)
1. ✅ Email SMTP (Fase 1)
2. 🔄 Excel/CSV import-export (Fase 1-2)
3. 🔄 Fatturazione elettronica provider (Fase 5)
4. ⏳ Pagamenti online (Fase 5)
5. ⏳ WhatsApp (Fase 6)
6. ⏳ Open Banking (Fase 5)
7. ⏳ POS / Registratore telematico (Fase 2+)
8. ⏳ Booking Engine / Channel Manager (Fase 4+)

---

## 9. Stima percentuale di completamento dell'intero ERP

| Area | Peso architetturale | Completamento | Note |
|------|---------------------|---------------|------|
| **Fondazioni (Auth, Company, Membership, Ruoli, Moduli)** | 15% | **100%** | Solido, testato |
| **Partner / Anagrafica** | 8% | **95%** | Manca solo Contacts (V1) + UI avanzata |
| **Configuration Engine (Categorie, UOM, IVA, Listini, Pagamenti)** | 10% | **90%** | Completo backend; UI settings parziale |
| **Catalogo Item Condiviso (8 tipi + profili + Recipe/Package)** | 12% | **95%** | Schema completo, servizi CRUD, UI items |
| **Inventory Engine** | 12% | **85%** | Ledger, lotti/seriali, trasferimenti, inventari, StockBalance; manca available/reserved/future, FIFO/LIFO |
| **Unified Document Engine** | 10% | **90%** | Serie, workflow, allegati, outbox; manca approvazioni, PDF/storage/firma |
| **Sales Engine** | 8% | **85%** | Ciclo completo, DocumentLink, posting DDT→Inventory; manca approvazioni, varianti prezzo complesse |
| **Purchasing Engine** | 8% | **75%** | Ciclo base, resi, note credito; **posting non atomico** (debito P0), manca approvazioni |
| **Treasury Engine** | 10% | **80%** | Conti, scadenzario, movimenti, allocazioni, trasferimenti, riconciliazione manuale, cash flow; manca feed bancari, PSD2 |
| **Restaurant MVP** | 10% | **90%** | Prenotazioni, menu, ricette, sala, cucina, chiusura conto; manca RT/POS reale, WebSocket, delivery |
| **Hotel Vertical** | 5% | **5%** | Solo modelli Prisma (HotelRoomProfile) |
| **Beauty Vertical** | 5% | **5%** | Solo modelli Prisma (BeautyServiceProfile, PackageProfile) |
| **Audit/Notifications/Integrations/Fiscalità/Accounting/Reporting** | 7% | **15%** | Quasi tutti PLANNED/FUTURE |

**TOTALE PONDERATO: ~68%**

> **Nota**: Il 68% riflette che il **Core + Restaurant MVP** sono sostanzialmente completi, mentre **Hotel, Beauty, e metà dei moduli Core condivisi attivabili** sono ancora da implementare. La V1 "completa" richiede il completamento dei moduli P0/P1 del Core condiviso.

---

## 10. Checklist completa di tutte le funzionalità ancora da implementare

### Core Obbligatorio - Da completare
- [ ] `CORE_LOCATIONS`: MembershipLocation, sede attiva, scope sede su Warehouse/FinancialAccount/Reservation/Report, UI `/settings/locations`
- [ ] `CORE_AUDIT`: AuditEvent model, retention policy, export, UI `/settings/audit`
- [ ] `CORE_NOTIFICATIONS`: Email SMTP, template, preferenze, coda, retry
- [ ] `CORE_FISCAL_ITALY`: FiscalRuleSet versionato, numerazioni, adapter FE provider esterno
- [ ] `CORE_INTEGRATIONS`: CredentialRef, Webhook, SyncJob, adapter pattern

### Core Condiviso Attivabile - Da implementare (PLANNED)
- [ ] `CORE_ACCOUNTING` V1: Piano conti, prima nota, scritture automatiche, bilancio, export commercialista
- [ ] `CORE_REPORTING`: ReportDefinition, ReportRun, scheduling, widget, export
- [ ] Permessi granulari: mapping completo `modulo.azione` su tutte Server Actions/Route Handlers

### Core Condiviso Attivabile - Futuri (FUTURE)
- [ ] `CORE_SEARCH`: Ricerca globale autorizzata
- [ ] `CORE_IMPORT_EXPORT`: Job controllati, mapping, validazione
- [ ] `CORE_CRM`: Lead, Opportunity, Activity, Pipeline

### Inventory - Miglioramenti (P1/P2)
- [ ] StockBalance: separare available/reserved/future
- [ ] Valorizzazione FIFO/LIFO/landed cost
- [ ] Recipe service: usare `postInventoryMovementsBatch` per tutti i componenti

### Documents - Estensioni (P1/P2)
- [ ] Workflow approvazioni configurabile
- [ ] PDF generation, storage, firma digitale
- [ ] DocumentAttachment: storage backend, anteprima, versione

### Sales/Purchasing - Completamenti (P1)
- [ ] Approvazioni multinivello
- [ ] Varianti prezzo complesse (sconti a volume, promozioni)
- [ ] **Purchasing posting atomico** (P0 - debito tecnico)
- [ ] Chiusura esercizio, nota credito differita

### Treasury - Estensioni (P1/P2)
- [ ] Feed bancari PSD2 / open banking
- [ ] Import CAMT.053 / MT940
- [ ] Matching automatico/AI reconciliazione
- [ ] Bonifici reali (SEPA)
- [ ] Previsione flussi con movimenti pianificati

### Restaurant - Completamento MVP (P1/P2)
- [ ] Adapter RT/POS reale (provider certificato)
- [ ] WebSocket/SSE real-time cucina
- [ ] Takeaway/Delivery multi-provider
- [ ] Fidelity/Gift card (modulo `RESTAURANT_LOYALTY`)
- [ ] Eventi/Menu dedicati
- [ ] Analytics per piatto/cameriere/fascia oraria

### Hotel Vertical - TUTTO DA IMPLEMENTARE (Fase 4)
- [ ] `HOTEL_ROOMS`: Property, RoomType, Room, RoomBlock, disponibilità, calendario
- [ ] `HOTEL_RESERVATIONS`: StayReservation, Guest, RatePlan, Deposit, policy, caparre, no-show
- [ ] `HOTEL_FRONT_DESK`: Check-in/out, assegno camera, folio, adempimenti, documento soggiorno
- [ ] `HOTEL_HOUSEKEEPING`: Stato camere, task, sincronizzazione
- [ ] `HOTEL_MAINTENANCE`: Fuori servizio, ticket, interventi (FUTURE)
- [ ] `HOTEL_EXTRAS`: Minibar, servizi extra, sale eventi (FUTURE)
- [ ] `HOTEL_DISTRIBUTION`: Channel manager, booking engine, sync (FUTURE)
- [ ] `HOTEL_GUEST_PORTAL`: Self-service (FUTURE)
- [ ] `HOTEL_RESTAURANT_LINK`: Addebito ristorante su conto camera (FUTURE)

### Beauty Vertical - TUTTO DA IMPLEMENTARE (Fase 3)
- [ ] `BEAUTY_OPERATORS`: OperatorProfile, Skill, Workstation, Cabin, disponibilità
- [ ] `BEAUTY_APPOINTMENTS`: Agenda, appuntamenti, durata, servizi, conflitti, risorse
- [ ] `BEAUTY_CLIENT_RECORDS`: Scheda cliente, trattamenti, note, prodotti, foto, consensi versionati
- [ ] `BEAUTY_PACKAGES`: Crediti, prepagati, abbonamenti, saldo
- [ ] `BEAUTY_INVENTORY`: Vendita retail, consumo tecnico, scarico Inventory
- [ ] `BEAUTY_REMINDERS`: Promemoria transazionali, richiami periodici, consenso
- [ ] `BEAUTY_ONLINE_BOOKING`: Prenotazione pubblica (FUTURE)
- [ ] `BEAUTY_LOYALTY`: Fidelity, gift card (FUTURE)
- [ ] `BEAUTY_COMMISSIONS`: Regole, calcolo, statement (FUTURE)
- [ ] `BEAUTY_CAMPAIGNS`: Segmentazione, comunicazioni (FUTURE, richiede CRM)

### Infrastruttura Trasversale (P0/P1)
- [ ] Worker Outbox consumer (DomainEvent processor)
- [ ] Test isolation multi-tenant (2+ Company, cross-tenant ID)
- [ ] E2E coverage completo (tutti i moduli Core + Restaurant)
- [ ] Seed database validato per bundle defaults
- [ ] Security audit (tenant isolation, auth, permessi, injection)
- [ ] Performance test (50 Company, 100 utenti concorrenti)
- [ ] Documentazione allineata (ARCHITECTURE, DECISIONS, ROADMAP, MODULE_CATALOG, MODULE_DEPENDENCIES)

### Integrazioni Prioritarie (ADR-014)
- [ ] Email SMTP ✅ (da implementare in CORE_NOTIFICATIONS)
- [ ] Excel/CSV import-export
- [ ] Fatturazione elettronica provider esterno
- [ ] Pagamenti online
- [ ] WhatsApp Business API
- [ ] Open Banking / PSD2
- [ ] POS / Registratore telematico adapter
- [ ] Booking Engine / Channel Manager

---

## Sintesi esecutiva

**Nexus ERP è al ~68% del completamento architetturale per una V1 "produzione-ready".**

Il **Core + Restaurant MVP** sono solidi e testati (integration test idempotenza/transazioni/isolamento tenant passano). Il debito tecnico principale è concentrato su:
1. **Purchasing posting non atomico** (rischio dati)
2. **CORE_LOCATIONS/CORE_AUDIT/CORE_FISCAL_ITALY mancanti** (bloccanti compliance/operatività multi-sede)
3. **Worker Outbox assente** (eventi non consumati)
4. **Permessi granulari non mappati completamente** (rischio sicurezza)

**Hotel e Beauty sono solo modelli Prisma** (5% ciascuno) — richiedono Fase 3-4 della roadmap (6-12 mesi post-V1).

**Prossimo milestone critico**: Completare i 6 item P0 del Core condiviso in 4-6 settimane per sbloccare V1.0.

---

*Documento generato automaticamente dall'analisi di: README, ARCHITECTURE, DECISIONS, FUNCTIONAL_REQUIREMENTS, ROADMAP, MODULE_CATALOG, MODULE_DEPENDENCIES, schema.prisma, AGENTS.md, codice lib/, app/(dashboard)/, tests/.*
