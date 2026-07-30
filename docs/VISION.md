# Visione di Nexus ERP

## Prodotto

Nexus ERP è una piattaforma gestionale italiana, moderna e modulare, destinata a piccole e medie imprese che vogliono governare processi amministrativi e operativi in un solo ambiente. Il prodotto combina un **Nexus Core** condiviso con tre verticali:

- **Restaurant**, per ristoranti, bar e attività di somministrazione;
- **Hotel**, per strutture ricettive;
- **Beauty**, per saloni, centri estetici e attività basate su appuntamento.

Non sono tre prodotti accostati: condividono identità, aziende, sedi, anagrafiche, catalogo, documenti, pagamenti, audit e integrazioni. Ogni verticale aggiunge processi e linguaggio propri senza contaminare gli altri.

## Utenti e valore

Nexus ERP serve titolari, responsabili, amministrativi e operatori. Deve offrire una vista semplice per il lavoro quotidiano e una base affidabile per controllo, conformità e crescita. Il posizionamento è quello di un ERP italiano verticale: profondità operativa per settore, esperienza contemporanea e fiscalità governata come configurazione versionabile.

## Nexus Core

Il Core è il fondamento obbligatorio della piattaforma. Comprende autenticazione, Company, Membership, sedi, ruoli e permessi, Partner, gestione moduli, documenti e allegati, audit minimo, notifiche di sistema e dashboard base. Offre inoltre capacità condivise attivabili, come prodotti e servizi, vendite, acquisti, magazzino, pagamenti, ricerca, reporting avanzato e integrazioni.

La distinzione fra Core obbligatorio e moduli condivisi opzionali impedisce di imporre complessità a chi non ne ha bisogno.

## Modello commerciale

Nexus Core è sempre attivo. Restaurant, Beauty e Hotel sono tre bundle verticali acquistabili; una stessa Company può attivarne più di uno, per esempio Hotel e Restaurant. I moduli condivisi o specialistici opzionali possono inoltre essere acquistati e attivati singolarmente, nel rispetto delle dipendenze.

Ogni bundle definisce una configurazione iniziale consigliata, non un confine tecnico rigido: i moduli possono essere estesi e, dove previsto commercialmente, disattivati senza cancellare dati.

## Principi di prodotto

### Modularità per azienda

Ogni azienda vede e usa solo i moduli attivati. L'attivazione governa navigazione, route, Server Actions, automazioni, permessi e report ordinari. La disattivazione nasconde e blocca il modulo, ma non cancella i dati.

### Multi-azienda

Uno stesso utente può appartenere a più aziende tramite Membership e scegliere l'azienda attiva. Ruoli, permessi, moduli e dati sono valutati nel contesto dell'azienda corrente.

### Multi-sede

Una Company può gestire più sedi operative. Le entità che hanno significato locale devono poter essere assegnate a una sede, mentre configurazioni e anagrafiche condivise restano a livello aziendale. L'accesso a una sede non sostituisce mai il controllo aziendale.

Nella V1 gli utenti sono assegnabili a una o più sedi e operano su una sede attiva. Magazzini, casse, prenotazioni e report sono collegati alla sede. Consolidamento societario e flussi complessi fra società diverse non rientrano nella V1.

### Isolamento tenant

La Company è il confine del tenant. Ogni accesso a dati aziendali deve derivare `companyId` dalla sessione verificata e applicarlo a query e mutazioni. Identificativi forniti dal client non sono prova di appartenenza.

### Estensibilità

Nuovi moduli e futuri verticali devono poter essere aggiunti attraverso contratti stabili: codice modulo univoco, dipendenze dichiarate, permessi espliciti, route dedicate, eventi o servizi condivisi e ownership chiara dei dati. Il Core non deve dipendere dai verticali.

## Cosa non deve diventare

Nexus ERP non deve diventare:

- un'interfaccia sovraccarica con tutte le funzioni sempre visibili;
- un monolite nel quale ogni verticale conosce e richiama direttamente gli altri;
- un insieme di tre applicazioni e codebase separate;
- un sistema con regole fiscali, tracciati o fornitori esterni hardcoded e non aggiornabili;
- un catalogo di funzionalità privo di confini, dipendenze e responsabilità.

## Indicatori di coerenza

Una scelta di prodotto è coerente quando può essere attivata per Company, conserva l'isolamento tenant, ha ownership chiara, riusa il Core senza duplicarlo e non espone complessità alle aziende che non la utilizzano.

## Documenti correlati

- [Requisiti funzionali](FUNCTIONAL_REQUIREMENTS.md)
- [Catalogo moduli](MODULE_CATALOG.md)
- [Dipendenze fra moduli](MODULE_DEPENDENCIES.md)
- [Architettura](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Decisioni architetturali](DECISIONS.md)
