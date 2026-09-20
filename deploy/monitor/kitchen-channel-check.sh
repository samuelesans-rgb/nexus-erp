#!/usr/bin/env bash
# Innesco del sorvegliante del canale cucina.
#
# Volutamente stupido: il verdetto sta nell'app, che ha una sola definizione di
# "canale giu'". Qui c'e' solo l'innesco e il caso che l'app non sappia
# segnalare da sola, cioe' l'app stessa irraggiungibile.
set -uo pipefail

CONFIG="${KITCHEN_MONITOR_CONFIG:-/etc/nexus-monitor.env}"
# shellcheck source=/dev/null
[ -r "$CONFIG" ] && . "$CONFIG"

ENDPOINT="${MONITOR_ENDPOINT:-http://127.0.0.1:3000/api/internal/kitchen-channel}"
STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/nexus-monitor}"
FAIL_THRESHOLD="${MONITOR_FAIL_THRESHOLD:-3}"
mkdir -p "$STATE_DIR"
FAILS="$STATE_DIR/consecutive-failures"
NOTIFIED="$STATE_DIR/erp-unreachable-notified"

response=$(curl -fsS --max-time 30 -X POST "$ENDPOINT" \
  -H "authorization: Bearer ${INTERNAL_MONITOR_SECRET:-}" 2>&1)
status=$?

if [ $status -eq 0 ]; then
  echo "ok $response"
  echo 0 > "$FAILS"
  # L'ERP e' tornato: se avevamo avvisato della sua assenza, dillo.
  if [ -f "$NOTIFIED" ] && [ -n "${KITCHEN_ALERT_TELEGRAM_TOKEN:-}" ]; then
    curl -fsS --max-time 15 -X POST \
      "https://api.telegram.org/bot${KITCHEN_ALERT_TELEGRAM_TOKEN}/sendMessage" \
      -H 'content-type: application/json' \
      -d "{\"chat_id\":\"${KITCHEN_ALERT_TELEGRAM_CHAT_ID}\",\"text\":\"✅ Nexus — ERP di nuovo raggiungibile.\"}" >/dev/null
    rm -f "$NOTIFIED"
  fi
  exit 0
fi

count=$(( $(cat "$FAILS" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$FAILS"
echo "errore: endpoint non raggiungibile (tentativo $count): $response" >&2

# Chi sorveglia il sorvegliante: se l'app non risponde non puo' avvisare da
# sola, quindi qui il messaggio lo manda lo script. Una volta sola per episodio.
if [ "$count" -ge "$FAIL_THRESHOLD" ] && [ ! -f "$NOTIFIED" ] \
   && [ -n "${KITCHEN_ALERT_TELEGRAM_TOKEN:-}" ]; then
  curl -fsS --max-time 15 -X POST \
    "https://api.telegram.org/bot${KITCHEN_ALERT_TELEGRAM_TOKEN}/sendMessage" \
    -H 'content-type: application/json' \
    -d "{\"chat_id\":\"${KITCHEN_ALERT_TELEGRAM_CHAT_ID}\",\"text\":\"⚠️ Nexus — ERP non raggiungibile da ${count} controlli. Il sorvegliante della cucina non sta girando.\"}" >/dev/null \
    && touch "$NOTIFIED"
fi
exit 1
