# Kitchen Printing V2

Kitchen Printing V2 estende l'engine esistente `KitchenDispatch` → `KitchenTicket` → `KitchenPrintJob`. Non introduce un secondo engine e non modifica il percorso fiscale. Il payload UTF-8 nasce esclusivamente dallo snapshot persistito nel ticket; modifiche successive a ordine, catalogo o note non cambiano un job già creato.

Ogni stampante dichiara una modalità. `LEGACY_FUSION` rappresenta esclusivamente Nexus → FUSION XML1745 → PT15 → KUBEIIx-F: le note restano nello snapshot Nexus, ma XML1745 non le contiene e Nexus non effettua alcun accesso hardware diretto alla KUBE. `NEXUS_DIRECT` è riservata a una stampante cucina non fiscale e usa il ticket Nexus completo. La combinazione `NEXUS_DIRECT` + `FISCAL` è respinta con `DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN` in configurazione e nuovamente al claim/processo.

## Sequenza e stati

Quando un dispatch comprende una destinazione `LEGACY_FUSION`, i suoi job legacy partono in `PENDING`, mentre le destinazioni `NEXUS_DIRECT` correlate partono `BLOCKED`. Solo l'ACK certo di tutte le destinazioni legacy porta il dispatch a `ACCEPTED` e sblocca atomicamente i job diretti. `REJECTED` e `UNCERTAIN` sono terminali per quel tentativo e lasciano la stampa diretta bloccata: niente stampa e niente reinvio automatico. Un dispatch con sole destinazioni dirette non richiede FUSION.

Il routing Item/Category → KitchenStation continua a decidere la destinazione di ogni riga. CUCINA, BAR, PASS, PIZZERIA e DOLCI possono quindi usare modalità differenti senza distribuire indiscriminatamente ogni pietanza a tutte le stampanti.

Il connector acquisisce solo job `PENDING`, che diventano `PROCESSING`. Un ACK li porta a `PRINTED`. Un errore certamente precedente al write li porta a `FAILED`, stato dal quale è ammesso un retry esplicito e controllato. Dopo l'inizio del write, assenza di esito certo porta a `UNCERTAIN`: il job non viene rimesso in coda, neppure dopo lease scaduta, restart o reconnect. L'operatore deve verificare fisicamente la stampante.

La chiave unica della stampa normale è `companyId:dispatchId:printerId:PRINT`. Click ripetuti e refresh convergono sullo stesso dispatch/job. Una ristampa autorizzata crea invece un nuovo job `REPRINT`, riferito all'originale, con motivo, utente, timestamp e audit; il payload reca `*** RISTAMPA ***`.

## Connector e driver

Il claim restituisce `jobId`, `printerId`, `idempotencyKey`, `payload`, `payloadHash` SHA-256 e i dati di lease. Gli esiti logici sono `PRINTED`, `FAILED_BEFORE_WRITE` e `UNCERTAIN_AFTER_WRITE`; l'acquisizione del job costituisce `ACCEPTED`. Il server valida ownership, tenant, stampante, lease e transizione.

Il dominio resta UTF-8. Il modello prepara `MOCK`, `ESC_POS_TCP`, `ESC_POS_USB`, `ESC_POS_SERIAL` e `VENDOR_SPECIFIC`, oltre a host, porta, connessione, larghezza carta, caratteri per riga ed encoding. Questa release implementa soltanto il simulatore/mock: conversioni in codepage e protocolli hardware spettano a un futuro adapter certificato. Non sono configurati IP, porte o device reali.

## Policy anti-duplicazione e cutover futuro

La stampa cucina FUSION e la stampa completa Nexus non devono restare entrambe attive a regime. Il cutover futuro richiede, nell'ordine:

1. installazione della nuova stampante non fiscale;
2. test Nexus isolato;
3. verifica del ticket;
4. verifica delle note, incluse multilinea e caratteri italiani;
5. verifica di idempotenza, restart e casi incerti;
6. cutover controllato in una finestra concordata;
7. disattivazione, secondo procedura approvata dal vendor, della vecchia stampa cucina;
8. conferma che Nexus è l'unica sorgente del ticket cucina.

Questo repository non esegue il cutover, non contatta FUSION/POS/KUBE/Realme live e non stampa su hardware.
