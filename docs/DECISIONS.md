# Registro delle decisioni architetturali

Gli ADR sono accettati come baseline di prodotto. Un cambiamento richiede un nuovo ADR che sostituisca il precedente, senza riscriverne la storia.

## ADR-001: una sola piattaforma, tre verticali

**Contesto.** Restaurant, Hotel e Beauty condividono numerosi processi, ma richiedono profondità operative diverse.

**Decisione.** Costruire un'unica piattaforma con Nexus Core e tre verticali espliciti.

**Conseguenze.** Identità, tenancy e servizi comuni restano coerenti; servono confini forti per evitare contaminazione.

**Alternative rifiutate.** ERP generalista senza verticali; aggregazione informale di funzionalità.

## ADR-002: moduli attivabili per azienda

**Contesto.** Aziende diverse necessitano capacità diverse e non devono vedere complessità inutile.

**Decisione.** Attivare moduli e relative dipendenze per Company mediante codici stabili.

**Conseguenze.** UI, route, action, automazioni, permessi e report devono consultare lo stato effettivo.

**Alternative rifiutate.** Attivazione globale; sola feature flag UI; configurazione per utente.

## ADR-003: multi-azienda tramite Membership

**Contesto.** Un'identità può operare per più aziende con responsabilità differenti.

**Decisione.** Modellare l'appartenenza con Membership fra User e Company e un contesto aziendale attivo.

**Conseguenze.** Ruoli e accesso dipendono dalla Membership; il cambio Company deve essere verificato.

**Alternative rifiutate.** Duplicare l'utente per azienda; memorizzare un solo `companyId` permanente su User.

## ADR-004: isolamento tenant tramite companyId

**Contesto.** Una fuga di dati fra aziende è un rischio critico.

**Decisione.** Ogni dato aziendale è scoped direttamente o inequivocabilmente tramite `companyId`, derivato dal server.

**Conseguenze.** Query, mutation, cache, job, file e test includono il tenant; gli ID client non determinano ownership.

**Alternative rifiutate.** Filtraggio solo in UI; database separato per ogni Company nella fase attuale; scope implicito non verificabile.

## ADR-005: ruoli e permessi nel contesto aziendale

**Contesto.** Lo stesso utente può avere compiti diversi in aziende diverse.

**Decisione.** Assegnare ruoli alla Membership e valutare permessi, modulo e sede nel contesto corrente.

**Conseguenze.** Nessun ruolo attraversa implicitamente Company; i permessi dei moduli inattivi sono inefficaci.

**Alternative rifiutate.** Ruolo globale su User; controllo basato soltanto su nomi di ruolo.

## ADR-006: dati non cancellati quando un modulo viene disattivato

**Contesto.** I dati possono avere valore storico, contabile o legale e il modulo può essere riattivato.

**Decisione.** La disattivazione blocca uso ed esposizione ordinaria, ma conserva i dati.

**Conseguenze.** Servono lifecycle per job, consultazione amministrativa e retention separata.

**Alternative rifiutate.** Cancellazione a cascata; archiviazione automatica irreversibile; mantenere operativo il modulo in sola lettura per tutti.

## ADR-007: fiscalità e integrazioni esterne versionabili

**Contesto.** Norme, tracciati, dispositivi e API cambiano nel tempo.

**Decisione.** Versionare regole e contratti con periodo di validità e isolare provider dietro adapter.

**Conseguenze.** I documenti conservano la versione applicata; aggiornamenti e transizioni sono testabili e auditabili.

**Alternative rifiutate.** Logica hardcoded nelle action; un solo tracciato mutabile; chiamate dirette ai provider dai domini.

## ADR-008: niente tre codebase separate

**Contesto.** Codebase distinte duplicherebbero Core, sicurezza e integrazioni.

**Decisione.** Mantenere un solo repository e runtime applicativo, con separazione logica dei verticali.

