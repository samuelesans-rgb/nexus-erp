import assert from "node:assert/strict";
import test from "node:test";

import { buildSettleConfirmation } from "@/lib/restaurant-floor-settle-copy";

test("nomina il tavolo su cui si sta per agire", () => {
  const copy = buildSettleConfirmation({
    tableNames: ["1"],
    lineCount: 12,
    unsentCount: 0,
  });
  assert.equal(copy.title, "CHIUDI IL TAVOLO 1");
  assert.equal(copy.points[0], "Il tavolo torna libero subito");
  assert.equal(copy.points[1], "Nessun documento: il conto si fa in cassa");
  assert.equal(copy.points[2], "Le 12 righe risultano servite");
});

test("accorda al plurale quando la comanda tiene piu' tavoli", () => {
  const copy = buildSettleConfirmation({
    tableNames: ["4", "5"],
    lineCount: 3,
    unsentCount: 0,
  });
  assert.equal(copy.title, "CHIUDI I TAVOLI 4, 5");
  assert.equal(copy.points[0], "I tavoli tornano liberi subito");
});

test("una riga sola non diventa 'Le 1 righe'", () => {
  assert.equal(
    buildSettleConfirmation({ tableNames: ["2"], lineCount: 1, unsentCount: 0 })
      .points[2],
    "1 riga risulta servita",
  );
});

test("comanda vuota: non promette righe servite che non esistono", () => {
  assert.equal(
    buildSettleConfirmation({ tableNames: ["2"], lineCount: 0, unsentCount: 0 })
      .points[2],
    "La comanda è vuota",
  );
});

test("nessun avviso quando tutto e' stato inviato in cucina", () => {
  assert.equal(
    buildSettleConfirmation({ tableNames: ["1"], lineCount: 5, unsentCount: 0 })
      .warning,
    null,
  );
});

test("avvisa delle righe mai inviate, che e' l'unica sorpresa possibile", () => {
  assert.equal(
    buildSettleConfirmation({ tableNames: ["1"], lineCount: 5, unsentCount: 2 })
      .warning,
    "2 righe non sono mai state inviate in cucina. Verranno comunque segnate come servite.",
  );
  assert.equal(
    buildSettleConfirmation({ tableNames: ["1"], lineCount: 5, unsentCount: 1 })
      .warning,
    "1 riga non è mai stata inviata in cucina. Verrà comunque segnata come servita.",
  );
});

test("senza tavoli associati ripiega sulla comanda, senza titolo monco", () => {
  const copy = buildSettleConfirmation({
    tableNames: [],
    lineCount: 2,
    unsentCount: 0,
  });
  assert.equal(copy.title, "CHIUDI LA COMANDA");
  assert.equal(copy.points[0], "Il tavolo torna libero subito");
});

test("ignora i nomi vuoti invece di produrre 'TAVOLO ,'", () => {
  assert.equal(
    buildSettleConfirmation({
      tableNames: ["", "  "],
      lineCount: 1,
      unsentCount: 0,
    }).title,
    "CHIUDI LA COMANDA",
  );
});
