# Diagnostica POS temporanea — intervento locale Realme

Il codice non aggiorna il Realme. Nessun job è stato accodato o eseguito sul POS.
Il backend Nexus deve ricevere **solo questo commit**, tramite un rilascio isolato:
non costruire/deployare il workspace che contiene Sala e Sprint4 non committati.
Il push non equivale a un rilascio Nexus o Realme.

Verifiche locali in copia isolata del commit base, senza Sala/Sprint4: Prisma format/validate/generate, TypeScript, ESLint (zero errori; cinque warning preesistenti), build Next.js, 11 test standalone, 36 test di integrazione connector/FUSION/diagnostica, simulatore end-to-end e 2 test Playwright. Database dei test: esclusivamente `nexus_erp_test`. OPEN/CLOSED sono verificati con server TCP loopback; TIMEOUT con socket di connessione bloccata simulato, senza regole firewall o traffico verso il POS. Snippet Bash e JavaScript di rollback verificati sintatticamente; non eseguiti su Termux.

Osservazione in sola lettura del 2026-09-06 19:31 UTC: Realme ONLINE, heartbeat recente, versione `1.1.0`; zero job `POS_NETWORK_DIAGNOSTIC` in produzione. Il commit realmente installato sul Realme non è conoscibile dal heartbeat attuale. Le porte e i banner POS restano NON ESEGUITI/NON ACQUISITI.

## Contratto e limiti

- Job `{type:"POS_NETWORK_DIAGNOSTIC",id:"…"}` senza altri campi.
- Host letto dalla configurazione FUSION, accettato solo se `192.168.1.77`.
- Porte fisse: 22, 21, 23, 80, 443, 445, 139, 873, 1745. Timeout assoluto 1500 ms per porta, esecuzione sequenziale.
- Nessun byte applicativo inviato; SSH/FTP/Telnet possono restituire un banner spontaneo (massimo 512 byte). HTTP/HTTPS sono solo TCP: nessun titolo, header o handshake TLS.
- Stessa autenticazione bearer del connector. Richiesta operatore protetta da sessione, permesso Kitchen `manage`, company/location e controllo Origin.
- Record persistente `IdempotencyRecord`, chiave fissa per connector/sede/missione; audit richiesta/acquisizione/completamento transazionale. Non cancellare o riciclare la chiave.
- La richiesta scade dopo 15 minuti se non acquisita. L'acquisizione è definitiva prima della risposta HTTP: una risposta persa o un crash richiedono revisione, non una seconda scansione.
- Il sentinel locale `spool/pos-network-diagnostic-v1/` impedisce una seconda scansione anche con job diversi. I soli risultati possono essere ritrasmessi ogni 60 secondi; nessun retry delle connessioni POS.
- La modalità `network-diagnostic-only` invia heartbeat e polling diagnostico; non chiama recovery, coda stampe o catalog sync. Il heartbeat conserva il controllo TCP già esistente della stampante.
- Fuori dalla modalità dedicata la funzionalità è disabilitata, salvo `POS_NETWORK_DIAGNOSTIC_ENABLED=true`.
- Nessun cambiamento allo schema, pacchetto, credenziale, configurazione FUSION o database POS.

## Termux: preparazione e aggiornamento

**STOP_AND_REVIEW prima di eseguire questi comandi sul Realme.** Eseguirli nella stessa sessione Bash. Impostare `TARGET_COMMIT` all'hash esatto fornito nel report finale.
Prerequisiti: backend diagnostico rilasciato separatamente; dipendenze standalone già installate. Non installare pacchetti. Non riavviare Android: il launcher di boot resta invariato.

```bash
set -euo pipefail
: "${TARGET_COMMIT:?Impostare hash esatto del report}"
cd "$HOME/nexus-kitchen"
git diff --quiet
git diff --cached --quiet
git fetch origin feature/restaurant-booking-widget
git cat-file -e "$TARGET_COMMIT^{commit}"
git merge-base --is-ancestor "$TARGET_COMMIT" origin/feature/restaurant-booking-widget
umask 077
MAINT="$HOME/.local/state/nexus-kitchen/network-diagnostic-maintenance"
mkdir -p "$MAINT"
test ! -e "$MAINT/previous-commit"
git rev-parse HEAD > "$MAINT/previous-commit"
```

Individuare esclusivamente il processo Node del connector, senza stampare ambiente o credenziali. Se non è unico, fermarsi. Se un supervisore lo riavvia automaticamente, il controllo successivo fallisce: fermarsi e verificare il launcher locale, non uccidere altri processi.

```bash
connector_pids() {
  node --input-type=module - <<'JS'
import { readdirSync, readFileSync } from 'node:fs';
for (const pid of readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
  try {
    const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    if (/(^|\/)node$/.test(args[0]) && args.some(a => /(^|\/)kitchen-connector\/fusion\.js$/.test(a) || /\/network-diagnostic-maintenance\/heartbeat-only\.mjs$/.test(a))) console.log(pid);
  } catch {}
}
JS
}
declare -f connector_pids > "$MAINT/process.sh"
PIDS="$(connector_pids)"
test "$(printf '%s\n' "$PIDS" | sed '/^$/d' | wc -l)" -eq 1
kill -TERM "$PIDS"
sleep 5
test -z "$(connector_pids)"
git switch --detach "$TARGET_COMMIT"
cd tools/kitchen-connector-standalone
npm run build
npm test
```

Se build/test falliscono, passare al rollback. Nessun file esterno al repository viene sostituito: credential, fusion.json, spool e snapshot rimangono al loro posto.

