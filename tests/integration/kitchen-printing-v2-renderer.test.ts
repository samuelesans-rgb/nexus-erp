import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kitchenPayloadHash,
  renderKitchenTicket,
} from "../../lib/restaurant-kitchen";

const ticket = (notes: string | null = null) => ({
  dispatchType: "NEW" as const,
  dispatchNumber: 1,
  orderCode: "1234",
  tableNames: ["4"],
  guestCount: 4,
  operatorName: "Operatore",
  stationCode: "CUCINA",
  stationName: "Cucina",
  createdAt: new Date("2026-09-03T19:42:00Z"),
  lines: [
    {
      quantity: 1,
      productName: "Filetto di orata",
      variantName: null,
      modifiers: [],
      notes,
      allergens: [],
    },
  ],
});

test("Kitchen Printing V2 renderer", async (t) => {
  await t.test("ticket senza nota", () =>
    assert.doesNotMatch(renderKitchenTicket(ticket()), /\*\*\* FILETTO/),
  );
  await t.test("ticket con una nota", () =>
    assert.match(
      renderKitchenTicket(ticket("senza cipolla")),
      /\*\*\* SENZA CIPOLLA \*\*\*/,
    ),
  );
  await t.test("note multiple", () => {
    const value = renderKitchenTicket({
      ...ticket(),
      lines: [...ticket("prima").lines, ...ticket("seconda").lines],
    });
    assert.match(value, /PRIMA/);
    assert.match(value, /SECONDA/);
  });
  await t.test("nota multilinea", () => {
    const value = renderKitchenTicket(ticket("prima\nseconda"));
    assert.match(value, /PRIMA/);
    assert.match(value, /SECONDA/);
  });
  await t.test("caratteri italiani e apostrofi restano UTF-8", () => {
    const source = "À È É Ì Ò Ù à è é ì ò ù l’acqua l'acqua";
    assert.match(
      renderKitchenTicket(ticket(source)),
      /À È É Ì Ò Ù À È É Ì Ò Ù L’ACQUA L'ACQUA/,
    );
  });
  await t.test("wrapping 80 mm", () =>
    assert.ok(
      renderKitchenTicket(ticket("nota ".repeat(40)), 80)
        .split("\n")
        .every((line) => line.length <= 48),
    ),
  );
  await t.test("wrapping 58 mm", () =>
    assert.ok(
      renderKitchenTicket(ticket("nota ".repeat(40)), 58)
        .split("\n")
        .every((line) => line.length <= 32),
    ),
  );
  await t.test("larghezza configurabile", () =>
    assert.ok(
      renderKitchenTicket(ticket("nota ".repeat(20)), 80, false, 24)
        .split("\n")
        .every((line) => line.length <= 24),
    ),
  );
  await t.test("sanitizza control chars", () =>
    assert.doesNotMatch(
      renderKitchenTicket(ticket("via\u0000\u001bESC")),
      /[\u0000\u001b]/,
    ),
  );
  await t.test("rimuove markup dalle note", () =>
    assert.doesNotMatch(
      renderKitchenTicket(ticket("<script>raw</script>")),
      /[<>]/,
    ),
  );
  await t.test("limita note e payload", () =>
    assert.ok(renderKitchenTicket(ticket("x".repeat(5000))).length < 1000),
  );
  await t.test("quantità e prodotto", () =>
    assert.match(
      renderKitchenTicket({
        ...ticket(),
        lines: [{ ...ticket().lines[0], quantity: 2, productName: "Pittule" }],
      }),
      /2 x PITTULE/,
    ),
  );
  await t.test("modifier restano figli sullo stesso ticket", () => {
    const value = renderKitchenTicket({
      ...ticket("ALLERGIA NOCI"),
      lines: [
        {
          ...ticket("ALLERGIA NOCI").lines[0],
          modifiers: [{ name: "SENZA CIPOLLA" }, { name: "SALSA A PARTE" }],
        },
      ],
    });
    assert.match(
      value,
      /1 x FILETTO DI ORATA[\s\S]*→ SENZA CIPOLLA[\s\S]*→ SALSA A PARTE[\s\S]*\*\*\* ALLERGIA NOCI \*\*\*/,
    );
  });
  await t.test("intestazione professionale", () =>
    assert.match(
      renderKitchenTicket(ticket()),
      /FRISÀ BISTRÒ[\s\S]*TAVOLO 4[\s\S]*COMANDA #1234[\s\S]*4 COPERTI/,
    ),
  );
  await t.test("ristampa marcata", () =>
    assert.match(
      renderKitchenTicket(ticket(), 80, true),
      /\*\*\* RISTAMPA \*\*\*/,
    ),
  );
  await t.test("payload deterministico", () =>
    assert.equal(renderKitchenTicket(ticket()), renderKitchenTicket(ticket())),
  );
  await t.test("hash SHA-256 deterministico", () => {
    const payload = renderKitchenTicket(ticket());
    assert.equal(kitchenPayloadHash(payload), kitchenPayloadHash(payload));
    assert.match(kitchenPayloadHash(payload), /^[a-f0-9]{64}$/);
  });
});
