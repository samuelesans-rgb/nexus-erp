import assert from "node:assert/strict";
import test from "node:test";

import {
  ALERT_AFTER_MINUTES,
  buildChannelDownMessage,
  buildChannelUpMessage,
  decideChannelAlert,
  isInsideAlertWindow,
} from "@/lib/kitchen-channel-alert-policy";

const at = (patch: Partial<Parameters<typeof decideChannelAlert>[0]> = {}) =>
  decideChannelAlert({
    stale: true,
    staleForMinutes: 30,
    lastNotified: null,
    hourOfDay: 12,
    ...patch,
  });

test("la finestra 07:00-01:00 scavalca la mezzanotte", () => {
  assert.equal(isInsideAlertWindow(7), true);
  assert.equal(isInsideAlertWindow(12), true);
  assert.equal(isInsideAlertWindow(23), true);
  assert.equal(isInsideAlertWindow(0), true, "mezzanotte e' ancora servizio");
  assert.equal(isInsideAlertWindow(1), false);
  assert.equal(isInsideAlertWindow(4), false);
  assert.equal(isInsideAlertWindow(6), false);
});

test("sotto soglia non disturba: un riavvio non e' un guasto", () => {
  assert.deepEqual(at({ staleForMinutes: ALERT_AFTER_MINUTES - 1 }), {
    action: "NONE",
    reason: "below-threshold",
  });
  assert.equal(at({ staleForMinutes: ALERT_AFTER_MINUTES }).action, "NOTIFY_DOWN");
});

test("una sola notifica per caduta, non una per tick", () => {
  assert.equal(at({ lastNotified: null }).action, "NOTIFY_DOWN");
  assert.deepEqual(at({ lastNotified: "DOWN" }), {
    action: "NONE",
    reason: "already-notified",
  });
});

test("di notte tace, ma non dimentica", () => {
  // Caduta alle 4: nessuna notifica.
  assert.deepEqual(at({ hourOfDay: 4 }), { action: "NONE", reason: "outside-window" });
  // Alle 7 e' ancora giu' e lo stato non e' mai passato a DOWN: parte adesso.
  assert.equal(at({ hourOfDay: 7 }).action, "NOTIFY_DOWN");
});

test("un guasto notturno rientrato da solo non produce messaggi", () => {
  // Mai notificata la caduta, quindi niente annuncio di ripristino.
  assert.deepEqual(
    at({ stale: false, staleForMinutes: 0, lastNotified: null, hourOfDay: 9 }),
    { action: "NONE", reason: "healthy" },
  );
});

test("il ripristino si annuncia solo a chi era stato avvisato", () => {
  assert.equal(
    at({ stale: false, staleForMinutes: 0, lastNotified: "DOWN", hourOfDay: 9 }).action,
    "NOTIFY_UP",
  );
  // E nemmeno il ripristino sveglia alle 4.
  assert.deepEqual(
    at({ stale: false, staleForMinutes: 0, lastNotified: "DOWN", hourOfDay: 4 }),
    { action: "NONE", reason: "outside-window" },
  );
});

test("canale sano dopo un ripristino gia' annunciato: silenzio", () => {
  assert.deepEqual(
    at({ stale: false, staleForMinutes: 0, lastNotified: "UP", hourOfDay: 12 }),
    { action: "NONE", reason: "healthy" },
  );
});

test("nessun battito mai ricevuto e' un'assenza infinita, non zero minuti", () => {
  assert.equal(at({ staleForMinutes: null }).action, "NOTIFY_DOWN");
});

test("il messaggio di caduta dice conseguenza e scadenza", () => {
  const m = buildChannelDownMessage({ locationName: "Frisà", staleForMinutes: 12, maxAgeMinutes: 120 });
  assert.match(m.title, /Frisà — cucina non collegata/);
  assert.match(m.body, /non risponde da 12 minuti/);
  assert.match(m.body, /restano in coda e non arrivano al POS/);
  assert.match(m.body, /Oltre 2 ore scadono/);
});

test("mai collegata: il messaggio non inventa una durata", () => {
  const m = buildChannelDownMessage({ locationName: "Frisà", staleForMinutes: null, maxAgeMinutes: 120 });
  assert.match(m.body, /mai dato segni di vita/);
  assert.ok(!m.body.includes("NaN"));
});

test("il ripristino dice quanto e' durato e cosa controllare", () => {
  const m = buildChannelUpMessage({ locationName: "Frisà", outageMinutes: 95 });
  assert.match(m.title, /di nuovo collegata/);
  assert.match(m.body, /durato circa 1 ora/);
  assert.match(m.body, /scadute/);
  assert.ok(!buildChannelUpMessage({ locationName: "F", outageMinutes: null }).body.includes("NaN"));
});
