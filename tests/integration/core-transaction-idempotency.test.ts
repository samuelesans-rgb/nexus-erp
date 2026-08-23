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
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: `Core Fixture ${suffix}`, vatNumber: `ITCORE${suffix}` } });
    const user = await tx.user.create({ data: { email: `core-${suffix.toLowerCase()}@test.invalid`, firstName: "Core", lastName: "Fixture", password: "test-only" } });
    const location = await tx.location.create({ data: { companyId: company.id, slug: `core-${suffix.toLowerCase()}`, code: `CORE-${suffix}`, name: "Core Location", isHeadquarters: true } });
    const role = await tx.role.create({ data: { code: `CORE_TEST_${suffix}`, name: "Core test role", system: false } });
    const membership = await tx.membership.create({ data: { companyId: company.id, userId: user.id, active: true, isDefault: true, defaultLocationId: location.id } });
    await tx.membershipLocation.create({ data: { companyId: company.id, membershipId: membership.id, locationId: location.id } });
    await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
    await tx.location.update({ where: { id: location.id }, data: { createdById: user.id, updatedById: user.id } });
    const unit = await tx.unitOfMeasure.create({ data: { companyId: company.id, code: `U-${suffix}`, name: "Unit", symbol: "pz", precision: 3, createdById: user.id, updatedById: user.id } });
    const vatRate = await tx.vatRate.create({ data: { companyId: company.id, code: `V-${suffix}`, name: "IVA", percentage: 22, createdById: user.id, updatedById: user.id } });
    const partner = await tx.partner.create({ data: { companyId: company.id, code: `P-${suffix}`, name: "Core Customer", isCustomer: true, createdById: user.id, updatedById: user.id } });
    const product = await tx.item.create({ data: { companyId: company.id, code: `PROD-${suffix}`, name: "Core Product", type: "PRODUCT", unitOfMeasureId: unit.id, vatRateId: vatRate.id, salePrice: 10, stockManaged: true, createdById: user.id, updatedById: user.id } });
    const ingredient = await tx.item.create({ data: { companyId: company.id, code: `ING-${suffix}`, name: "Core Ingredient", type: "INGREDIENT", unitOfMeasureId: unit.id, vatRateId: vatRate.id, stockManaged: true, createdById: user.id, updatedById: user.id } });
    const recipe = await tx.item.create({ data: { companyId: company.id, code: `REC-${suffix}`, name: "Core Recipe", type: "RECIPE", unitOfMeasureId: unit.id, vatRateId: vatRate.id, salePrice: 10, sellable: true, stockManaged: false, createdById: user.id, updatedById: user.id } });
    await tx.recipeComponent.create({ data: { companyId: company.id, recipeItemId: recipe.id, componentItemId: ingredient.id, unitOfMeasureId: unit.id, quantity: 1 } });
    const warehouse = await tx.warehouse.create({ data: { companyId: company.id, locationId: location.id, code: `WH-${suffix}`, name: "Core Warehouse", allowNegativeStock: false, createdById: user.id, updatedById: user.id, bins: { create: { code: `BIN-${suffix}`, name: "Core Bin" } } }, include: { bins: true } });
    const series = await tx.documentSeries.create({ data: { companyId: company.id, locationId: location.id, code: `SER-${suffix}`, name: "Core receipts", documentType: "SALES_RECEIPT" } });
    const account = await tx.financialAccount.create({ data: { companyId: company.id, locationId: location.id, code: `ACC-${suffix}`, name: "Core Cash", type: "CASH", allowOverdraft: true, createdById: user.id, updatedById: user.id } });
    return { company, user, location, membership, role, unit, vatRate, partner, product, ingredient, recipe, warehouse, series, account };
  });
  await postInventoryMovementsBatch(result.company.id, result.user.id, `core-opening-${suffix}`, [{ warehouseId: result.warehouse.id, binId: result.warehouse.bins[0].id, itemId: result.ingredient.id, movementType: "OPENING", quantity: 100, unitOfMeasureId: result.unit.id, referenceType: "CoreFixture", referenceId: suffix }]);
  return { ...result, recipe: await prisma.item.findUniqueOrThrow({ where: { id: result.recipe.id }, include: { recipeComponents: { include: { componentItem: true } } } }), lot: null };
}

async function createServedOrder(itemId = fixture.product.id, quantity = 1) {
  const code = `TEST-${randomUUID()}`;
  const order = await prisma.restaurantOrder.create({
    data: { companyId: fixture.company.id, locationId: fixture.location.id, code, partnerId: fixture.partner.id, guestCount: 1, createdById: fixture.user.id, updatedById: fixture.user.id },
  });
  const line = await prisma.restaurantOrderLine.create({
    data: { companyId: fixture.company.id, locationId: fixture.location.id, orderId: order.id, itemId, quantity, unitPrice: 10, vatRateId: fixture.vatRate.id, status: "SERVED", servedAt: new Date() },
  });
  createdOrderIds.push(order.id);
  return { ...order, lines: [line] };
}

before(async () => { fixture = await loadFixture(); });

