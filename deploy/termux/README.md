# Connector persistente su Termux

Il connector girava con `npm start` in primo piano e si è fermato tre volte in
pochi giorni. Qui c'è la configurazione che lo tiene su.

## Perché servono entrambi

**Termux:Boot** è solo un lanciatore: esegue gli script in `~/.termux/boot/`
all'avvio del telefono e finisce lì. Se il processo muore un'ora dopo, non se ne
accorge nessuno.

**termux-services** (runit) supervisiona e riavvia, ma non sopravvive a un
riavvio del telefono da solo.

Quindi Termux:Boot avvia runit, e runit tiene in vita il connector. In più il
**wake lock**, senza il quale Android congela il processo a schermo spento — e
un processo congelato non è morto, quindi runit non lo riavvia.

Il single-process non è cosmetico: non c'è alcun lock nel codice, e due processi
condividerebbero spool e **delivery ledger**, il file che impedisce il rinvio
parziale di un multi-PLU già accettato. Corromperlo significa rischiare comande
doppie sul tavolo.

## Nessuna attesa della rete nel launcher

Il `run` non aspetta che l'ERP risponda, per scelta. Il connector aspetta da
solo: dalla correzione dell'heartbeat di avvio, un ERP irraggiungibile non lo
uccide più.

Aspettare qui sarebbe anzi dannoso: `recover()` stampa sul POS le comande già
ricevute **senza bisogno dell'ERP**, e bloccare l'avvio ne ritarderebbe
l'uscita. Se cade la connessione verso la VPS ma il POS è lì, i piatti già
ordinati devono uscire lo stesso.

## Installazione

```sh
pkg install termux-services termux-api
# Termux:Boot va installato da F-Droid, stessa fonte di Termux, e aperto almeno
# una volta, altrimenti Android non gli concede l'avvio automatico.

mkdir -p "$HOME/.config/nexus-kitchen" "$HOME/.local/state/nexus-kitchen"
chmod 700 "$HOME/.config/nexus-kitchen" "$HOME/.local/state/nexus-kitchen"
# Creare $HOME/.config/nexus-kitchen/env con modo 600 — vedi README del
# pacchetto standalone per l'elenco delle variabili. CATALOG_SYNC_ENABLED=false.

SV="$PREFIX/var/service/kitchen-connector"
mkdir -p "$SV/log"
install -m 0755 deploy/termux/service/run     "$SV/run"
install -m 0755 deploy/termux/service/finish  "$SV/finish"
install -m 0755 deploy/termux/service/log/run "$SV/log/run"

mkdir -p ~/.termux/boot
install -m 0755 deploy/termux/boot-10-kitchen-connector ~/.termux/boot/10-kitchen-connector

. $PREFIX/etc/profile.d/start-services.sh
sv up kitchen-connector
```

## Impostazioni Android da controllare (Realme / ColorOS)

Nessuna di queste è opzionale: sono i punti da cui ColorOS può chiudere Termux.
Vanno verificate **per Termux e per Termux:Boot separatamente** — sono due app.

1. **Impostazioni → App → Gestione app → Termux → Batteria → Consumo batteria
   in background → Senza restrizioni** (`Consenti attività in background`).
   ColorOS riporta spesso questa voce a `Ottimizzazione intelligente` dopo un
   aggiornamento di sistema: da ricontrollare dopo ogni aggiornamento.
2. **Impostazioni → App → Avvio automatico → Termux e Termux:Boot: attivi.**
   Senza, lo script di boot non parte affatto dopo un riavvio del telefono.
3. **Impostazioni → Batteria → (⋮ in alto a destra) → Ottimizzazione standby →
   disattivata**, oppure Termux escluso. È la voce che ColorOS usa per congelare
   le app quando il telefono resta fermo a lungo, e agisce anche col wake lock.
4. **Impostazioni → Batteria → Risparmio energetico / Super risparmio:
   disattivati.** Il super risparmio chiude tutto ciò che non è in una lista
   breve di app di sistema.
5. **Schermata delle app recenti → tenere premuta la scheda Termux → lucchetto**
   (`Blocca`). Impedisce la chiusura da "pulisci tutto" e abbassa la priorità di
   Termux nella lista dei candidati alla terminazione.
6. **Impostazioni → Password e sicurezza / Privacy → Permessi speciali →
   Visualizza sopra altre app: consentito a Termux** (dove presente su ColorOS).
   Serve a Termux:Boot per avviarsi affidabilmente da spento.
7. Non usare `Pulizia telefono` / `Phone Manager` sull'app: ogni passaggio di
   quello strumento rimette le restrizioni batteria.

Dopo i comandi **non chiudere Termux con lo swipe**: muore `runsvdir` e con lui
il servizio. Uscire dalla sessione o lasciare l'app in background.

## Quando Android chiude Termux

Il 2026-09-20 alle 23:05 il log si è fermato e per tre giorni non c'è stato
**nessun tentativo di riavvio**. Il connector è ripartito nell'istante in cui il
telefono è stato sbloccato, con pid vecchio di cinque secondi e un solo avvio
alle 23:01; il contatore dei riavvii era a 3, senza ciclo di crash; la notifica
del wake lock era sparita. Non è morto il connector: è stato terminato Termux,
portandosi via wake lock, `runsvdir` e connector insieme.

**Questo caso non è rilevabile da dentro Termux, per costruzione.** Runit
supervisiona il connector, ma niente supervisiona runit; quando il processo padre
viene ucciso non resta nulla che possa scrivere una riga di log, e nemmeno
`finish` viene eseguito. Qualunque guardia messa qui dentro muore con ciò che
dovrebbe guardare. La rilevazione sta fuori: l'allarme Telegram sull'heartbeat
fermo (`deploy/monitor/`) ha funzionato ed è la difesa reale.

Le mitigazioni possibili sono tre, in ordine di resa:

- il wake lock preso da `run` (fatto), così ogni `sv restart` lo ripristina;
- le impostazioni ColorOS dell'elenco sopra, che riducono la probabilità;
- spostare il connector su una macchina Linux sempre accesa sulla LAN del POS,
  sotto `systemd`, che elimina la classe di guasto invece di ridurla.

Il pacchetto standalone si dichiara *"Minimal Nexus Kitchen Connector runtime for
Linux and Termux"* e non ha dipendenze native: gira già su Linux così com'è. Il
telefono è sempre stato un ripiego.

## Aggiornare il connector

```sh
cd ~/nexus-kitchen && git pull
cd tools/kitchen-connector-standalone && npm run build && npm test
sv restart kitchen-connector
```

`npm run build` e non `npm ci`: le dipendenze non cambiano, ricompilare è più
rapido e meno rischioso su un telefono.

**Controllare sempre che il repo non sia in detached HEAD**, altrimenti
`git pull` non porta nulla e non dà errori evidenti:

```sh
cd ~/nexus-kitchen && git status -sb && git log --oneline -1
```

È già capitato: il telefono era fermo su un commit staccato e l'aggiornamento
sembrava riuscito. Il sintomo è stato `npm test` con meno test del previsto.

## Verifica

```sh
sv status kitchen-connector                      # 'run' con uptime che sale
cat ~/.local/state/nexus-kitchen/restart-count   # a regime deve essere 0
tail -20 ~/.local/state/nexus-kitchen/log/current
```

Il contatore a 6 significa che il connector rinasce e muore ogni 64 secondi: il
log dice perché.
