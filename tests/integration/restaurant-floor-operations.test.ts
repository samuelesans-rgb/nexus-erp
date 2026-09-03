import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { addFloorOrderItem, deleteUnsentFloorLine, dispatchFloorOrder, getOperationalRestaurantFloor, openFloorTable, retrySafeFloorJob, updateFloorGuestCount, updateUnsentFloorLine } from "../../lib/restaurant-floor-operations";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("Restaurant Floor Operations tests require a database ending in _test.");
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", userId = "", tableId = "", secondTableId = "", itemId = "", secondItemId = "", orderId = "";
const actor = () => ({ companyId, locationId, userId });

before(async () => {
  companyId = (await prisma.company.create({ data: { name: `Floor ${suffix}`, vatNumber: `FL${suffix}` } })).id;
  locationId = (await prisma.location.create({ data: { companyId, code: `FL-${suffix}`, slug: `floor-${suffix}`, name: "Frisà Bistrò" } })).id;
  userId = (await prisma.user.create({ data: { email: `floor-${suffix}@example.test`, firstName: "Sala", lastName: "Test", password: "unused" } })).id;
  const area = await prisma.restaurantArea.create({ data: { companyId, locationId, code: "SALA", name: "Sala" } });
  tableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T1", name: "TAVOLO 1", seats: 4 } })).id;
  secondTableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T2", name: "TAVOLO 2", seats: 4 } })).id;
  const uom = await prisma.unitOfMeasure.create({ data: { companyId, code: "PZ", name: "Pezzo", symbol: "pz" } });
  const vat = await prisma.vatRate.create({ data: { companyId, code: "IVA10", name: "IVA 10", percentage: 10 } });
  const category = await prisma.itemCategory.create({ data: { companyId, code: "FOOD", name: "Food" } });
  const menu = await prisma.restaurantMenu.create({ data: { companyId, locationId, code: "FRISA_BISTRO", name: "Frisà Bistrò" } });
  const section = await prisma.restaurantMenuSection.create({ data: { companyId, menuId: menu.id, name: "SECONDI", sortOrder: 0 } });
  const station = await prisma.kitchenStation.create({ data: { companyId, locationId, code: "CUCINA", name: "Cucina" } });
  await prisma.restaurantPrinter.create({ data: { companyId, locationId, stationId: station.id, code: "MOCK", name: "Mock", type: "MOCK", connectionType: "MOCK" } });
  const fixtures = [
    { plu: 179, name: "TARTARE DI MANZO", price: 22, visible: true, available: true },
    { plu: 142, name: "FILETTO DI ORATA", price: 24, visible: true, available: true },
    { plu: 300, name: "PRODOTTO NASCOSTO", price: 10, visible: false, available: true },
    { plu: 301, name: "PRODOTTO ESAURITO", price: 10, visible: true, available: false },
    { plu: 302, name: "PREZZO ZERO", price: 0, visible: true, available: true },
    { plu: 19, name: "LEGACY", price: 4, visible: true, available: true },
    { plu: 900, name: "PLU 900", price: 1, visible: true, available: true },
  ];
  for (const [sortOrder, fixture] of fixtures.entries()) {
    const item = await prisma.item.create({ data: { companyId, code: `F_${fixture.plu}`, name: fixture.name, type: "PRODUCT", categoryId: category.id, unitOfMeasureId: uom.id, vatRateId: vat.id, salePrice: fixture.price, sellable: true } });
    if (fixture.plu === 179) itemId = item.id;
    if (fixture.plu === 142) secondItemId = item.id;
    await prisma.fusionCatalogMapping.create({ data: { companyId, locationId, itemId: item.id, plu: fixture.plu, synchronizedName: fixture.name, priceCents: fixture.price * 100, fingerprint: `${suffix}-${fixture.plu}` } });
    await prisma.restaurantMenuItem.create({ data: { companyId, menuSectionId: section.id, itemId: item.id, sortOrder, visible: fixture.visible, available: fixture.available } });
    if (fixture.plu === 179 || fixture.plu === 142) await prisma.kitchenStationAssignment.create({ data: { companyId, kitchenStationId: station.id, itemId: item.id, priority: 100 } });
  }
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId } }); await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.kitchenPrintJob.deleteMany({ where: { companyId } }); await prisma.kitchenTicketLine.deleteMany({ where: { companyId } }); await prisma.kitchenTicket.deleteMany({ where: { companyId } }); await prisma.kitchenDispatch.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderLineModifier.deleteMany({ where: { companyId } }); await prisma.restaurantOrderLine.deleteMany({ where: { companyId } }); await prisma.restaurantOrderTable.deleteMany({ where: { companyId } }); await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.kitchenStationAssignment.deleteMany({ where: { companyId } }); await prisma.restaurantPrinter.deleteMany({ where: { companyId } }); await prisma.kitchenStation.deleteMany({ where: { companyId } });
  await prisma.restaurantMenuItem.deleteMany({ where: { companyId } }); await prisma.restaurantMenuSection.deleteMany({ where: { companyId } }); await prisma.restaurantMenu.deleteMany({ where: { companyId } }); await prisma.fusionCatalogMapping.deleteMany({ where: { companyId } });
  await prisma.item.deleteMany({ where: { companyId } }); await prisma.itemCategory.deleteMany({ where: { companyId } }); await prisma.vatRate.deleteMany({ where: { companyId } }); await prisma.unitOfMeasure.deleteMany({ where: { companyId } });
  await prisma.restaurantTable.deleteMany({ where: { companyId } }); await prisma.restaurantArea.deleteMany({ where: { companyId } }); await prisma.location.deleteMany({ where: { companyId } }); await prisma.company.delete({ where: { id: companyId } }); await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect();
});