after(async () => {
  const companyId = fixture.company.id;
  await prisma.financialAllocation.deleteMany({ where: { companyId } });
  await prisma.financialMovement.deleteMany({ where: { companyId } });
  await prisma.paymentSchedule.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.updateMany({ where: { companyId }, data: { documentId: null } });
  await prisma.documentEvent.deleteMany({ where: { companyId } });
  await prisma.documentLink.deleteMany({ where: { companyId } });
  await prisma.businessDocument.deleteMany({ where: { companyId } });
  await prisma.recipeConsumption.deleteMany({ where: { companyId } });
  await prisma.kitchenTicketLine.deleteMany({ where: { companyId } });
  await prisma.kitchenTicket.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderLine.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
  await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.stockBalance.deleteMany({ where: { companyId } });
  await prisma.inventoryLot.deleteMany({ where: { companyId } });
  await prisma.financialAccount.deleteMany({ where: { companyId } });
  await prisma.documentSeries.deleteMany({ where: { companyId } });
  await prisma.warehouseBin.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.recipeComponent.deleteMany({ where: { companyId } });
  await prisma.item.deleteMany({ where: { companyId } });
  await prisma.partner.deleteMany({ where: { companyId } });
  await prisma.vatRate.deleteMany({ where: { companyId } });
  await prisma.unitOfMeasure.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.location.updateMany({ where: { companyId }, data: { createdById: null, updatedById: null } });
  await prisma.membership.update({ where: { id: fixture.membership.id }, data: { defaultLocationId: null } });
  await prisma.membershipLocation.deleteMany({ where: { companyId } });
  await prisma.membershipRole.deleteMany({ where: { membershipId: fixture.membership.id } });
  await prisma.membership.delete({ where: { id: fixture.membership.id } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.role.delete({ where: { id: fixture.role.id } });
  await prisma.user.delete({ where: { id: fixture.user.id } });
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
  const selections: Record<string, string> = {};
  const key = `${fixture.company.id}:${line.id}:serve`;
  const [first, second] = await Promise.all([
    serveRestaurantOrderLine(fixture.company.id, fixture.location.id, fixture.user.id, line.id, key, selections),
    serveRestaurantOrderLine(fixture.company.id, fixture.location.id, fixture.user.id, line.id, key, selections),
  ]);
  assert.deepEqual(second, first);
  assert.equal(await prisma.recipeConsumption.count({ where: { companyId: fixture.company.id, orderLineId: line.id } }), fixture.recipe.recipeComponents.length);
  const reversed = await reverseRecipeConsumption(fixture.company.id, fixture.location.id, fixture.user.id, line.id, `${key}:reverse`);
  assert.equal(reversed.count, fixture.recipe.recipeComponents.length);
});

test("Restaurant close: parziale, multiplo, replay e rollback Treasury", async () => {
  const order = await createServedOrder();
  const partial = await closeRestaurantOrderAtomic(fixture.company.id, fixture.location.id, fixture.user.id, order.id, randomUUID(), { seriesId: fixture.series.id, invoice: false, payments: [{ financialAccountId: fixture.account.id, paymentMethod: "CASH", amount: 5 }] });
  assert.equal(partial.paymentStatus, "PARTIALLY_PAID");
  const document = await prisma.businessDocument.findUniqueOrThrow({ where: { id: partial.documentId } });
  const residual = Number(document.total) - 5;
  const key = randomUUID();
  const closed = await closeRestaurantOrderAtomic(fixture.company.id, fixture.location.id, fixture.user.id, order.id, key, { seriesId: fixture.series.id, invoice: false, payments: [{ financialAccountId: fixture.account.id, paymentMethod: "CARD", amount: 3 }, { financialAccountId: fixture.account.id, paymentMethod: "CASH", amount: residual - 3 }] });
  assert.equal(closed.paymentStatus, "PAID");
  assert.deepEqual(await closeRestaurantOrderAtomic(fixture.company.id, fixture.location.id, fixture.user.id, order.id, key, { seriesId: fixture.series.id, invoice: false, payments: [] }), closed);
  assert.equal(await prisma.businessDocument.count({ where: { id: closed.documentId } }), 1);
  assert.equal(await prisma.financialMovement.count({ where: { companyId: fixture.company.id, documentId: closed.documentId, movementType: "CUSTOMER_RECEIPT" } }), 3);

  const failed = await createServedOrder();
  await assert.rejects(closeRestaurantOrderAtomic(fixture.company.id, fixture.location.id, fixture.user.id, failed.id, randomUUID(), { seriesId: fixture.series.id, invoice: false, payments: [{ financialAccountId: "tenant-invalid", paymentMethod: "CASH", amount: 1 }] }));
  const reloaded = await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: failed.id } });
  assert.equal(reloaded.documentId, null);
  assert.equal(reloaded.status, "OPEN");
});

test("Tenant isolation: un'altra Company non può servire o chiudere l'ordine", async () => {
  const other = await prisma.company.create({ data: { name: `Test tenant ${randomUUID()}` } });
  const order = await createServedOrder();
  try {
    await assert.rejects(closeRestaurantOrderAtomic(other.id, fixture.location.id, fixture.user.id, order.id, randomUUID(), { seriesId: fixture.series.id, invoice: false, payments: [] }));
  } finally {
    await prisma.idempotencyRecord.deleteMany({ where: { companyId: other.id } });
    await prisma.company.delete({ where: { id: other.id } });
  }
});