**Conseguenze.** Release e standard restano comuni; i confini devono essere verificabili nell'organizzazione del codice.

**Alternative rifiutate.** Tre applicazioni indipendenti; fork per cliente o verticale.

## ADR-009: niente funzionalità non attive visibili in UI

**Contesto.** Menu inutili aumentano rumore e suggeriscono accessi non acquistati o non configurati.

**Decisione.** Sidebar, ricerca, dashboard e link mostrano solo moduli attivi e autorizzati.

**Conseguenze.** La navigazione è derivata dal registry; resta comunque obbligatoria la protezione server.

**Alternative rifiutate.** Mostrare tutto disabilitato; nascondere solo le pagine finali; affidarsi al ruolo senza verificare il modulo.

## ADR-010: Core condiviso, verticali separati logicamente

**Contesto.** Il riuso è necessario, ma dipendenze indiscriminate formerebbero un monolite.

**Decisione.** Il Core non dipende dai verticali; ogni verticale possiede dominio e dati e comunica tramite contratti espliciti.

**Conseguenze.** I collegamenti trasversali richiedono servizi o eventi versionati; non sono ammessi accessi opportunistici alle tabelle altrui.

**Alternative rifiutate.** Modello dominio unico senza ownership; duplicazione del Core in ciascun verticale; import circolari.

## ADR-011: Core sempre attivo e bundle commerciali conviventi

**Contesto.** Il prodotto richiede una base uniforme, offerte comprensibili e configurazioni adatte ad aziende ibride.

**Decisione.** Nexus Core è sempre attivo. Restaurant, Beauty e Hotel sono bundle verticali; più bundle possono convivere nella stessa Company. I moduli opzionali possono essere acquistati e attivati singolarmente.

**Conseguenze.** Il catalogo distingue obbligatorietà, default di bundle e dipendenze; Hotel e Restaurant possono collaborare senza fondere i domini.

**Alternative rifiutate.** Un solo bundle esclusivo per Company; tre prodotti separati; ogni capacità sempre inclusa.

## ADR-012: ordine Restaurant, Beauty, Hotel

**Contesto.** La sequenza dei verticali era definita nella roadmap ma non formalizzata come priorità definitiva.

**Decisione.** Sviluppare prima Restaurant, poi Beauty e infine Hotel.

**Conseguenze.** Core e integrazioni sono pianificati per non favorire scorciatoie specifiche del primo verticale.

**Alternative rifiutate.** Sviluppo parallelo dei tre MVP; Hotel prima di Beauty.

## ADR-013: perimetro contabile V1

**Contesto.** Le aziende necessitano operatività amministrativa utile senza costruire subito una suite fiscale completa.

**Decisione.** La V1 include prima nota, incassi e pagamenti, scadenziario, riconciliazione bancaria, report essenziali ed export per commercialista.

**Conseguenze.** Paghe, dichiarazioni fiscali, bilancio civilistico completo e adempimenti fiscali avanzati proprietari restano esclusi.

**Alternative rifiutate.** Contabilità enterprise completa in V1; sola esportazione senza strumenti amministrativi interni.

## ADR-014: sequenza delle integrazioni

**Contesto.** Le integrazioni hanno dipendenze e valore diversi e non possono essere affrontate simultaneamente.

**Decisione.** L'ordine è: email SMTP; Excel/CSV; fatturazione elettronica tramite provider esterno; pagamenti online; WhatsApp; open banking; POS e registratore telematico; booking engine e channel manager.

**Conseguenze.** Adapter e contratti restano estensibili, ma la roadmap assegna capacità secondo questo ordine.

**Alternative rifiutate.** Priorità guidata dal singolo verticale; implementazione diretta senza provider o adapter.

## ADR-015: retention esplicita per finalità

**Contesto.** Audit, documenti fiscali, immagini Beauty e dati ospiti hanno basi e obblighi diversi.

