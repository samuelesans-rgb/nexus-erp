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
MONITOR_ENDPOINT=http://127.0.0.1:3000/api/internal/kitchen-channel
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

## Verifica

```sh
# controllo immediato
sudo systemctl start nexus-kitchen-monitor.service
journalctl -u nexus-kitchen-monitor.service -n 20 --no-pager

# storico delle transizioni
# SELECT "eventType", "occurredAt", payload FROM "DomainEvent"
#  WHERE "aggregateType"='KitchenChannel' ORDER BY "occurredAt" DESC;
```

## Limite noto

Se la **VPS** è spenta, nessun processo sulla VPS può segnalarlo. Lo script
copre il caso "ERP fermo, VPS viva". La copertura completa richiede un
controllo esterno che interroghi `https://erp.frisabistro.com/api/health` da
fuori: è fuori da questo lavoro.