```bash
export KITCHEN_CONNECTOR_URL="https://erp.frisabistro.com"
export KITCHEN_CONNECTOR_CREDENTIAL="$(cat "$HOME/.config/nexus-kitchen/credential")"
export FUSION_XML1745_CONFIG="$HOME/.config/nexus-kitchen/fusion.json"
export KITCHEN_CONNECTOR_SPOOL="$HOME/.local/state/nexus-kitchen/spool"
test -z "$(connector_pids)"
nohup node dist/kitchen-connector/fusion.js network-diagnostic-only \
  > "$MAINT/diagnostic.log" 2>&1 < /dev/null &
echo "$!" > "$MAINT/diagnostic.pid"
unset KITCHEN_CONNECTOR_CREDENTIAL
sleep 35
kill -0 "$(cat "$MAINT/diagnostic.pid")"
git rev-parse HEAD
```

Verificare in Nexus, Impostazioni cucina → connector Realme → Diagnostica:
heartbeat aggiornato dopo il riavvio, stato ONLINE, `posNetworkDiagnostic: true`.
Per verificare la versione, da console browser Nexus eseguire:

```javascript
await fetch('/api/restaurant/pos-network-diagnostic?deviceId=cbb09630f0a176267433f1540', {
  cache: 'no-store'
}).then(r => r.json());
```

`connector.connectorVersion` deve essere `1.1.0+pos-network-diagnostic-v1`; `connector.lastHeartbeatAt` deve essere recente. Prima della richiesta `diagnostic` è `null`.
L'hash Git viene verificato localmente dal comando precedente; non è dedotto dal heartbeat.
Se entro 90 secondi il heartbeat non torna aggiornato/ONLINE, non richiedere il job e fare rollback.

## Richiesta e risultato — solo dopo verifica aggiornamento

Da console del browser sulla stessa origine Nexus, con sessione autorizzata Kitchen `manage`, per il Realme attualmente identificato:

```javascript
await fetch('/api/restaurant/pos-network-diagnostic', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deviceId: 'cbb09630f0a176267433f1540' })
}).then(async r => ({ status: r.status, body: await r.json() }));
```

Una sola richiesta; entro circa 75 secondi leggere il risultato:

```javascript
await fetch('/api/restaurant/pos-network-diagnostic?deviceId=cbb09630f0a176267433f1540', {
  cache: 'no-store'
}).then(async r => ({ status: r.status, body: await r.json() }));
```

`SUCCEEDED` significa diagnostica completata, non disponibilità del database o autorizzazione a un login.
`CLAIMED` senza risultato indica esito incerto: STOP_AND_REVIEW, nessun nuovo job.
Qualunque risultato richiede STOP_AND_REVIEW. Non effettuare login, download o nuove prove dei servizi.

## Rollback locale senza elaborare ordini

Ripristina il commit precedente e mantiene **solo heartbeat**, così non riattiva involontariamente una coda di ordini.
Il launcher normale e quello di boot rimangono invariati; il ritorno al polling ordinario è un intervento distinto dopo questa missione.

```bash
set -euo pipefail
MAINT="$HOME/.local/state/nexus-kitchen/network-diagnostic-maintenance"
source "$MAINT/process.sh"
cd "$HOME/nexus-kitchen"
PIDS="$(connector_pids)"
if test -n "$PIDS"; then
  test "$(printf '%s\n' "$PIDS" | wc -l)" -eq 1
  kill -TERM "$PIDS"
  sleep 5
fi
test -z "$(connector_pids)"
git switch --detach "$(cat "$MAINT/previous-commit")"
cd tools/kitchen-connector-standalone
npm run build
cat > "$MAINT/heartbeat-only.mjs" <<'JS'
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';
const root = join(homedir(), 'nexus-kitchen/tools/kitchen-connector-standalone/dist/kitchen-connector');
const { KitchenConnectorClient, JsonSpool } = await import(pathToFileURL(join(root, 'runtime.js')));
const { FusionDeliveryLedger, FusionXml1745PrinterAdapter, validateFusionConfig } = await import(pathToFileURL(join(root, 'fusion-xml1745.js')));
const config = validateFusionConfig(JSON.parse(await readFile(process.env.FUSION_XML1745_CONFIG, 'utf8')));
const spool = process.env.KITCHEN_CONNECTOR_SPOOL;
const client = new KitchenConnectorClient(process.env.KITCHEN_CONNECTOR_URL, process.env.KITCHEN_CONNECTOR_CREDENTIAL, new JsonSpool(spool), new FusionXml1745PrinterAdapter(config, new FusionDeliveryLedger(join(spool, 'fusion-delivery-ledger.json'))));
const heartbeat = () => void client.heartbeat().catch(() => console.error('Heartbeat unavailable'));
heartbeat(); setInterval(heartbeat, 30000);
JS
export KITCHEN_CONNECTOR_URL="https://erp.frisabistro.com"
export KITCHEN_CONNECTOR_CREDENTIAL="$(cat "$HOME/.config/nexus-kitchen/credential")"
export FUSION_XML1745_CONFIG="$HOME/.config/nexus-kitchen/fusion.json"
export KITCHEN_CONNECTOR_SPOOL="$HOME/.local/state/nexus-kitchen/spool"
unset POS_NETWORK_DIAGNOSTIC_ENABLED
nohup node "$MAINT/heartbeat-only.mjs" > "$MAINT/rollback.log" 2>&1 < /dev/null &
echo "$!" > "$MAINT/rollback.pid"
unset KITCHEN_CONNECTOR_CREDENTIAL
sleep 35
kill -0 "$(cat "$MAINT/rollback.pid")"
git rev-parse HEAD
```

Verificare nuovamente heartbeat recente/ONLINE in Nexus; la versione deve essere quella del vecchio connector. Non eliminare il sentinel, i risultati o il record server della missione.