test("operational floor lifecycle is incremental, tenant-safe and non-fiscal", async () => {
  const initialJobs = await prisma.kitchenPrintJob.count({ where: { companyId } }), initialDocuments = await prisma.businessDocument.count({ where: { companyId } }), initialMovements = await prisma.financialMovement.count({ where: { companyId } });
  let floor = await getOperationalRestaurantFloor(companyId, locationId);
  assert.equal(floor.areas[0].tables.some(({ id }) => id === tableId), true);
  assert.deepEqual(floor.menu.sections[0].products.map(({ plu }) => plu), [179, 142]);
  await assert.rejects(openFloorTable({ ...actor(), companyId: randomUUID() }, tableId, 2), /non appartengono|non disponibile/);
  const opened = await openFloorTable(actor(), tableId, 2); orderId = opened.id;
  assert.equal(await prisma.kitchenPrintJob.count({ where: { companyId } }), initialJobs);
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: orderId } })).guestCount, 2);
  await updateFloorGuestCount(actor(), orderId, 4);
  const first = await addFloorOrderItem(actor(), orderId, itemId);
  await addFloorOrderItem(actor(), orderId, itemId);
  let line = await prisma.restaurantOrderLine.findUniqueOrThrow({ where: { id: first.id } }); assert.equal(Number(line.quantity), 2); assert.equal(Number(line.lineTotal), 44);
  await updateUnsentFloorLine(actor(), orderId, line.id, { quantity: 1, kitchenNotes: "Cottura media" });
  line = await prisma.restaurantOrderLine.findUniqueOrThrow({ where: { id: line.id } }); assert.equal(Number(line.quantity), 1); assert.equal(line.kitchenNotes, "Cottura media");
  const removable = await addFloorOrderItem(actor(), orderId, secondItemId); await deleteUnsentFloorLine(actor(), orderId, removable.id); assert.equal((await prisma.restaurantOrderLine.findUniqueOrThrow({ where: { id: removable.id } })).status, "CANCELLED");
  const [dispatchA, duplicate] = await Promise.all([dispatchFloorOrder(actor(), orderId, "first"), dispatchFloorOrder(actor(), orderId, "first")]); assert.equal(dispatchA.id, duplicate.id);
  assert.equal(await prisma.kitchenDispatch.count({ where: { orderId } }), 1); assert.equal(await prisma.kitchenTicketLine.count({ where: { dispatchId: dispatchA.id } }), 1);
  await assert.rejects(updateUnsentFloorLine(actor(), orderId, line.id, { quantity: 2 }), /già inviata/);
  const addition = await addFloorOrderItem(actor(), orderId, secondItemId); const dispatchB = await dispatchFloorOrder(actor(), orderId, "second");
  const sent = await prisma.kitchenTicketLine.findMany({ where: { dispatchId: dispatchB.id } }); assert.equal(sent.length, 1); assert.equal(sent[0].orderLineId, addition.id);
  await assert.rejects(dispatchFloorOrder(actor(), orderId, "refresh-new-key"), /Nessuna nuova quantità/); assert.equal(await prisma.kitchenDispatch.count({ where: { orderId } }), 2);
  const secondJob = await prisma.kitchenPrintJob.findFirstOrThrow({ where: { ticket: { dispatchId: dispatchB.id } } });
  await prisma.kitchenPrintJob.update({ where: { id: secondJob.id }, data: { status: "FAILED", lastError: "FUSION_CONNECTION_ERROR" } }); await retrySafeFloorJob(actor(), secondJob.id); assert.equal((await prisma.kitchenPrintJob.findUniqueOrThrow({ where: { id: secondJob.id } })).status, "PENDING");
  await prisma.kitchenPrintJob.update({ where: { id: secondJob.id }, data: { status: "FAILED", lastError: "FUSION_UNCERTAIN_DELIVERY" } }); await assert.rejects(retrySafeFloorJob(actor(), secondJob.id), /Invio incerto/);
  floor = await getOperationalRestaurantFloor(companyId, locationId); const current = floor.orders.find(({ id }) => id === orderId)!; assert.equal(current.lines.find(({ id }) => id === addition.id)?.state, "UNCERTAIN"); assert.equal(current.total, 46);
  assert.match((await prisma.kitchenTicketLine.findFirstOrThrow({ where: { orderLineId: line.id } })).notes ?? "", /Cottura media/);
  assert.equal(await prisma.businessDocument.count({ where: { companyId } }), initialDocuments); assert.equal(await prisma.financialMovement.count({ where: { companyId } }), initialMovements);
  assert.ok((await prisma.auditLog.count({ where: { companyId } })) >= 5);
  await assert.rejects(openFloorTable(actor(), secondTableId, 0), /coperti/);
});
