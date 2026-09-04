/* eslint-disable @typescript-eslint/no-explicit-any -- compact tenant-local integration fixture */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import {
  acknowledgeConnectorJob,
  claimConnectorJob,
  createPairingToken,
  failConnectorJob,
  pairConnector,
} from "../../lib/kitchen-connector";
import { addOrderLine, openOrder } from "../../lib/restaurant-orders";
import {
  advanceKitchenLine,
  cancelOrderLine,
  changeOrderLineQuantity,
  getKitchen,
  processKitchenPrintJob,
  recordFusionDispatchOutcome,
  reprintKitchenTicket,
  retryKitchenPrintJob,
  saveKitchenRouting,
  saveKitchenStation,
  saveRestaurantPrinter,
  sendOrderToKitchen,
} from "../../lib/restaurant-kitchen";
if (!(process.env.DATABASE_URL ?? "").includes("_test"))
  throw new Error("Kitchen Printing tests require a _test database.");
let f: any;
const orders: string[] = [];
before(async () => {
  const x = randomUUID().slice(0, 8).toUpperCase();
  f = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
        data: { name: "Kitchen " + x, vatNumber: "ITK" + x },
      }),
      other = await tx.company.create({
        data: { name: "Other " + x, vatNumber: "ITO" + x },
      }),
      user = await tx.user.create({
        data: {
          email: `k-${x.toLowerCase()}@test.invalid`,
          firstName: "Ada",
          lastName: "Cook",
          password: "test",
        },
      }),
      loc = await tx.location.create({
        data: {
          companyId: company.id,
          code: "A",
          slug: `ka-${x.toLowerCase()}`,
          name: "Sala",
        },
      }),
      locB = await tx.location.create({
        data: {
          companyId: company.id,
          code: "B",
          slug: `kb-${x.toLowerCase()}`,
          name: "Altra",
        },
      }),
      cat = await tx.itemCategory.create({
        data: {
          companyId: company.id,
          code: "FOOD",
          name: "Food",
          purpose: "SELLABLE",
        },
      }),
      uom = await tx.unitOfMeasure.create({
        data: {
          companyId: company.id,
          code: "PZ",
          name: "Pezzo",
          symbol: "pz",
        },
      }),
      vat = await tx.vatRate.create({
        data: {
          companyId: company.id,
          code: "V10",
          name: "IVA",
          percentage: 10,
        },
      });
    const item = await tx.item.create({
        data: {
          companyId: company.id,
          code: "PASTA",
          name: "Orecchiette",
          type: "PRODUCT",
          categoryId: cat.id,
          unitOfMeasureId: uom.id,
          vatRateId: vat.id,
          salePrice: 12,
          sellable: true,
        },
      }),
      drink = await tx.item.create({
        data: {
          companyId: company.id,
          code: "BEER",
          name: "Birra",
          type: "PRODUCT",
          categoryId: cat.id,
          unitOfMeasureId: uom.id,
          vatRateId: vat.id,
          salePrice: 5,
          sellable: true,
        },
      }),
      unrouted = await tx.item.create({
        data: {
          companyId: company.id,
          code: "NONE",
          name: "Senza routing",
          type: "PRODUCT",
          categoryId: cat.id,
          unitOfMeasureId: uom.id,
          vatRateId: vat.id,
          salePrice: 1,
          sellable: true,
        },
      });
    const menu = await tx.restaurantMenu.create({
        data: {
          companyId: company.id,
          locationId: loc.id,
          code: "M",
          name: "Menu",
        },
      }),
      section = await tx.restaurantMenuSection.create({
        data: { companyId: company.id, menuId: menu.id, name: "Main" },
      });
    await tx.restaurantMenuItem.createMany({
      data: [item, drink, unrouted].map((i) => ({
        companyId: company.id,
        menuSectionId: section.id,
        itemId: i.id,
      })),
    });
    const variant = await tx.restaurantProductVariant.create({
        data: { companyId: company.id, itemId: item.id, name: "Normale" },
      }),
      group = await tx.restaurantModifierGroup.create({
        data: {
          companyId: company.id,
          itemId: item.id,
          name: "Extra",
          maxSelections: 2,
        },
      }),
      modifier = await tx.restaurantModifier.create({
        data: {
          companyId: company.id,
          locationId: loc.id,
          groupId: group.id,
          name: "+ Burrata",
          kitchenLabel: "+ Burrata",
        },
      }),
      allergen = await tx.allergen.create({
        data: { companyId: company.id, code: "MILK", name: "Latte" },
      });
    await tx.itemAllergen.create({
      data: { companyId: company.id, itemId: item.id, allergenId: allergen.id },
    });
    const station = await tx.kitchenStation.create({
        data: {
          companyId: company.id,
          locationId: loc.id,
          code: "K",
          name: "Cucina",
        },
      }),
      bar = await tx.kitchenStation.create({
        data: {
          companyId: company.id,
          locationId: loc.id,
          code: "B",
          name: "Bar",
        },
      }),
      foreignStation = await tx.kitchenStation.create({
        data: {
          companyId: company.id,
          locationId: locB.id,
          code: "X",
          name: "Altro",
        },
      });
    const printer = await tx.restaurantPrinter.create({
        data: {
          companyId: company.id,
          locationId: loc.id,
          stationId: station.id,
          code: "PK",
          name: "Mock cucina",
        },
      }),
      barPrinter = await tx.restaurantPrinter.create({
        data: {
          companyId: company.id,
          locationId: loc.id,
          stationId: bar.id,
          code: "PB",
          name: "Mock bar",
        },
      });
    await tx.kitchenStationAssignment.createMany({
      data: [
        {
          companyId: company.id,
          kitchenStationId: station.id,
          itemId: item.id,
          priority: 10,
        },
        {
          companyId: company.id,
          kitchenStationId: bar.id,
          itemId: drink.id,
          priority: 10,
        },
      ],
    });
    return {
      company,
      other,
      user,
      loc,
      locB,
      cat,
      uom,
      vat,
      item,
      drink,
      unrouted,
      variant,
      modifier,
      allergen,
      station,
      bar,
      foreignStation,
      printer,
      barPrinter,
    };
  });
});
after(async () => {
  const companyId = f.company.id;
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.kitchenPrintJob.deleteMany({ where: { companyId } });
  await prisma.kitchenConnectorDevice.deleteMany({ where: { companyId } });
  await prisma.kitchenConnectorPairingToken.deleteMany({
    where: { companyId },
  });
  await prisma.kitchenTicketLine.deleteMany({ where: { companyId } });
  await prisma.kitchenTicket.deleteMany({ where: { companyId } });
  await prisma.kitchenDispatch.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderLineModifier.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderLine.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.restaurantPrinter.deleteMany({ where: { companyId } });
  await prisma.kitchenStationAssignment.deleteMany({ where: { companyId } });
  await prisma.kitchenStation.deleteMany({ where: { companyId } });
  await prisma.restaurantProductVariant.deleteMany({ where: { companyId } });
  await prisma.restaurantModifier.deleteMany({ where: { companyId } });
  await prisma.restaurantModifierGroup.deleteMany({ where: { companyId } });
  await prisma.itemAllergen.deleteMany({ where: { companyId } });
  await prisma.allergen.deleteMany({ where: { companyId } });
  await prisma.restaurantMenuItem.deleteMany({ where: { companyId } });
  await prisma.restaurantMenuSection.deleteMany({ where: { companyId } });
  await prisma.restaurantMenu.deleteMany({ where: { companyId } });
  await prisma.item.deleteMany({ where: { companyId } });
  await prisma.vatRate.deleteMany({ where: { companyId } });
  await prisma.unitOfMeasure.deleteMany({ where: { companyId } });
  await prisma.itemCategory.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({
    where: { id: { in: [f.company.id, f.other.id] } },
  });
  await prisma.user.delete({ where: { id: f.user.id } });
  await prisma.$disconnect();
});
async function order() {
  const o = await openOrder(f.company.id, f.loc.id, f.user.id, {
    guestCount: 2,
    serviceType: "DINE_IN",
  });
  orders.push(o.id);
  return o;
}
test("Kitchen Printing V1 integration", async (t) => {
  await t.test("1 station creation", async () => {
    const s = await saveKitchenStation(f.company.id, f.loc.id, f.user.id, {
      code: "D",
      name: "Dolci",
      sortOrder: 3,
      active: true,
    });
    assert.ok(s.id);
  });
  await t.test("2 station cross-location denied", async () => {
    await assert.rejects(
      saveRestaurantPrinter(f.company.id, f.loc.id, f.user.id, {
        stationId: f.foreignStation.id,
        code: "BAD",
        name: "Bad",
        type: "MOCK",
        connectionType: "MOCK",
        enabled: true,
        copies: 1,
        paperWidth: 80,
      }),
    );
  });
  await t.test("3 product routing", async () => {
    await saveKitchenRouting(
      f.company.id,
      f.loc.id,
      f.user.id,
      f.item.id,
      f.station.id,
    );
    assert.equal(
      (
        await prisma.kitchenStationAssignment.findFirstOrThrow({
          where: { companyId: f.company.id, itemId: f.item.id, active: true },
        })
      ).kitchenStationId,
      f.station.id,
    );
  });
  await t.test("4 missing routing denied", async () => {
    const o = await order();
    await addOrderLine(f.company.id, f.loc.id, o.id, {
      itemId: f.unrouted.id,
      quantity: 1,
    });
    await assert.rejects(
      sendOrderToKitchen(f.company.id, f.loc.id, o.id, f.user.id, randomUUID()),
    );
  });
  let o: any, line: any, dispatch: any, ticket: any, job: any;
  await t.test("5 initial dispatch", async () => {
    o = await order();
    line = await addOrderLine(f.company.id, f.loc.id, o.id, {
      itemId: f.item.id,
      variantId: f.variant.id,
      modifierIds: [f.modifier.id],
      quantity: 2,
      kitchenNotes: "Una senza cipolla",
    });
    dispatch = await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      o.id,
      f.user.id,
      "initial",
    );
    assert.equal(dispatch.sequenceNumber, 1);
  });
  await t.test("6 dispatch only unsent lines", async () => {
    await addOrderLine(f.company.id, f.loc.id, o.id, {
      itemId: f.drink.id,
      quantity: 1,
    });
    const d = await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      o.id,
      f.user.id,
      "addition",
    );
    assert.equal(
      await prisma.kitchenTicketLine.count({ where: { dispatchId: d.id } }),
      1,
    );
  });
  await t.test("7 addition", async () => {
    assert.equal(
      (
        await prisma.kitchenDispatch.findFirstOrThrow({
          where: { orderId: o.id, sequenceNumber: 2 },
        })
      ).type,
      "ADDITION",
    );
  });
  await t.test("8 quantity increase", async () => {
    await changeOrderLineQuantity(
      f.company.id,
      f.loc.id,
      o.id,
      line.id,
      f.user.id,
      3,
    );
    const d = await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      o.id,
      f.user.id,
      "increase",
    );
    assert.equal(
      Number(
        (
          await prisma.kitchenTicketLine.findFirstOrThrow({
            where: { dispatchId: d.id },
          })
        ).quantity,
      ),
      1,
    );
  });
  await t.test("9 unsent cancellation no kitchen ticket", async () => {
    const x = await order(),
      l = await addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.item.id,
        quantity: 1,
      });
    const before = await prisma.kitchenDispatch.count({
      where: { orderId: x.id },
    });
    await cancelOrderLine(
      f.company.id,
      f.loc.id,
      x.id,
      l.id,
      f.user.id,
      "unsent-cancel",
    );
    assert.equal(
      await prisma.kitchenDispatch.count({ where: { orderId: x.id } }),
      before,
    );
  });
  await t.test("10 sent cancellation creates cancellation ticket", async () => {
    await cancelOrderLine(
      f.company.id,
      f.loc.id,
      o.id,
      line.id,
      f.user.id,
      "cancel-sent",
    );
    assert.equal(
      (
        await prisma.kitchenDispatch.findFirstOrThrow({
          where: { orderId: o.id, type: "CANCELLATION" },
        })
      ).type,
      "CANCELLATION",
    );
  });
  await t.test("11 product snapshot", async () => {
    ticket = await prisma.kitchenTicket.findFirstOrThrow({
      where: { orderId: o.id, dispatchNumber: 1 },
      include: { lines: true },
    });
    assert.equal(ticket.lines[0].productName, "Orecchiette");
  });
  await t.test("12 variant snapshot", () =>
    assert.equal(ticket.lines[0].variantName, "Normale"),
  );
  await t.test("13 modifier snapshot", () =>
    assert.match(JSON.stringify(ticket.lines[0].modifiers), /Burrata/),
  );
  await t.test("14 notes snapshot", () =>
    assert.equal(ticket.lines[0].notes, "Una senza cipolla"),
  );
  await t.test("15 routing split by station", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.drink.id,
      quantity: 1,
    });
    const d = await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      x.id,
      f.user.id,
      "split",
    );
    assert.equal(
      await prisma.kitchenTicket.count({ where: { dispatchId: d.id } }),
      2,
    );
  });
  await t.test("16 print job creation", async () => {
    job = await prisma.kitchenPrintJob.findFirstOrThrow({
      where: { ticketId: ticket.id },
    });
    assert.equal(job.status, "PENDING");
  });
  await t.test("17 print ACK", async () => {
    assert.equal(
      (await processKitchenPrintJob(f.company.id, f.loc.id, job.id))?.status,
      "PRINTED",
    );
  });
  await t.test("18 print failure", async () => {
    await prisma.restaurantPrinter.update({
      where: { id: f.printer.id },
      data: { address: "MOCK_FAIL" },
    });
    const r = await reprintKitchenTicket(
      f.company.id,
      f.loc.id,
      f.user.id,
      ticket.id,
      "fail",
    );
    assert.equal(
      (await processKitchenPrintJob(f.company.id, f.loc.id, r.id))?.status,
      "FAILED",
    );
    job = r;
  });
  await t.test("19 retry", async () => {
    await prisma.restaurantPrinter.update({
      where: { id: f.printer.id },
      data: { address: null },
    });
    assert.equal(
      (await retryKitchenPrintJob(f.company.id, f.loc.id, f.user.id, job.id))
        ?.status,
      "PRINTED",
    );
  });
  await t.test("20 retry no duplicate dispatch", async () => {
    assert.equal(
      await prisma.kitchenDispatch.count({ where: { orderId: o.id } }),
      4,
    );
  });
  let reprint: any;
  await t.test("21 reprint", async () => {
    reprint = await reprintKitchenTicket(
      f.company.id,
      f.loc.id,
      f.user.id,
      ticket.id,
      "visible",
    );
    assert.equal(reprint.type, "REPRINT");
  });
  await t.test("22 reprint visibly marked", () =>
    assert.match(reprint.payload, /\*\*\* RISTAMPA \*\*\*/),
  );
  await t.test("23 double send idempotent", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    const [a, b] = await Promise.all([
      sendOrderToKitchen(f.company.id, f.loc.id, x.id, f.user.id, "same"),
      sendOrderToKitchen(f.company.id, f.loc.id, x.id, f.user.id, "same"),
    ]);
    assert.equal(a.id, b.id);
  });
  await t.test("24 concurrent send", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    await Promise.allSettled([
      sendOrderToKitchen(f.company.id, f.loc.id, x.id, f.user.id, "a"),
      sendOrderToKitchen(f.company.id, f.loc.id, x.id, f.user.id, "b"),
    ]);
    assert.equal(
      await prisma.kitchenDispatch.count({ where: { orderId: x.id } }),
      1,
    );
  });
  await t.test("25 concurrent print worker", async () => {
    const pending = await prisma.kitchenPrintJob.findFirstOrThrow({
      where: { status: "PENDING", companyId: f.company.id },
    });
    const results = await Promise.all([
      processKitchenPrintJob(f.company.id, f.loc.id, pending.id),
      processKitchenPrintJob(f.company.id, f.loc.id, pending.id),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  });
  await t.test("26 ticket cross-company denied", async () =>
    assert.equal(
      await prisma.kitchenTicket.findFirst({
        where: { id: ticket.id, companyId: f.other.id },
      }),
      null,
    ),
  );
  await t.test("27 ticket cross-location denied", async () =>
    assert.equal(
      await prisma.kitchenTicket.findFirst({
        where: {
          id: ticket.id,
          companyId: f.company.id,
          locationId: f.locB.id,
        },
      }),
      null,
    ),
  );
  await t.test("28 printer cross-location denied", async () =>
    assert.rejects(
      retryKitchenPrintJob(f.company.id, f.locB.id, f.user.id, job.id),
    ),
  );
  await t.test("29 KDS transition", async () => {
    const x = await order(),
      l = await addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.item.id,
        quantity: 1,
      });
    await sendOrderToKitchen(f.company.id, f.loc.id, x.id, f.user.id, "kds");
    await advanceKitchenLine(
      f.company.id,
      f.loc.id,
      f.user.id,
      l.id,
      "IN_PREPARATION",
    );
    await advanceKitchenLine(f.company.id, f.loc.id, f.user.id, l.id, "READY");
    assert.equal(
      (await getKitchen(f.company.id, f.loc.id, { status: "READY" })).some(
        (r) => r.orderId === x.id,
      ),
      true,
    );
  });
  await t.test("30 audit send/reprint", async () => {
    const actions = await prisma.auditLog.findMany({
      where: {
        companyId: f.company.id,
        action: { in: ["KITCHEN_DISPATCH_SENT", "KITCHEN_TICKET_REPRINTED"] },
      },
    });
    assert.ok(actions.some((a) => a.action === "KITCHEN_DISPATCH_SENT"));
    assert.ok(actions.some((a) => a.action === "KITCHEN_TICKET_REPRINTED"));
  });
  await t.test("31 concurrent retry", async () => {
    await prisma.restaurantPrinter.update({
      where: { id: f.printer.id },
      data: { address: "MOCK_FAIL" },
    });
    const failed = await reprintKitchenTicket(
      f.company.id,
      f.loc.id,
      f.user.id,
      ticket.id,
      "retry-race",
    );
    await processKitchenPrintJob(f.company.id, f.loc.id, failed.id);
    await prisma.restaurantPrinter.update({
      where: { id: f.printer.id },
      data: { address: null },
    });
    const results = await Promise.allSettled([
      retryKitchenPrintJob(f.company.id, f.loc.id, f.user.id, failed.id),
      retryKitchenPrintJob(f.company.id, f.loc.id, f.user.id, failed.id),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    const finalJob = await prisma.kitchenPrintJob.findUniqueOrThrow({
      where: { id: failed.id },
    });
    assert.equal(finalJob.status, "PRINTED");
    assert.equal(finalJob.attempts, 2);
    assert.equal(
      await prisma.kitchenPrintJob.count({ where: { id: failed.id } }),
      1,
    );
  });
  await t.test("32 concurrent reprint idempotent", async () => {
    const [a, b] = await Promise.all([
      reprintKitchenTicket(
        f.company.id,
        f.loc.id,
        f.user.id,
        ticket.id,
        "reprint-race",
      ),
      reprintKitchenTicket(
        f.company.id,
        f.loc.id,
        f.user.id,
        ticket.id,
        "reprint-race",
      ),
    ]);
    assert.equal(a.id, b.id);
  });
  await t.test("33 addition during dispatch remains complete", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    const first = sendOrderToKitchen(
        f.company.id,
        f.loc.id,
        x.id,
        f.user.id,
        "race-first",
      ),
      added = addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.drink.id,
        quantity: 1,
      });
    await Promise.all([first, added]);
    await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      x.id,
      f.user.id,
      "race-second",
    );
    assert.equal(
      await prisma.kitchenTicketLine.count({
        where: { ticket: { orderId: x.id } },
      }),
      2,
    );
  });
  await t.test("34 FUSION ACK unblocks print", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    const d = await sendOrderToKitchen(
        f.company.id,
        f.loc.id,
        x.id,
        f.user.id,
        "fusion-ack",
        true,
      ),
      blocked = await prisma.kitchenPrintJob.findFirstOrThrow({
        where: { ticket: { dispatchId: d.id } },
      });
    assert.equal(blocked.status, "BLOCKED");
    assert.equal(
      await processKitchenPrintJob(f.company.id, f.loc.id, blocked.id),
      null,
    );
    await recordFusionDispatchOutcome(f.company.id, f.loc.id, d.id, "ACCEPTED");
    assert.equal(
      (
        await prisma.kitchenPrintJob.findUniqueOrThrow({
          where: { id: blocked.id },
        })
      ).status,
      "PENDING",
    );
  });
  await t.test("35 FUSION reject keeps print blocked", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    const d = await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      x.id,
      f.user.id,
      "fusion-reject",
      true,
    );
    await recordFusionDispatchOutcome(
      f.company.id,
      f.loc.id,
      d.id,
      "REJECTED",
      "NACK",
    );
    assert.equal(
      (
        await prisma.kitchenPrintJob.findFirstOrThrow({
          where: { ticket: { dispatchId: d.id } },
        })
      ).status,
      "BLOCKED",
    );
  });
  await t.test("36 FUSION uncertain keeps print blocked", async () => {
    const x = await order();
    await addOrderLine(f.company.id, f.loc.id, x.id, {
      itemId: f.item.id,
      quantity: 1,
    });
    const d = await sendOrderToKitchen(
      f.company.id,
      f.loc.id,
      x.id,
      f.user.id,
      "fusion-uncertain",
      true,
    );
    await recordFusionDispatchOutcome(
      f.company.id,
      f.loc.id,
      d.id,
      "UNCERTAIN",
      "ACK lost",
    );
    assert.equal(
      (
        await prisma.kitchenPrintJob.findFirstOrThrow({
          where: { ticket: { dispatchId: d.id } },
        })
      ).status,
      "BLOCKED",
    );
  });
  await t.test("37 print uncertain is terminal and not retryable", async () => {
    await prisma.restaurantPrinter.update({
      where: { id: f.printer.id },
      data: { address: "MOCK_UNCERTAIN" },
    });
    const uncertain = await reprintKitchenTicket(
      f.company.id,
      f.loc.id,
      f.user.id,
      ticket.id,
      "uncertain",
      "Verifica operatore",
    );
    assert.equal(
      (await processKitchenPrintJob(f.company.id, f.loc.id, uncertain.id))
        ?.status,
      "UNCERTAIN",
    );
    await assert.rejects(
      retryKitchenPrintJob(f.company.id, f.loc.id, f.user.id, uncertain.id),
    );
    await prisma.restaurantPrinter.update({
      where: { id: f.printer.id },
      data: { address: null },
    });
  });
  await t.test(
    "38 reprint links original, reason and immutable hash",
    async () => {
      const r = await reprintKitchenTicket(
        f.company.id,
        f.loc.id,
        f.user.id,
        ticket.id,
        "reason",
        "Carta danneggiata",
      );
      assert.ok(r.originalJobId);
      assert.equal(r.reprintReason, "Carta danneggiata");
      assert.equal(r.payloadHash.length, 64);
      const original = await prisma.kitchenPrintJob.findUniqueOrThrow({
        where: { id: r.originalJobId! },
      });
      assert.notEqual(r.id, original.id);
      assert.match(r.payload, /RISTAMPA/);
    },
  );
  await t.test(
    "39 kitchen printing creates no fiscal or financial records",
    async () => {
      assert.equal(
        await prisma.businessDocument.count({
          where: { companyId: f.company.id },
        }),
        0,
      );
      assert.equal(
        await prisma.financialMovement.count({
          where: { companyId: f.company.id },
        }),
        0,
      );
    },
  );
  await t.test("40 direct print to fiscal device is forbidden", async () => {
    await assert.rejects(
      saveRestaurantPrinter(f.company.id, f.loc.id, f.user.id, {
        stationId: f.station.id,
        code: "FORBIDDEN",
        name: "Fiscal direct",
        type: "MOCK",
        connectionType: "MOCK",
        mode: "NEXUS_DIRECT",
        deviceType: "FISCAL",
        enabled: true,
        copies: 1,
        paperWidth: 80,
      }),
      /DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN/,
    );
    await assert.rejects(
      saveRestaurantPrinter(f.company.id, f.loc.id, f.user.id, {
        stationId: f.station.id,
        code: "KUBE-DIRECT",
        name: "KUBE direct",
        type: "CUSTOM_KUBE",
        connectionType: "RS232",
        mode: "NEXUS_DIRECT",
        deviceType: "FISCAL",
        enabled: true,
        copies: 1,
        paperWidth: 80,
      }),
      /DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN/,
    );
  });
  let hybrid: any;
  await t.test(
    "41 hybrid dispatch routes products only to their area",
    async () => {
      await prisma.restaurantPrinter.update({
        where: { id: f.printer.id },
        data: {
          mode: "LEGACY_FUSION",
          deviceType: "FISCAL",
          type: "FUSION_XML_1745",
          connectionType: "TCP",
        },
      });
      const x = await order();
      await addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.item.id,
        quantity: 1,
        kitchenNotes: "Senza cipolla",
      });
      await addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.drink.id,
        quantity: 1,
        kitchenNotes: "Poco ghiaccio",
      });
      const dispatch = await sendOrderToKitchen(
        f.company.id,
        f.loc.id,
        x.id,
        f.user.id,
        "hybrid",
      );
      const jobs = await prisma.kitchenPrintJob.findMany({
        where: { ticket: { dispatchId: dispatch.id } },
        include: { printer: true, ticket: { include: { lines: true } } },
      });
      assert.equal(jobs.length, 2);
      const legacy = jobs.find((row) => row.printer.mode === "LEGACY_FUSION")!;
      const direct = jobs.find((row) => row.printer.mode === "NEXUS_DIRECT")!;
      assert.equal(legacy.status, "PENDING");
      assert.equal(direct.status, "BLOCKED");
      assert.deepEqual(
        legacy.ticket!.lines.map((line) => line.productName),
        ["Orecchiette"],
      );
      assert.deepEqual(
        direct.ticket!.lines.map((line) => line.productName),
        ["Birra"],
      );
      assert.equal(legacy.ticket!.lines[0].notes, "Senza cipolla");
      assert.match(direct.payload, /POCO GHIACCIO/);
      hybrid = { dispatch, legacy, direct };
    },
  );
  await t.test(
    "42 certain legacy ACK unblocks correlated direct print",
    async () => {
      const pairing = await createPairingToken(
        f.company.id,
        f.loc.id,
        f.printer.id,
        f.user.id,
      );
      const paired = await pairConnector(pairing.pairingToken, {
        name: "hybrid",
      });
      const device = {
        id: paired.deviceId,
        companyId: f.company.id,
        locationId: f.loc.id,
        printerId: f.printer.id,
        leaseSeconds: 60,
      };
      const claim = await claimConnectorJob(device, hybrid.legacy.id);
      await acknowledgeConnectorJob(device, hybrid.legacy.id, claim.leaseToken);
      assert.equal(
        (
          await prisma.kitchenDispatch.findUniqueOrThrow({
            where: { id: hybrid.dispatch.id },
          })
        ).fusionStatus,
        "ACCEPTED",
      );
      assert.equal(
        (
          await prisma.kitchenPrintJob.findUniqueOrThrow({
            where: { id: hybrid.direct.id },
          })
        ).status,
        "PENDING",
      );
      hybrid.device = device;
    },
  );
  await t.test(
    "43 FUSION uncertain blocks the direct destination",
    async () => {
      const x = await order();
      await addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.item.id,
        quantity: 1,
      });
      await addOrderLine(f.company.id, f.loc.id, x.id, {
        itemId: f.drink.id,
        quantity: 1,
      });
      const dispatch = await sendOrderToKitchen(
        f.company.id,
        f.loc.id,
        x.id,
        f.user.id,
        "hybrid-uncertain",
      );
      const legacy = await prisma.kitchenPrintJob.findFirstOrThrow({
        where: { ticket: { dispatchId: dispatch.id }, printerId: f.printer.id },
      });
      const claim = await claimConnectorJob(hybrid.device, legacy.id);
      await failConnectorJob(
        hybrid.device,
        legacy.id,
        claim.leaseToken,
        "FUSION_UNCERTAIN_DELIVERY",
        "UNCERTAIN_AFTER_WRITE",
      );
      assert.equal(
        (
          await prisma.kitchenDispatch.findUniqueOrThrow({
            where: { id: dispatch.id },
          })
        ).fusionStatus,
        "UNCERTAIN",
      );
      assert.equal(
        (
          await prisma.kitchenPrintJob.findFirstOrThrow({
            where: {
              ticket: { dispatchId: dispatch.id },
              printerId: f.barPrinter.id,
            },
          })
        ).status,
        "BLOCKED",
      );
    },
  );
  await t.test("44 reprint stays on the direct destination", async () => {
    const reprint = await reprintKitchenTicket(
      f.company.id,
      f.loc.id,
      f.user.id,
      hybrid.direct.ticketId,
      "hybrid-reprint",
      "Ticket bar illeggibile",
    );
    assert.equal(reprint.printerId, f.barPrinter.id);
    assert.equal(reprint.originalJobId, hybrid.direct.id);
  });
});
