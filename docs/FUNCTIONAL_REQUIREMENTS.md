# Requisiti funzionali

## Classificazione

La classificazione esprime la priorità di prodotto, non lo stato di implementazione:

| Classe | Significato |
| --- | --- |
| `CORE` | Fondazione trasversale necessaria alla piattaforma o a tutti i verticali |
| `V1` | Ambito minimo del relativo modulo o verticale |
| `V2` | Evoluzione successiva al primo rilascio operativo |
| `FUTURE` | Opzione strategica non pianificata nelle prime release |

## A. Nexus Core

| Funzione | Classe | Requisito sintetico |
| --- | --- | --- |
| Autenticazione | CORE | Accesso e sessioni sicure con Auth.js |
| Utenti | CORE | Profilo, stato e preferenze personali |
| Membership | CORE | Relazione utente-azienda e azienda predefinita |
| Aziende | CORE | Dati legali, operativi e localizzazione |
| Sedi | CORE | Unità operative appartenenti a una Company |
| Assegnazioni utenti-sedi | CORE | Accesso a una o più sedi per Membership |
| Sede attiva | CORE | Contesto operativo corrente, subordinato alla Company |
| Ruoli | CORE | Ruoli valutati nel contesto della Membership |
| Permessi | CORE | Autorizzazioni granulari per azione e modulo |
| Azienda attiva | CORE | Selezione esplicita del tenant corrente |
| Moduli attivi | CORE | Attivazione, dipendenze e stato per Company |
| Partner | CORE | Anagrafica unica tenant-scoped per persone e organizzazioni, con codice interno, qualifiche multiple e soft delete |
| Clienti | CORE | Qualifica e dati commerciali dei Partner clienti |
| Fornitori | CORE | Qualifica e dati commerciali dei Partner fornitori |
| Lead e prospect | CORE | Qualifiche commerciali combinabili sulla stessa anagrafica Partner |
| Collaboratori, agenti, trasportatori e professionisti | V1 | Qualifiche operative riusate dai moduli condivisi e verticali |
| Contatti | V1 | Referenti e recapiti collegati ai Partner |
| Catalogo Item condiviso | CORE | Entità commerciale tenant-scoped comune a prodotti, servizi e profili verticali, con codice aziendale, prezzi, categorie, unità, IVA, audit e soft delete |
| Configuration Engine | CORE | CRUD uniforme tenant-scoped per categorie Item, unità di misura, aliquote IVA, listini, metodi e condizioni di pagamento |
| Listini prezzi | CORE | Più listini per Company e più prezzi per Item mediante righe listino, senza duplicare il catalogo |
| Condizioni di pagamento | CORE | Scadenza immediata, 30/60/90 giorni, fine mese e piani rateali personalizzati validati |
| Prodotti | CORE | Item fisici venduti, acquistati o predisposti alla gestione stock |
| Servizi | CORE | Item non inventariabili con durata, capacità e requisito appuntamento opzionali |
| Listini | V1 | Prezzi, validità, valuta e condizioni |
| Vendite | V1 | Ciclo commerciale attivo e relativi stati |
| Acquisti | V1 | Ciclo passivo e relativi stati |
| Inventory Engine | V1 | Sedi, magazzini, ubicazioni, ledger immutabile, lotti/seriali, trasferimenti, inventari, disponibilità e valorizzazione a costo medio |
| Pagamenti | V1 | Scadenze, incassi, pagamenti e riconciliazione base |
| Tesoreria di base | V2 | Conti, saldi e previsione dei flussi |
| Documenti | CORE | Metadati, numerazione, stati e collegamenti |
| Allegati | CORE | File associati a entità autorizzate |
| Notifiche di sistema | CORE | Avvisi applicativi essenziali e preferenze |
| Audit log | CORE | Traccia immutabile delle operazioni rilevanti |
| Import/export | V2 | Scambi controllati, validati e tracciati |
| Dashboard base | CORE | Indicatori essenziali pertinenti ai moduli attivi |
| Report | V1 | Report tenant-scoped ed esportabili |
| Configurazioni fiscali italiane | V1 | Regole e tracciati versionati per validità |
| Ricerca globale | V2 | Ricerca autorizzata nei soli moduli attivi |
| API e integrazioni | V2 | API, webhook, credenziali e sincronizzazioni governate |
| Prima nota | V1 | Registrazioni semplici collegate a documenti e pagamenti |
| Scadenziario | V1 | Scadenze attive e passive con stato e solleciti |
| Riconciliazione bancaria | V1 | Abbinamento controllato fra movimenti e operazioni |
| Report contabili essenziali | V1 | Situazione incassi, pagamenti, scadenze e prima nota |
| Export per commercialista | V1 | Esportazione verificabile in formati concordati |

