# Piano — Modulo finanziario (fatture fornitori, cassa, riconciliazione)

> Scritto il 2026-09-30 per non perdere il piano una seconda volta se la sessione cade.
> Nasce da una code review completa del modulo finanziario (24 difetti) e da questo
> piano a 7 blocchi, approvato dall'utente. Il blocco 1 è l'unico eseguito finora.

## Perimetro

Nexus **non emette documenti fiscali**: gli scontrini li fa il POS, le fatture le emette
il commercialista. Il modulo finanziario copre solo quattro esigenze:

1. Registrare le fatture fornitori con le loro scadenze.
2. Saldi e previsioni di cassa.
3. Riconciliazione bancaria.
4. Consultare e scaricare tutte le fatture, ricevute ed emesse (già scaricate in XML
   dal portale dell'Agenzia delle Entrate).

**Fuori perimetro, esplicitamente:** SDI, generazione PDF, emissione di fatture.

## Decisioni già prese

- Parsing XML con **fast-xml-parser**.
- Le righe importate puntano a un **Item generico di sistema**: l'import non tocca mai
  il magazzino.
- Estrazione dei file **.p7m** con **openssl** (nessuna libreria CMS aggiuntiva).
- Gli allegati (XML, PDF, .p7m) vivono **dentro Postgres**, non su filesystem.
- **Whitelist** dei `TipoDocumento` FatturaPA in ingresso, con **rifiuto esplicito e
  motivo** per i tipi non gestiti — nessun best-effort silenzioso.
- Il controllo sullo scoperto (`allowOverdraft`) resta un **avviso**, non un blocco: il
  saldo si riallinea a mano con movimenti di rettifica.

## I 7 blocchi

### Blocco 1 — correzioni a basso costo che bloccano tutto il resto

**Stato:** eseguito in questa sessione.

- `app/(dashboard)/purchases/actions.ts`: `redirect()` di successo chiamato dentro il
  `try` in `savePurchaseAction` e `purchaseOperationAction`. Next.js impone che
  `redirect()` sia chiamato **fuori** dal `try` (lancia `NEXT_REDIRECT`, che il `catch`
  locale intercetta come errore applicativo). Ogni operazione riuscita veniva
  rediretta come se fosse fallita.
- `app/(dashboard)/treasury/actions.ts`: 7 azioni senza `try/catch` — `createAccountAction`,
  `registerMovementAction`, `movementOperationAction`, `createTransferAction`,
  `completeTransferAction`, `importStatementAction`, `reconciliationAction`. Le altre 3
  azioni del file hanno già il pattern corretto (redirect di errore nel catch, redirect
  di successo fuori tramite `finish()`); queste 7 vanno allineate allo stesso pattern.
- `lib/treasury.ts`, `generateSchedulesForPostedDocument`: la `direction` per una nota
  di credito d'acquisto risultava `PAYABLE` (stessa direzione di una fattura passiva)
  invece di `RECEIVABLE` — ogni resa a fornitore gonfiava il debito invece di ridurlo.

### Blocco 2 — `lib/fattura-pa.ts`, parser puro

Modulo **puro**, senza I/O: nessun accesso a Prisma, nessuna migrazione, nessuna UI.

- Parsing dell'XML FatturaPA (fast-xml-parser).
- Mappatura delle righe verso l'Item generico di sistema.
- Determinazione della direzione (fattura vs nota di credito).
- Whitelist dei `TipoDocumento`, con rifiuto esplicito e motivo per i tipi non in whitelist.
- Riepilogo IVA.
- Calcolo delle scadenze dai dati di pagamento della fattura.
- Estrazione della struttura degli allegati (non lo storage: solo cosa c'è da salvare).

Il motivo della separazione: è l'unico pezzo del modulo testabile al 100% senza
database, ed è dove sta la maggior parte del rischio (formati XML eterogenei, casi di
rifiuto, arrotondamenti IVA) — lo stesso approccio che ha funzionato per
`restaurant-seating`.

### Blocco 3 — migrazione + `lib/invoice-import.ts`

Consuma l'output puro del Blocco 2 e lo scrive in **una singola transazione**:
`BusinessDocument` (righe sull'Item generico), `PaymentSchedule`, allegati in Postgres.
Include la migrazione Prisma necessaria.

### Blocco 4 — caricamento massivo, .p7m, download, consultazione

- Caricamento multiplo dei file XML/.p7m.
- Estrazione .p7m via openssl prima del parsing.
- Consultazione e download di tutte le fatture, ricevute ed emesse.

### Blocco 5 — scadenzario fornitori e saldi

Vista consolidata delle scadenze fornitori e dei saldi conti, con avviso (non blocco)
sullo scoperto.

### Blocco 6 — previsioni di cassa

Cash flow previsionale basato sullo scadenzario.

### Blocco 7 — riconciliazione bancaria

## Metodo

Per ogni correzione o blocco: un test che fallisce prima e passa dopo, commit separati.
Il lavoro altrui presente nel working tree (inventory, purchasing, schema) resta fuori
dai commit di questo piano.
