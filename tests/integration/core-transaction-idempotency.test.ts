import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { prisma } from "../../lib/prisma";
import { postInventoryMovementsBatch } from "../../lib/inventory";
import { closeRestaurantOrderAtomic } from "../../lib/restaurant-orders";
import { serveRestaurantOrderLine, reverseRecipeConsumption } from "../../lib/restaurant-kitchen";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) throw new Error("I test Core richiedono un DATABASE_URL dedicato contenente _test.");

let fixture: Awaited<ReturnType<typeof loadFixture>>;
const createdOrderIds: string[] = [];

async function loadFixture() {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const user = await prisma.user.findFirstOrThrow({ where: { memberships: { some: { companyId: company.id } } } });
  const location = await prisma.location.findFirstOrThrow({ where: { companyId: company.id, active: true } });
  const partner = await prisma.partner.findFirstOrThrow({ where: { companyId: company.id, isCustomer: true, active: true } });
  const recipe = await prisma.item.findFirstOrThrow({ where: { companyId: company.id, type: "RECIPE" }, include: { recipeComponents: { include: { componentItem: true } } } });
  const product = await prisma.item.findFirstOrThrow({ where: { companyId: company.id, type: "PRODUCT", stockManaged: true } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, locationId: location.id, active: true }, include: { bins: { where: { active: true }, take: 1 } } });
  const lot = await prisma.inventoryLot.findFirst({ where: { companyId: company.id, itemId: recipe.recipeComponents[0]?.componentItemId, active: true } });
  const series = await prisma.documentSeries.findFirstOrThrow({ where: { companyId: company.id, code: "RIST-CONTO" } });
  const account = await prisma.financialAccount.findFirstOrThrow({ where: { companyId: company.id, code: "CASSA" } });
  const vatRate = await prisma.vatRate.findFirstOrThrow({ where: { companyId: company.id, active: true } });
  return { company, user, location, partner, recipe, product, warehouse, lot, series, account, vatRate };
}

async function createServedOrder(itemId = fixture.product.id, quantity = 1) {
  const code = `TEST-${randomUUID()}`;
  const order = await prisma.restaurantOrder.create({
    data: { companyId: fixture.company.id, locationId: fixture.location.id, code, partnerId: fixture.partner.id, guestCount: 1, createdById: fixture.user.id, updatedById: fixture.user.id },
  });
  const line = await prisma.restaurantOrderLine.create({
    data: { companyId: fixture.company.id, orderId: order.id, itemId, quantity, unitPrice: 10, vatRateId: fixture.vatRate.id, status: "SERVED", servedAt: new Date() },
  });
  createdOrderIds.push(order.id);
  return { ...order, lines: [line] };
}

before(async () => { fixture = await loadFixture(); });

after(async () => {
  if (createdOrderIds.length) {
    await prisma.idempotencyRecord.deleteMany({ where: { companyId: fixture.company.id, aggregateId: { in: createdOrderIds } } });
    await prisma.recipeConsumption.deleteMany({ where: { companyId: fixture.company.id, orderId: { in: createdOrderIds } } });
    await prisma.restaurantOrderLine.deleteMany({ where: { companyId: fixture.company.id, orderId: { in: createdOrderIds } } });
    await prisma.restaurantOrder.deleteMany({ where: { id: { in: createdOrderIds }, documentId: null } });
  }
  await prisma.$disconnect();
});

test("Inventory batch: successo, replay e concorrenza producono un solo batch", async () => {
  const key = randomUUID();
  const referenceId = `TEST-BATCH-${key}`;
  const input = [{ warehouseId: fixture.warehouse.id, binId: fixture.warehouse.bins[0]?.id, itemId: fixture.product.id, movementType: "ADJUSTMENT_IN" as const, quantity: 1, unitOfMeasureId: fixture.product.unitOfMeasureId!, referenceType: "CoreHardeningTest", referenceId }];
  const [first, second] = await Promise.all([
    postInventoryMovementsBatch(fixture.company.id, fixture.user.id, key, input),
    postInventoryMovementsBatch(fixture.company.id, fixture.user.id, key, input),
  ]);
  assert.deepEqual(second, first);
  assert.equal(await prisma.inventoryMovement.count({ where: { companyId: fixture.company.id, referenceId } }), 1);
});