### Perimetro contabile V1

La V1 comprende prima nota, incassi e pagamenti, scadenziario, riconciliazione bancaria, report essenziali ed export per il commercialista. Sono esclusi paghe, dichiarazioni fiscali, bilancio civilistico completo e adempimenti fiscali avanzati proprietari.

### Priorità delle integrazioni

| Ordine | Integrazione | Obiettivo |
| --- | --- | --- |
| 1 | Email SMTP | Invii transazionali e notifiche |
| 2 | Excel/CSV | Import ed export operativi |
| 3 | Fatturazione elettronica | Provider esterno e contratto versionato |
| 4 | Pagamenti online | Incassi e riconciliazione |
| 5 | WhatsApp | Comunicazioni consenzienti |
| 6 | Open banking | Movimenti e riconciliazione bancaria |
| 7 | POS e registratore telematico | Cassa e corrispettivi tramite adapter |
| 8 | Booking engine e channel manager | Distribuzione Hotel |

## B. Verticale Restaurant

| Funzione | Classe | Requisito sintetico |
| --- | --- | --- |
| Sala | V1 | Gestione operativa del servizio |
| Tavoli | V1 | Tavoli, capienza, stato e assegnazione |
| Aree | V1 | Zone della sala e ordinamento |
| Prenotazioni | V1 | Disponibilità, assegnazione e stato |
| Comande | V1 | Ordini per tavolo, asporto o consegna |
| Cucina | V1 | Flusso di preparazione e avanzamento |
| Stampanti | V1 | Instradamento comande verso reparti/dispositivi |
| Menu | V1 | Menu con validità e disponibilità |
| Categorie menu | V1 | Organizzazione delle voci |
| Varianti | V1 | Opzioni, supplementi ed esclusioni |
| Allergeni | V1 | Informazioni obbligatorie e consultabili |
| Ricette | V1 | Distinta ingredienti per piatto |
| Ingredienti | V1 | Prodotti alimentari usati nelle ricette |
| Grammature | V1 | Quantità e unità standard |
| Food cost | V1 | Costo teorico e marginalità del piatto |
| Preparazioni | V2 | Semilavorati, rese e cicli di produzione |
| Magazzino alimentare | V1 | Scorte e movimenti specifici |
| Lotti | V2 | Tracciabilità per lotto |
| Scadenze | V2 | Date, alert e priorità di consumo |
| Sprechi | V2 | Causali e quantità scartate |
| Inventari | V1 | Conteggi e rettifiche controllate |
| Cassa | V1 | Chiusura conto e riepilogo operativo |
| POS | V1 | Integrazione con sistemi di cassa/pagamento |
| Corrispettivi | V2 | Trasmissione tramite integrazioni fiscali versionate |
| Takeaway | V1 | Ordini con ritiro e fascia oraria |
| Delivery | V2 | Consegne e integrazioni con piattaforme |
| Fidelity | V2 | Raccolta e utilizzo benefici |
| Gift card | V2 | Emissione, saldo e utilizzo |
| Eventi | V2 | Menu, capienza e prenotazioni dedicate |
| Statistiche per piatto | V2 | Volumi, margini e andamento |
| Statistiche per cameriere | V2 | Indicatori operativi autorizzati |
| Statistiche per fascia oraria | V2 | Coperti, vendite e carico |

## C. Verticale Hotel

| Funzione | Classe | Requisito sintetico |
| --- | --- | --- |
| Strutture | V1 | Proprietà ricettive e configurazioni |
| Camere | V1 | Unità vendibili e stato operativo |
| Tipologie | V1 | Classi di camera e capacità |
| Disponibilità | V1 | Inventario per data e tipologia |
| Calendario | V1 | Vista operativa di soggiorni e blocchi |
| Prenotazioni | V1 | Soggiorni, occupanti, canale e stato |
| Ospiti | V1 | Anagrafiche e associazione ai soggiorni |
| Check-in | V1 | Arrivo, assegnazione e adempimenti |
| Check-out | V1 | Partenza, saldo e chiusura |
| Tariffe | V1 | Piani tariffari e regole base |
| Stagionalità | V2 | Periodi, restrizioni e prezzi |
| Caparre | V1 | Richiesta, registrazione e imputazione |
| Cancellazioni | V1 | Policy, penali e rilascio disponibilità |
| No-show | V1 | Stato, addebiti e storico |
| Housekeeping | V1 | Stato camere e attività di pulizia |
| Manutenzione | V2 | Fuori servizio, ticket e interventi |
| Minibar | V2 | Consumi addebitati al soggiorno |
| Servizi extra | V1 | Extra prenotabili e addebitabili |
| Fatturazione soggiorni | V1 | Conto ospite collegato al Core documentale |
| Portale ospite | FUTURE | Self-service pre-arrivo e soggiorno |
| Sale eventi | V2 | Disponibilità, configurazioni e servizi |
| Integrazione booking engine | V2 | Prenotazioni dirette sincronizzate |
| Integrazione channel manager | V2 | Disponibilità, tariffe e prenotazioni |
| Modulo Restaurant collegabile | V2 | Addebito ristorante al conto camera |

