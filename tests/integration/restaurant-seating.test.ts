import assert from "node:assert/strict";
import test from "node:test";

import { canSeatAll, MAX_UNION_TABLES, type SeatingTable } from "@/lib/restaurant-seating";

const t = (id: string, capacity: number, combinable = true, areaId = "sala"): SeatingTable =>
  ({ id, areaId, capacity, combinable });
const g = (id: string, size: number, fixedTableIds?: string[]) => ({ id, size, fixedTableIds });

test("la capienza non è la somma dei posti", () => {
  // Quattro tavoli da due fanno otto posti, ma se non sono unibili un gruppo
  // da otto non si siede da nessuna parte.
  const sparsi = [t("a", 2, false), t("b", 2, false), t("c", 2, false), t("d", 2, false)];
  assert.equal(canSeatAll([g("x", 8)], sparsi).seatable, false);
  // Gli stessi tavoli, dichiarati unibili: il gruppo entra.
  const unibili = sparsi.map((table) => ({ ...table, combinable: true }));
  assert.equal(canSeatAll([g("x", 8)], unibili).seatable, true);
});

test("l'unione al volo non richiede una combinazione preconfigurata", () => {
  const tables = [t("a", 4), t("b", 4)];
  assert.equal(canSeatAll([g("x", 7)], tables, []).seatable, true);
});

test("non si uniscono tavoli di aree diverse", () => {
  const tables = [t("a", 4, true, "sala"), t("b", 4, true, "dehors")];
  assert.equal(canSeatAll([g("x", 7)], tables).seatable, false);
  assert.equal(canSeatAll([g("x", 4)], tables).seatable, true, "ma singolarmente bastano");
});

test("oltre il tetto di tavoli l'unione non è ammessa", () => {
  const tables = Array.from({ length: 6 }, (_, i) => t(`t${i}`, 2));
  assert.equal(MAX_UNION_TABLES, 4);
  // 5 tavoli da 2 servirebbero per 10 persone: oltre il tetto.
  assert.equal(canSeatAll([g("x", 10)], tables).seatable, false);
  assert.equal(canSeatAll([g("x", 8)], tables).seatable, true, "quattro tavoli bastano");
});

test("una combinazione configurata vale anche fra tavoli non unibili al volo", () => {
  const tables = [t("a", 3, false), t("b", 3, false)];
  assert.equal(canSeatAll([g("x", 6)], tables, []).seatable, false);
  assert.equal(canSeatAll([g("x", 6)], tables, [["a", "b"]]).seatable, true);
});

test("più gruppi nella stessa fascia competono per gli stessi tavoli", () => {
  const tables = [t("a", 4), t("b", 4), t("c", 2)];
  // 4 + 4 + 2 entrano.
  assert.equal(canSeatAll([g("x", 4), g("y", 4), g("z", 2)], tables).seatable, true);
  // Tre gruppi da quattro no: il terzo non ha dove stare.
  assert.equal(canSeatAll([g("x", 4), g("y", 4), g("z", 4)], tables).seatable, false);
});

test("un gruppo grande può togliere il posto a due piccoli, e va visto", () => {
  const tables = [t("a", 2), t("b", 2), t("c", 2)];
  // Il gruppo da 6 prende tutti e tre i tavoli: nessun altro entra.
  assert.equal(canSeatAll([g("grande", 6), g("piccolo", 2)], tables).seatable, false);
  // Da solo invece sì.
  assert.equal(canSeatAll([g("grande", 6)], tables).seatable, true);
});

test("i tavoli già assegnati dallo staff escono dal disponibile", () => {
  const tables = [t("a", 4), t("b", 4)];
  // "a" è fissato per il gruppo x: al gruppo y resta solo "b".
  assert.equal(canSeatAll([g("x", 4, ["a"]), g("y", 4)], tables).seatable, true);
  assert.equal(canSeatAll([g("x", 4, ["a"]), g("y", 4), g("z", 4)], tables).seatable, false);
});

test("un'assegnazione dello staff insufficiente è dichiarata tale", () => {
  const tables = [t("a", 2), t("b", 8)];
  assert.equal(canSeatAll([g("x", 6, ["a"])], tables).seatable, false, "sei persone su un tavolo da due");
});

test("due gruppi fissati sullo stesso tavolo sono incoerenti", () => {
  const tables = [t("a", 4)];
  assert.equal(canSeatAll([g("x", 2, ["a"]), g("y", 2, ["a"])], tables).seatable, false);
});

test("nessun gruppo da sistemare è sempre sistemabile", () => {
  assert.equal(canSeatAll([], [t("a", 2)]).seatable, true);
});

test("il ripiego conservativo non accetta mai l'impossibile", () => {
  const tables = [t("a", 2), t("b", 2)];
  const molti = Array.from({ length: 14 }, (_, i) => g(`g${i}`, 2));
  const outcome = canSeatAll(molti, tables, [], { maxGroups: 3 });
  assert.equal(outcome.method, "conservative");
  assert.equal(outcome.seatable, false, "quattordici gruppi su due tavoli: impossibile");
});

test("il ripiego resta prudente anche quando la somma basterebbe", () => {
  // Somma dei posti sufficiente, ma un gruppo da 9 non entra in nessuna unità.
  const tables = [t("a", 2), t("b", 2), t("c", 2), t("d", 2), t("e", 2)];
  const outcome = canSeatAll([g("x", 9), g("y", 1)], tables, [], { maxGroups: 1 });
  assert.equal(outcome.method, "conservative");
  assert.equal(outcome.seatable, false);
});