**Decisione.** L'audit operativo ha retention configurabile con valore iniziale di 10 anni; i documenti fiscali seguono gli obblighi applicabili, preferibilmente tramite provider di conservazione; le foto Beauty dipendono da consenso e retention configurabile; i dati ospiti Hotel hanno retention distinta per finalità. Si preferiscono eliminazione logica e anonimizzazione.

**Conseguenze.** Nessuna cancellazione automatica avviene senza policy esplicita; policy, esecuzioni ed eccezioni sono auditabili.

**Alternative rifiutate.** Un'unica retention globale; conservazione indefinita; cancellazione automatica implicita.

## ADR-016: multi-sede operativo nella V1

**Contesto.** Le aziende possono avere più unità operative già dal primo rilascio.

**Decisione.** La V1 supporta più sedi per Company, utenti assegnati a una o più sedi, sede attiva e collegamento di magazzini, casse, prenotazioni e report alla sede.

**Conseguenze.** Ogni controllo di sede resta subordinato al tenant; consolidamento societario e flussi complessi fra società diverse sono esclusi.

**Alternative rifiutate.** Una sola sede in V1; sede come testo libero; consolidamento multi-società anticipato.

## ADR-017: catalogo Item condiviso con profili specifici

**Contesto.** Nexus Core e i verticali vendono, acquistano o consumano oggetti diversi, ma identità commerciale, prezzi, categorie, unità e fiscalità sono comuni. Tabelle catalogo separate produrrebbero duplicazioni e impedirebbero composizioni trasversali.

**Decisione.** Usare un solo `Item` tenant-scoped per prodotti, servizi, ingredienti, ricette, trattamenti Beauty, camere Hotel vendibili, pacchetti e gift card. I campi comuni restano su Item; i dati specifici vivono in profili uno-a-uno. Recipe e Package compongono altri Item attraverso righe tenant-safe. Nella V1 `HOTEL_ROOM` descrive un'unità o tipologia vendibile, non disponibilità o prenotazioni.

**Conseguenze.** Il Core offre un catalogo coerente e i verticali possono estenderlo senza gonfiare il modello comune. Route, query e action verificano `CORE_PRODUCTS`, modulo specifico del tipo, Company e soft delete. I cambi di tipo dopo la creazione sono rifiutati per non lasciare profili incoerenti.

**Alternative rifiutate.** Cataloghi separati Restaurant/Beauty/Hotel; tabella Item enorme con tutti i campi verticali; ereditarietà senza entità comune; modellare comande, appuntamenti o prenotazioni come Item.

## ADR-018: Configuration Engine tenant-scoped condiviso

**Contesto.** Categorie, unità, IVA, listini e condizioni commerciali sono usate da Core e verticali. CRUD indipendenti produrrebbero logiche divergenti, valori testuali non referenziabili e rischi cross-tenant.

**Decisione.** Adottare un Configuration Engine dichiarativo con registry, servizio e UI condivisi. Tutte le configurazioni hanno codice univoco per Company, audit, stato, soft delete e tenant scope. Partner usa relazioni a listino, metodo e condizione di pagamento; Item usa categoria, unità e IVA e partecipa a più listini tramite `PriceListItem`. Le relazioni includono `companyId` nelle chiavi esterne.

**Conseguenze.** Ricerca, filtri, validazione, autorizzazione e lifecycle hanno comportamento uniforme. Nuove configurazioni si aggiungono estendendo il registry e il modello specifico senza copiare un'intera CRUD. I moduli `CORE_PRODUCTS`, `CORE_PRICE_LISTS` e `CORE_PAYMENTS` restano gate server-side delle rispettive aree.

**Alternative rifiutate.** Tabelle globali condivise fra tenant; campi testo su Partner/Item; una tabella EAV generica; eliminazione fisica; sei CRUD senza contratto comune.

Vedere [Visione](VISION.md), [Architettura](ARCHITECTURE.md) e [Roadmap](ROADMAP.md).