## D. Verticale Beauty

| Funzione | Classe | Requisito sintetico |
| --- | --- | --- |
| Agenda | V1 | Vista per data, operatore e risorsa |
| Appuntamenti | V1 | Prenotazione, stato, durata e servizi |
| Operatori | V1 | Disponibilità, competenze e assegnazioni |
| Postazioni | V1 | Risorse condivise prenotabili |
| Cabine | V1 | Ambienti prenotabili e compatibilità |
| Servizi | V1 | Prestazioni erogate dal catalogo Core |
| Durata servizi | V1 | Durata standard e personalizzabile |
| Listini | V1 | Prezzi per servizio, sede e validità |
| Scheda cliente | V1 | Profilo operativo collegato al Partner |
| Storico trattamenti | V1 | Prestazioni, note e prodotti usati |
| Foto lavori | V2 | Immagini protette e autorizzate |
| Consensi | V1 | Versione, finalità, raccolta e revoca |
| Pacchetti | V1 | Crediti o prestazioni prepagate |
| Abbonamenti | V2 | Ricorrenza, plafond e validità |
| Gift card | V2 | Emissione, saldo e utilizzo |
| Fidelity | V2 | Regole punti e benefici |
| Acconti | V1 | Incasso e imputazione all'appuntamento |
| No-show | V1 | Stato, policy e storico |
| Prenotazione online | V2 | Disponibilità pubblica controllata |
| Prodotti venduti | V1 | Vendita retail collegata al Core |
| Prodotti consumati | V1 | Scarico tecnico per trattamento |
| Magazzino | V1 | Disponibilità e movimenti per sede |
| Commissioni operatori | V2 | Regole e calcolo verificabile |
| Promemoria | V1 | Notifiche transazionali appuntamento |
| Richiami periodici | V2 | Follow-up basati su regole e consenso |
| Campagne | FUTURE | Segmentazione e comunicazioni consenzienti |

## Regole trasversali di accettazione

Ogni funzione deve rispettare tenant, sede quando applicabile, moduli attivi e permessi. Le operazioni sensibili producono audit; gli export applicano le stesse autorizzazioni delle viste. Dati fiscali, consensi e integrazioni conservano versione e periodo di validità.

Il catalogo Item è condiviso: `PRODUCT`, `SERVICE`, `INGREDIENT`, `RECIPE`, `BEAUTY_SERVICE`, `HOTEL_ROOM`, `PACKAGE` e `GIFT_CARD` riusano dati comuni e profili specifici. Item rappresenta ciò che viene venduto, acquistato, consumato o configurato; non rappresenta una comanda, un appuntamento, una prenotazione o un soggiorno. Componenti Recipe/Package, categorie, unità e IVA devono appartenere alla stessa Company.

La retention è sempre governata da policy esplicite: audit operativo configurabile con valore iniziale di 10 anni; documenti fiscali secondo gli obblighi applicabili, preferibilmente mediante provider di conservazione; foto Beauty legate a consenso e retention configurabile; dati ospiti Hotel distinti per finalità. Si preferiscono eliminazione logica e anonimizzazione e non si eseguono cancellazioni automatiche in assenza di policy.

Le configurazioni sono amministrabili solo nel tenant e con modulo/ruolo adeguato. Codice e nome sono ricercabili, stato e lifecycle filtrabili, l'eliminazione è sempre logica e il ripristino conserva i riferimenti. Partner e Item accettano esclusivamente identificativi di configurazioni attive appartenenti alla Company corrente.

Inventory considera autoritativo il ledger dei movimenti posted. I saldi materializzati sono una cache transazionale ricostruibile; non sono modificabili dal client. La V1 misura stock reale contabilizzato e costo medio ponderato per magazzino e Item: stock prenotato, disponibile e futuro saranno separati quando esisteranno i documenti sorgente. Non sono generate scritture contabili. Correzioni, trasferimenti e differenze inventariali producono nuovi movimenti e outbox event, senza modifica o cancellazione del ledger.

Vedere [Catalogo moduli](MODULE_CATALOG.md), [Dipendenze](MODULE_DEPENDENCIES.md) e [Roadmap](ROADMAP.md).
