import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConnectorAlert,
  buildOfflineDispatchConfirmation,
  formatDowntime,
} from "@/lib/restaurant-floor-connector-copy";

test("dice il fatto, la conseguenza e da quanto dura", () => {
  const alert = buildConnectorAlert({ staleForMinutes: 14, maxAgeMinutes: 120 });
  assert.equal(alert.title, "CUCINA NON COLLEGATA");
  assert.equal(alert.lines[0], "Le comande inviate ora NON arrivano al POS.");
  assert.equal(
    alert.lines[1],
    "Escono al ripristino. Oltre 2 ore, da rimandare a mano.",
  );
  assert.equal(
    alert.lines[2],
    "Ferma da 14 minuti. Avvisa chi gestisce il locale.",
  );
});

test("la finestra nel testo segue la costante, non e' scritta a mano", () => {
  assert.match(
    buildConnectorAlert({ staleForMinutes: 5, maxAgeMinutes: 30 }).lines[1],
    /Oltre 30 minuti/,
  );
  assert.match(
    buildConnectorAlert({ staleForMinutes: 5, maxAgeMinutes: 60 }).lines[1],
    /Oltre 1 ora/,
  );
});

test("non promette che le comande escano comunque", () => {
  // La riga precedente diceva solo "restano in coda": vero nel caso normale,
  // falso dopo la scadenza. Deve reggere anche nel caso peggiore.
  const line = buildConnectorAlert({
    staleForMinutes: 200,
    maxAgeMinutes: 120,
  }).lines[1];
  assert.match(line, /da rimandare a mano/);
});

test("mai collegata: non inventa una durata", () => {
  const alert = buildConnectorAlert({
    staleForMinutes: null,
    maxAgeMinutes: 120,
  });
  assert.equal(alert.lines[2], "Mai collegata. Avvisa chi gestisce il locale.");
  assert.ok(!alert.lines[2].includes("NaN"));
});

test("la durata usa l'unita' leggibile e accorda il singolare", () => {
  assert.equal(formatDowntime(0), "meno di un minuto");
  assert.equal(formatDowntime(1), "1 minuto");
  assert.equal(formatDowntime(59), "59 minuti");
  assert.equal(formatDowntime(60), "1 ora");
  assert.equal(formatDowntime(90), "1 ora");
  assert.equal(formatDowntime(120), "2 ore");
  assert.equal(formatDowntime(1440), "1 giorno");
  assert.equal(formatDowntime(60 * 24 * 18), "18 giorni");
});

test("conferma d'invio a canale fermo: conseguenza e azione, non allarme e basta", () => {
  const c = buildOfflineDispatchConfirmation({ maxAgeMinutes: 120 });
  assert.equal(c.title, "CUCINA NON COLLEGATA");
  assert.equal(c.lines[0], "La comanda NON esce in cucina adesso.");
  assert.match(c.lines[1], /Resta in coda ed esce al ripristino\. Oltre 2 ore, da rimandare a mano\./);
  // L'istruzione e' separata perche' e' l'unica cosa che il cameriere puo' fare
  // adesso perche' i piatti si facciano davvero.
  assert.equal(c.instruction, "Avvisa la cucina a voce.");
  assert.equal(c.confirmLabel, "INVIA LO STESSO");
  assert.equal(c.cancelLabel, "ANNULLA");
});

test("anche qui la finestra segue la costante", () => {
  assert.match(buildOfflineDispatchConfirmation({ maxAgeMinutes: 45 }).lines[1], /Oltre 45 minuti/);
});
