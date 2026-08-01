# Roadmap di prodotto

La roadmap definisce sequenza e criteri, non date contrattuali. L'ordine definitivo dei verticali è Restaurant, Beauty, Hotel. Ogni fase eredita i requisiti di sicurezza, tenancy, audit e qualità delle precedenti.

## Fase 0 — Fondazioni già presenti

**Obiettivo.** Consolidare la base tecnica e descrivere fedelmente ciò che esiste.

**Dipendenze.** Nessuna.

**Deliverable.** Next.js App Router, Prisma, PostgreSQL, Auth.js, modelli Company/Membership/ruoli, Partner foundation e documentazione di baseline.

**Completamento.** Login e sessione operativi; utente associato a Company; Partner creato con `companyId`; schema e ambiente riproducibili.

**Rischi.** Confondere foundation con funzionalità completa; DBML storico non allineato allo schema Prisma; autorizzazioni ancora da irrobustire.

**Escluso.** Dichiarare pronti moduli non esistenti, redesign di autenticazione o implementazione dei verticali.

## Fase 1 — Core operativo

**Obiettivo.** Rendere governabile una piattaforma modulare e multi-azienda.

**Dipendenze.** Fase 0.

**Deliverable.** Sistema moduli e bundle; Configuration Engine condiviso per categorie, unità, IVA, listini, metodi e condizioni di pagamento; più sedi per Company; Inventory Engine con magazzini, ubicazioni, lotti/seriali, ledger, trasferimenti, inventari, saldi e outbox; Unified Document Engine con serie, workflow e outbox; assegnazioni utenti-sedi e sede attiva; ruoli e permessi granulari; Partner completo; catalogo Item condiviso con prodotti, servizi e profili verticali; allegati; audit minimo con retention configurabile; notifiche di sistema; dashboard base; email SMTP ed Excel/CSV.

**Completamento.** Core obbligatorio attivo; bundle conviventi e moduli singoli attivabili; controlli tenant/modulo/permesso/sede su route e mutazioni; utenti multi-sede; magazzini, casse, prenotazioni e report scoped per sede; nessuna funzione inattiva visibile; audit dei casi critici; test di isolamento.

**Rischi.** Autorizzazione dispersa nella UI; permessi troppo generici; catalogo Core sovradimensionato.

**Escluso.** Contabilità completa, consolidamento societario, flussi complessi fra società diverse, automazioni avanzate, BI e implementazioni verticali.

## Fase 2 — Verticale Restaurant MVP

**Obiettivo.** Coprire il ciclo operativo essenziale del ristorante.

**Dipendenze.** Fase 1; Partner, catalogo, listini, magazzino e integrazioni di base.

**Deliverable.** Prenotazioni; menu, categorie, varianti e allergeni; ricette, grammature e food cost; sala, tavoli e comande; cucina; cassa tramite integrazione.

**Completamento.** Dalla prenotazione alla chiusura conto il flusso è tracciato; una ricetta calcola costo e scarico; cucina riceve e avanza comande; integrazione cassa gestisce errori e idempotenza.

**Rischi.** Hardware eterogeneo, latenza in sala, fiscalità confusa con il gestionale, unità di misura incoerenti.

**Escluso.** Delivery multi-provider, loyalty avanzata, eventi e BI predittiva.

## Fase 3 — Verticale Beauty MVP

**Obiettivo.** Gestire appuntamenti e relazione operativa con il cliente.

**Dipendenze.** Fase 1; Partner, servizi, listini, pagamenti e notifiche.

**Deliverable.** Agenda; operatori, cabine e postazioni; servizi e durate; appuntamenti; pacchetti; promemoria; scheda cliente, trattamenti e consensi.

**Completamento.** Assenza di sovrapposizioni non ammesse; appuntamento completo dalla prenotazione alla prestazione; pacchetti con saldo verificabile; promemoria consenzienti e auditati.

**Rischi.** Privacy di note e foto, calendari concorrenti, regole commissioni premature.

**Escluso.** Campagne, booking marketplace, commissioni complesse e loyalty avanzata.

## Fase 4 — Verticale Hotel MVP

**Obiettivo.** Coprire inventario camere e soggiorno.

**Dipendenze.** Fase 1; Partner, catalogo, listini, documenti e pagamenti.

**Deliverable.** Strutture, tipologie e camere; disponibilità e calendario; prenotazioni e ospiti; check-in/check-out; housekeeping.

**Completamento.** Disponibilità coerente sotto concorrenza; prenotazione trasformata in soggiorno; conto ospite chiudibile; stato camera sincronizzato con housekeeping.

**Rischi.** Overbooking, gestione dati ospiti, complessità tariffaria, perimetro degli adempimenti.

**Escluso.** Channel manager, booking engine, portale ospite, revenue management e collegamento Restaurant.

## Fase 5 — Amministrazione

**Obiettivo.** Collegare operatività e gestione economico-finanziaria italiana.

**Dipendenze.** Core operativo stabilizzato e contratti documentali dei verticali.

**Deliverable.** Vendite, acquisti, fatturazione elettronica tramite provider esterno, prima nota, incassi e pagamenti, scadenziario, riconciliazione bancaria, report essenziali, export per commercialista e open banking.

**Completamento.** Cicli attivo/passivo riconciliabili; prima nota e scadenziario verificabili; riconciliazione bancaria operativa; export validato con commercialisti; numerazioni e regole temporali corrette; trasmissioni idempotenti e osservabili.

**Rischi.** Evoluzione normativa, confini con software contabile, responsabilità dei provider esterni.

**Escluso.** Paghe, dichiarazioni fiscali, bilancio civilistico completo, adempimenti fiscali avanzati proprietari e consulenza fiscale automatizzata.

## Fase 6 — Espansione

**Obiettivo.** Aumentare relazione, automazione e capacità decisionale.

**Dipendenze.** Dati affidabili, permessi granulari, audit e API stabili.

**Deliverable.** CRM, BI, portali, automazioni e funzionalità AI assistive.

**Completamento.** Metriche governate; automazioni idempotenti e disattivabili; portali isolati; AI con autorizzazioni, fonti e revisione umana esplicite.

**Rischi.** Scope creep, qualità dati, costi operativi, privacy e risultati AI non verificati.

**Escluso.** Autonomia decisionale senza controllo umano, nuovi verticali non validati e personalizzazioni che biforcano la codebase.

## Gate trasversali

Una fase non è completa senza documentazione aggiornata, test di isolamento tenant, verifica dei moduli disattivati, audit delle operazioni sensibili, gestione errori e osservabilità adeguata. Le decisioni definitive sono registrate in [Decisioni](DECISIONS.md); il perimetro funzionale è in [Requisiti](FUNCTIONAL_REQUIREMENTS.md).

## Sequenza delle integrazioni

La priorità trasversale è: email SMTP; Excel/CSV; fatturazione elettronica tramite provider esterno; pagamenti online; WhatsApp; open banking; POS e registratore telematico; booking engine e channel manager. Una fase può preparare i contratti delle integrazioni successive, ma non ne anticipa la priorità di prodotto.
