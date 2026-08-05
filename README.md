# Nexus ERP

Il primo verticale operativo è Restaurant MVP: sala, prenotazioni, menu, ricette e food cost, comande, cucina, consumi Inventory e chiusura conto Sales/Treasury. L'adapter fiscale incluso è Noop e non sostituisce un registratore telematico.

Nexus ERP è una piattaforma gestionale italiana, multi-azienda e modulare. Un **Nexus Core** condiviso supporta tre verticali:

- **Restaurant**, per prenotazioni, sala, cucina, menu e food cost;
- **Hotel**, per camere, soggiorni, front desk e housekeeping;
- **Beauty**, per agenda, operatori, trattamenti e relazione cliente.

Nexus Core è sempre attivo. Restaurant, Beauty e Hotel sono bundle commerciali che possono convivere nella stessa Company; altri moduli opzionali possono essere acquistati e attivati singolarmente. Ogni Company usa soltanto i moduli attivati.

> Il progetto è in sviluppo attivo. Le specifiche descrivono anche capacità pianificate: non tutto ciò che compare nei documenti è già disponibile.

## CORE_LOCATIONS foundation

Le sedi sono anagrafiche tenant-scoped: ogni Company ha una headquarters attiva e ogni Membership persiste la sede corrente in `defaultLocationId`. Lo switcher nell'header aggiorna il valore lato server. Inventory, Documents, Treasury e verticali non sono ancora filtrati automaticamente per sede.

## Stack

- Next.js 16 con App Router e React 19
- TypeScript e Tailwind CSS
- Auth.js con adapter Prisma
- Prisma ORM 7
- PostgreSQL

## Stato attuale

Sono presenti autenticazione, sessione, multi-azienda tramite Membership, ruoli, Partner tenant-scoped, sistema moduli per Company e foundation multi-sede. Lo scope operativo Location resta pianificato per uno sprint dedicato. `prisma/schema.prisma` è il riferimento eseguibile corrente; il DBML in `docs/database/` ne documenta la struttura relazionale.

## Documentazione

- [Visione di prodotto](docs/VISION.md)
- [Requisiti funzionali](docs/FUNCTIONAL_REQUIREMENTS.md)
- [Catalogo moduli](docs/MODULE_CATALOG.md)
- [Dipendenze fra moduli](docs/MODULE_DEPENDENCIES.md)
- [Architettura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisioni architetturali](docs/DECISIONS.md)
- [Bozza DBML](docs/database/schema.dbml)

## Setup locale

Prerequisiti: Node.js compatibile con Next.js 16, npm e un database PostgreSQL.

1. Installare le dipendenze:

   ```bash
   npm install
   ```

2. Configurare le variabili d'ambiente locali, almeno la connessione PostgreSQL e i segreti richiesti da Auth.js. Non versionare file contenenti segreti.

3. Generare Prisma Client:

   ```bash
   npx prisma generate
   ```

4. Applicare le migrazioni già presenti nell'ambiente di sviluppo:

   ```bash
   npx prisma migrate dev
   ```

5. Avviare l'applicazione:

   ```bash
   npm run dev
   ```

L'app è disponibile normalmente su [http://localhost:3000](http://localhost:3000).

## Comandi principali

| Comando | Scopo |
| --- | --- |
| `npm run dev` | Avvia l'ambiente di sviluppo |
| `npm run build` | Crea la build di produzione |
| `npm run start` | Avvia la build di produzione |
| `npm run lint` | Esegue ESLint |
| `npx prisma generate` | Genera Prisma Client |
| `npx prisma migrate dev` | Applica o crea migrazioni in sviluppo |
| `npx prisma studio` | Apre l'interfaccia locale Prisma Studio |

## Principi essenziali

Ogni accesso a dati aziendali deve essere limitato dalla Company attiva derivata dalla sessione. UI nascosta, route guard e feature flag non sostituiscono i controlli server-side. La disattivazione di un modulo ne blocca utilizzo e visibilità, ma non cancella dati.
