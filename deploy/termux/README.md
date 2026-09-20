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

In Android: **Impostazioni → App → Termux → Batteria → Senza restrizioni**, e su
ColorOS abilitare l'avvio automatico per Termux e Termux:Boot.

## Aggiornare il connector

```sh
cd ~/nexus-kitchen && git pull
cd tools/kitchen-connector-standalone && npm run build && npm test
sv restart kitchen-connector
```

`npm run build` e non `npm ci`: le dipendenze non cambiano, ricompilare è più
rapido e meno rischioso su un telefono.

## Verifica

```sh
sv status kitchen-connector                      # 'run' con uptime che sale
cat ~/.local/state/nexus-kitchen/restart-count   # a regime deve essere 0
tail -20 ~/.local/state/nexus-kitchen/log/current
```

Il contatore a 6 significa che il connector rinasce e muore ogni 64 secondi: il
log dice perché.

Dopo i comandi **non chiudere Termux con lo swipe**: muore `runsvdir` e con lui
il servizio. Uscire dalla sessione o lasciare l'app in background.
