# Sorvegliante del canale cucina

Avvisa via Telegram quando il connector smette di battere, e quando torna.

Il verdetto sta nell'app (`getKitchenChannelHealth`), non qui: la soglia dei
120 secondi e il predicato "qualcuno è vivo" devono avere una sola definizione.
Lo script è solo un innesco, più il caso che l'app non può segnalare da sola —
l'app stessa irraggiungibile.

## Pezzi

| Dove | Cosa |
|---|---|
| `POST /api/internal/kitchen-channel` | il controllo; autenticato con `INTERNAL_MONITOR_SECRET` |
| `lib/kitchen-channel-alert-policy.ts` | soglia, finestra oraria, transizioni (puro, testato) |
| `lib/kitchen-channel-alert.ts` | stato su `DomainEvent`, invio, registrazione dell'esito |
| `kitchen-channel-check.sh` | innesco + allarme se l'ERP non risponde |
| `nexus-kitchen-monitor.timer` | ogni 5 minuti |

## Regole

- Avvisa dopo **10 minuti** senza battito. I 120 secondi del banner sono giusti
  in sala ma troppo nervosi per una notifica: runit rialza il processo in
  secondi e un riavvio del telefono dura circa due minuti.
- **Una notifica per caduta e una per ripristino**, mai una per tick.
- **Finestra 07:00–01:00** (ora italiana). Una caduta notturna non squilla; se
  alle 07:00 è ancora giù, parte allora. Un guasto notturno rientrato da solo
  non produce alcun messaggio.
- Canale **non configurato** non conta come invio riuscito: finisce a registro
  come `NOT_CONFIGURED`. È la differenza voluta rispetto al provider email, il
  cui Noop restituisce successo — motivo per cui nessuna email di prenotazione è
  mai partita senza che nessuno se ne accorgesse.

## Installazione sulla VPS

```sh
sudo install -m 0755 deploy/monitor/kitchen-channel-check.sh /usr/local/bin/
sudo install -m 0644 deploy/monitor/nexus-kitchen-monitor.service /etc/systemd/system/
sudo install -m 0644 deploy/monitor/nexus-kitchen-monitor.timer /etc/systemd/system/

sudo tee /etc/nexus-monitor.env >/dev/null <<'ENV'
INTERNAL_MONITOR_SECRET=...
KITCHEN_ALERT_TELEGRAM_TOKEN=...
KITCHEN_ALERT_TELEGRAM_CHAT_ID=...
MONITOR_ENDPOINT=https://erp.frisabistro.com/api/internal/kitchen-channel
ENV
sudo chmod 600 /etc/nexus-monitor.env

sudo systemctl daemon-reload
sudo systemctl enable --now nexus-kitchen-monitor.timer
systemctl list-timers nexus-kitchen-monitor.timer
```

`INTERNAL_MONITOR_SECRET`, `KITCHEN_ALERT_TELEGRAM_TOKEN` e
`KITCHEN_ALERT_TELEGRAM_CHAT_ID` vanno anche nell'ambiente del container, perché
l'invio lo fa l'app. Senza token la rotta risponde comunque e registra
`NOT_CONFIGURED`: il sistema funziona, semplicemente non avvisa nessuno.

## Come creare il bot Telegram

1. Su Telegram, scrivi a **@BotFather**, comando `/newbot`, scegli nome e
   username. Restituisce il token.
2. Scrivi un messaggio qualsiasi al bot appena creato (altrimenti non può
   scriverti per primo).
3. Apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e leggi
   `message.chat.id`: è il `CHAT_ID`.

Il destinatario non deve essere il Realme: se il guasto è quel telefono,
avvisare quel telefono è un cerchio chiuso.

## Perché l'URL pubblico e non l'IP del container

Il container non pubblica porte e il suo IP sulla rete Docker **cambia a ogni
ricreazione**, cioè a ogni deploy: puntarci vorrebbe dire rompere il
sorvegliante a ogni rilascio, con in più un falso allarme "ERP non
raggiungibile". L'URL pubblico è stabile e in più verifica il percorso vero,
quello che attraversano gli utenti: se il proxy o il certificato cadono, il
controllo se ne accorge invece di dichiarare tutto a posto.

## Verifica

```sh
# controllo immediato
sudo systemctl start nexus-kitchen-monitor.service
journalctl -u nexus-kitchen-monitor.service -n 20 --no-pager

# storico delle transizioni
# SELECT "eventType", "occurredAt", payload FROM "DomainEvent"
#  WHERE "aggregateType"='KitchenChannel' ORDER BY "occurredAt" DESC;
```

## Sorveglianza esterna: interruttore dell'uomo morto

`HEALTHCHECK_URL` in `/etc/nexus-monitor.env` punta a un controllo su
[healthchecks.io](https://healthchecks.io). Lo script segnala il successo a ogni
giro riuscito; se il segnale manca, il servizio esterno avvisa su Telegram
tramite webhook, nella **stessa conversazione** degli allarmi del connector.

Non è un servizio che interroga il sito da fuori, ed è una scelta: un pinger su
`/api/health` vedrebbe solo la VPS spenta. Il segnale invertito copre anche i
casi che nessun processo su questa macchina può denunciare da solo.

| Guasto | Chi lo segnala |
|---|---|
| Connector fermo | app → Telegram |
| ERP fermo, VPS viva | script → Telegram |
| Database fermo | script (l'endpoint va in errore) |
| Proxy o certificato rotto | script (chiama l'URL pubblico) |
| **VPS spenta** | **healthchecks** |
| **Timer systemd morto o disabilitato** | **healthchecks** |
| **Questo script rotto da una modifica** | **healthchecks** |

Tempi: periodo 5 minuti, grazia 15. Il servizio suona dopo **20 minuti di
silenzio**, cioè quattro giri mancati, quindi un intoppo isolato non lo
raggiunge. Al terzo fallimento consecutivo invece lo script dichiara il guasto
esplicitamente con un ping a `/fail`, per non aspettare i venti minuti su un
problema ormai conclamato.

`/api/health` è adeguato come controllo di profondità: esegue `SELECT 1` sul
database e risponde 503 se fallisce, quindi non dichiara "ok" con il database a
terra. Non serve migliorarlo.

### Limite residuo

Se healthchecks.io è irraggiungibile, arriva un falso allarme. È il prezzo di
qualunque sorveglianza esterna, e resta preferibile a un guasto vero che nessuno
segnala.
