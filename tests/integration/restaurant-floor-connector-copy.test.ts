import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConnectorAlert,
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