test("Inventory batch: errore e stock negativo effettuano rollback completo", async () => {
  const referenceId = `TEST-ROLLBACK-${randomUUID()}`;
  await assert.rejects(postInventoryMovementsBatch(fixture.company.id, fixture.user.id, randomUUID(), [
    { warehouseId: fixture.warehouse.id, itemId: fixture.product.id, movementType: "ADJUSTMENT_IN", quantity: 1, unitOfMeasureId: fixture.product.unitOfMeasureId!, referenceType: "CoreHardeningTest", referenceId },
    { warehouseId: fixture.warehouse.id, itemId: fixture.product.id, movementType: "CONSUMPTION", quantity: 999999, unitOfMeasureId: fixture.product.unitOfMeasureId!, referenceType: "CoreHardeningTest", referenceId },
  ]));
  assert.equal(await prisma.inventoryMovement.count({ where: { companyId: fixture.company.id, referenceId } }), 0);
});

test("Restaurant recipe: servizio concorrente idempotente e reversal completo", async () => {
  const order = await createServedOrder(fixture.recipe.id);
  const line = order.lines[0];
  await prisma.restaurantOrderLine.update({ where: { id: line.id }, data: { status: "READY", servedAt: null } });
  const selections = Object.fromEntries(fixture.recipe.recipeComponents.filter((row) => row.componentItem.trackLots || row.componentItem.trackSerials).map((row) => [row.componentItemId, fixture.lot!.id]));
  const key = `${fixture.company.id}:${line.id}:serve`;
  const [first, second] = await Promise.all([
    serveRestaurantOrderLine(fixture.company.id, fixture.user.id, line.id, key, selections),
    serveRestaurantOrderLine(fixture.company.id, fixture.user.id, line.id, key, selections),
  ]);
  assert.deepEqual(second, first);
  assert.equal(await prisma.recipeConsumption.count({ where: { companyId: fixture.company.id, orderLineId: line.id } }), fixture.recipe.recipeComponents.length);
  const reversed = await reverseRecipeConsumption(fixture.company.id, fixture.user.id, line.id, `${key}:reverse`);
  assert.equal(reversed.count, fixture.recipe.recipeComponents.length);
});

test("Restaurant close: parziale, multiplo, replay e rollback Treasury", async () => {
  const order = await createServedOrder();
  const partial = await closeRestaurantOrderAtomic(fixture.company.id, fixture.user.id, order.id, randomUUID(), { seriesId: fixture.series.id, invoice: false, payments: [{ financialAccountId: fixture.account.id, paymentMethod: "CASH", amount: 5 }] });
  assert.equal(partial.paymentStatus, "PARTIALLY_PAID");
  const document = await prisma.businessDocument.findUniqueOrThrow({ where: { id: partial.documentId } });
  const residual = Number(document.total) - 5;
  const key = randomUUID();
  const closed = await closeRestaurantOrderAtomic(fixture.company.id, fixture.user.id, order.id, key, { seriesId: fixture.series.id, invoice: false, payments: [{ financialAccountId: fixture.account.id, paymentMethod: "CARD", amount: 3 }, { financialAccountId: fixture.account.id, paymentMethod: "CASH", amount: residual - 3 }] });
  assert.equal(closed.paymentStatus, "PAID");
  assert.deepEqual(await closeRestaurantOrderAtomic(fixture.company.id, fixture.user.id, order.id, key, { seriesId: fixture.series.id, invoice: false, payments: [] }), closed);
  assert.equal(await prisma.businessDocument.count({ where: { id: closed.documentId } }), 1);
  assert.equal(await prisma.financialMovement.count({ where: { companyId: fixture.company.id, documentId: closed.documentId, movementType: "CUSTOMER_RECEIPT" } }), 3);

  const failed = await createServedOrder();
  await assert.rejects(closeRestaurantOrderAtomic(fixture.company.id, fixture.user.id, failed.id, randomUUID(), { seriesId: fixture.series.id, invoice: false, payments: [{ financialAccountId: "tenant-invalid", paymentMethod: "CASH", amount: 1 }] }));
  const reloaded = await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: failed.id } });
  assert.equal(reloaded.documentId, null);
  assert.equal(reloaded.status, "OPEN");
});

test("Tenant isolation: un'altra Company non può servire o chiudere l'ordine", async () => {
  const other = await prisma.company.create({ data: { name: `Test tenant ${randomUUID()}` } });
  const order = await createServedOrder();
  try {
    await assert.rejects(closeRestaurantOrderAtomic(other.id, fixture.user.id, order.id, randomUUID(), { seriesId: fixture.series.id, invoice: false, payments: [] }));
  } finally {
    await prisma.idempotencyRecord.deleteMany({ where: { companyId: other.id } });
    await prisma.company.delete({ where: { id: other.id } });
  }
});
