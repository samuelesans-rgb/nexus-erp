import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { deriveTableStatusFromRow, tableStatusInclude } from "../../lib/restaurant-table-status";
import { claimConnectorJob, fetchConnectorJobs, getKitchenChannelHealth, PRINT_JOB_MAX_AGE_MINUTES } from "../../lib/kitchen-connector";
import { KitchenChannelOfflineError, addFloorOrderItem, settleFloorOrder, deleteUnsentFloorLine, dispatchFloorOrder, getOperationalRestaurantFloor, openFloorTable, releaseFloorTable, retrySafeFloorJob, updateFloorGuestCount, updateUnsentFloorLine } from "../../lib/restaurant-floor-operations";
import { assignOrderPartner, closeRestaurantOrderAtomic, openOrder } from "../../lib/restaurant-orders";
import { dissolveTableCombination, saveTableCombination } from "../../lib/restaurant-floor";
import { FloorConfigError, getFloorConfiguration, getAreaCombinations, saveFloorArea, saveFloorLayout, saveFloorTable } from "../../lib/restaurant-floor-config";
import { newOrderCode, reassignOrderTables } from "../../lib/restaurant-orders";
import { transitionReservation } from "../../lib/restaurant-booking";
import { advanceKitchenLine } from "../../lib/restaurant-kitchen";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("Restaurant Floor Operations tests require a database ending in _test.");
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", userId = "", tableId = "", secondTableId = "", itemId = "", secondItemId = "", orderId = "";
let areaId = "", comboTableA = "", comboTableB = "", lifecycleTableId = "", walkInTableId = "", invoiceTableId = "", supplierOnlyPartnerId = "", partnerId = "", seriesId = "", accountId = "", invoiceSeriesId = "";
const actor = () => ({ companyId, locationId, userId });

before(async () => {
  companyId = (await prisma.company.create({ data: { name: `Floor ${suffix}`, vatNumber: `FL${suffix}` } })).id;
  locationId = (await prisma.location.create({ data: { companyId, code: `FL-${suffix}`, slug: `floor-${suffix}`, name: "Frisà Bistrò" } })).id;
  userId = (await prisma.user.create({ data: { email: `floor-${suffix}@example.test`, firstName: "Sala", lastName: "Test", password: "unused" } })).id;
  await prisma.membership.create({ data: { companyId, userId, active: true, isDefault: true } });
  const area = await prisma.restaurantArea.create({ data: { companyId, locationId, code: "SALA", name: "Sala" } });
  tableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T1", name: "TAVOLO 1", seats: 4 } })).id;
  secondTableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T2", name: "TAVOLO 2", seats: 4 } })).id;
  lifecycleTableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T3", name: "TAVOLO 3", seats: 4 } })).id;
  areaId = area.id;
  comboTableA = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T6", name: "TAVOLO 6", seats: 2 } })).id;
  comboTableB = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T7", name: "TAVOLO 7", seats: 2 } })).id;
  invoiceTableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T5", name: "TAVOLO 5", seats: 2 } })).id;
  walkInTableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "T4", name: "TAVOLO 4", seats: 2 } })).id;
  partnerId = (await prisma.partner.create({ data: { companyId, code: `P-${suffix}`, name: "Cliente Sala", isCustomer: true } })).id;
  supplierOnlyPartnerId = (await prisma.partner.create({ data: { companyId, code: `S-${suffix}`, name: "Solo Fornitore", isSupplier: true } })).id;
  seriesId = (await prisma.documentSeries.create({ data: { companyId, locationId, code: `RS-${suffix}`, name: "Conto Restaurant", documentType: "SALES_RECEIPT" } })).id;
  accountId = (await prisma.financialAccount.create({ data: { companyId, locationId, code: `CA-${suffix}`, name: "Cassa Sala", type: "CASH", allowOverdraft: true, createdById: userId, updatedById: userId } })).id;
  invoiceSeriesId = (await prisma.documentSeries.create({ data: { companyId, locationId, code: `FT-${suffix}`, name: "Fattura Restaurant", documentType: "SALES_INVOICE" } })).id;
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
  await prisma.recipeConsumption.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderLineModifier.deleteMany({ where: { companyId } }); await prisma.restaurantOrderLine.deleteMany({ where: { companyId } }); await prisma.restaurantOrderTable.deleteMany({ where: { companyId } }); await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.financialAllocation.deleteMany({ where: { companyId } }); await prisma.financialMovement.deleteMany({ where: { companyId } }); await prisma.paymentSchedule.deleteMany({ where: { companyId } });
  await prisma.documentEvent.deleteMany({ where: { companyId } }); await prisma.documentLink.deleteMany({ where: { companyId } }); await prisma.businessDocumentLine.deleteMany({ where: { companyId } }); await prisma.businessDocument.deleteMany({ where: { companyId } });
  await prisma.documentSeries.deleteMany({ where: { companyId } }); await prisma.financialAccount.deleteMany({ where: { companyId } }); await prisma.partner.deleteMany({ where: { companyId } }); await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
  await prisma.kitchenStationAssignment.deleteMany({ where: { companyId } }); await prisma.restaurantPrinter.deleteMany({ where: { companyId } }); await prisma.kitchenStation.deleteMany({ where: { companyId } });
  await prisma.restaurantMenuItem.deleteMany({ where: { companyId } }); await prisma.restaurantMenuSection.deleteMany({ where: { companyId } }); await prisma.restaurantMenu.deleteMany({ where: { companyId } }); await prisma.fusionCatalogMapping.deleteMany({ where: { companyId } });
  await prisma.item.deleteMany({ where: { companyId } }); await prisma.itemCategory.deleteMany({ where: { companyId } }); await prisma.vatRate.deleteMany({ where: { companyId } }); await prisma.unitOfMeasure.deleteMany({ where: { companyId } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } }); await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.restaurantTableCombinationTable.deleteMany({ where: { companyId } }); await prisma.restaurantTableCombination.deleteMany({ where: { companyId } });
  await prisma.membership.deleteMany({ where: { companyId } });
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
  floor = await getOperationalRestaurantFloor(companyId, locationId); const current = floor.orders.find(({ id }) => id === orderId)!; assert.equal(current.lines.find(({ id }) => id === addition.id)?.state, "INCERTA"); assert.equal(current.total, 46);
  assert.match((await prisma.kitchenTicketLine.findFirstOrThrow({ where: { orderLineId: line.id } })).notes ?? "", /Cottura media/);
  assert.equal(await prisma.businessDocument.count({ where: { companyId } }), initialDocuments); assert.equal(await prisma.financialMovement.count({ where: { companyId } }), initialMovements);
  assert.ok((await prisma.auditLog.count({ where: { companyId } })) >= 5);
  await assert.rejects(openFloorTable(actor(), secondTableId, 0), /coperti/);
});

test("tavolo chiuso torna riutilizzabile in Sala senza reset manuale dello stato", async () => {
  const table = () => prisma.restaurantTable.findUniqueOrThrow({ where: { id: lifecycleTableId }, include: tableStatusInclude });
  // Lo stato non e' piu' una colonna: si deriva, ed e' quello che la Sala mostra.
  const derived = async () => deriveTableStatusFromRow(await table());
  // APRI
  const opened = await openOrder(companyId, locationId, userId, { tableId: lifecycleTableId, partnerId, guestCount: 2, serviceType: "DINE_IN" });
  assert.equal(await derived(), "OCCUPIED");
  // INVIA
  const line = await addFloorOrderItem(actor(), opened.id, itemId);
  await dispatchFloorOrder(actor(), opened.id, `lifecycle-${suffix}`);
  await advanceKitchenLine(companyId, locationId, userId, line.id, "IN_PREPARATION");
  await advanceKitchenLine(companyId, locationId, userId, line.id, "READY");
  await advanceKitchenLine(companyId, locationId, userId, line.id, "SERVED");
  // CHIUDI
  const billed = await closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId, invoice: false, payments: [] });
  const total = Number((await prisma.businessDocument.findUniqueOrThrow({ where: { id: billed.documentId! } })).total);
  const closed = await closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId, invoice: false, payments: [{ financialAccountId: accountId, paymentMethod: "CASH", amount: total }] });
  assert.equal(closed.paymentStatus, "PAID");
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } })).status, "CLOSED");
  // Il tavolo resta DA RIASSETTARE e non è riapribile finché non viene liberato.
  assert.equal(await derived(), "DIRTY");
  await assert.rejects(openFloorTable(actor(), lifecycleTableId, 2), /non disponibile/);
  // LIBERA — nessuna scrittura diretta su restaurantTable in questo test.
  await releaseFloorTable(actor(), lifecycleTableId);
  assert.equal(await derived(), "AVAILABLE");
  // RIAPRI
  const reopened = await openFloorTable(actor(), lifecycleTableId, 3);
  assert.notEqual(reopened.id, opened.id);
  assert.equal(await derived(), "OCCUPIED");
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: reopened.id } })).guestCount, 3);
  // Un tavolo con comanda aperta non può essere liberato.
  await assert.rejects(releaseFloorTable(actor(), lifecycleTableId), /comanda aperta/);
});

test("tap ravvicinati sullo stesso prodotto non perdono quantità", async () => {
  const order = await openOrder(companyId, locationId, userId, { tableId: secondTableId, guestCount: 2, serviceType: "DINE_IN" });
  const first = await addFloorOrderItem(actor(), order.id, itemId);
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => addFloorOrderItem(actor(), order.id, itemId)));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 4);
  const lines = await prisma.restaurantOrderLine.findMany({ where: { orderId: order.id, status: "NEW" } });
  const total = lines.reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal(total, 5);
  const target = lines.find((row) => row.id === first.id)!;
  assert.equal(Number(target.lineTotal), Math.round(Number(target.quantity) * Number(target.unitPrice) * 100) / 100);
});

test("comanda aperta da Sala senza cliente è chiudibile a scontrino, non a fattura", async () => {
  const opened = await openFloorTable(actor(), walkInTableId, 2);
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } })).partnerId, null);
  const line = await addFloorOrderItem(actor(), opened.id, secondItemId);
  await dispatchFloorOrder(actor(), opened.id, `walkin-${suffix}`);
  await advanceKitchenLine(companyId, locationId, userId, line.id, "IN_PREPARATION");
  await advanceKitchenLine(companyId, locationId, userId, line.id, "READY");
  await advanceKitchenLine(companyId, locationId, userId, line.id, "SERVED");
  // La fattura continua a richiedere un cliente anagrafico esplicito.
  await assert.rejects(
    closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId: invoiceSeriesId, invoice: true, payments: [] }),
    /cliente anagrafico/,
  );
  // Lo scontrino si chiude usando il cliente di passaggio di sistema.
  const billed = await closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId, invoice: false, payments: [] });
  const walkIn = await prisma.partner.findFirstOrThrow({ where: { companyId, code: "RESTAURANT_WALK_IN" } });
  assert.equal(walkIn.isCustomer, true);
  const stored = await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } });
  assert.equal(stored.partnerId, walkIn.id, "il cliente risolto va persistito sulla comanda");
  const document = await prisma.businessDocument.findUniqueOrThrow({ where: { id: billed.documentId! } });
  assert.equal(document.partnerId, walkIn.id);
  const total = Number(document.total);
  const closed = await closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId, invoice: false, payments: [{ financialAccountId: accountId, paymentMethod: "CASH", amount: total }] });
  assert.equal(closed.paymentStatus, "PAID");
  const movement = await prisma.financialMovement.findFirstOrThrow({ where: { id: { in: closed.movementIds } } });
  assert.equal(movement.partnerId, walkIn.id, "l'incasso deve puntare allo stesso cliente del documento");
  // Il cliente di sistema è unico e riusato dalla comanda successiva.
  await releaseFloorTable(actor(), walkInTableId);
  assert.equal(await prisma.partner.count({ where: { companyId, code: "RESTAURANT_WALK_IN" } }), 1);
});

test("il cliente è assegnabile a comanda aperta e congelato dopo l'emissione del conto", async () => {
  const opened = await openFloorTable(actor(), invoiceTableId, 2);
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } })).partnerId, null);
  // Solo clienti della Company corrente.
  await assert.rejects(assignOrderPartner(companyId, locationId, userId, opened.id, supplierOnlyPartnerId), /Cliente non valido/);
  await assert.rejects(assignOrderPartner(companyId, locationId, userId, opened.id, randomUUID()), /Cliente non valido/);
  // Assegnazione a comanda aperta.
  const assigned = await assignOrderPartner(companyId, locationId, userId, opened.id, partnerId);
  assert.equal(assigned.partnerId, partnerId);
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } })).partnerId, partnerId);
  // Con il cliente assegnato la fattura ora passa.
  const line = await addFloorOrderItem(actor(), opened.id, itemId);
  await dispatchFloorOrder(actor(), opened.id, `invoice-${suffix}`);
  await advanceKitchenLine(companyId, locationId, userId, line.id, "IN_PREPARATION");
  await advanceKitchenLine(companyId, locationId, userId, line.id, "READY");
  await advanceKitchenLine(companyId, locationId, userId, line.id, "SERVED");
  const billed = await closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId: invoiceSeriesId, invoice: true, payments: [] });
  const document = await prisma.businessDocument.findUniqueOrThrow({ where: { id: billed.documentId! } });
  assert.equal(document.partnerId, partnerId);
  assert.equal(document.documentType, "SALES_INVOICE");
  // Emesso il conto, il cliente è congelato.
  await assert.rejects(assignOrderPartner(companyId, locationId, userId, opened.id, supplierOnlyPartnerId), /già stato emesso/);
  const walkIn = await prisma.partner.findFirstOrThrow({ where: { companyId, code: "RESTAURANT_WALK_IN" } });
  await assert.rejects(assignOrderPartner(companyId, locationId, userId, opened.id, walkIn.id), /già stato emesso/);
  assert.equal((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } })).partnerId, partnerId);
  // Chiusa la comanda, l'assegnazione non è più possibile.
  const total = Number(document.total);
  await closeRestaurantOrderAtomic(companyId, locationId, userId, opened.id, randomUUID(), { seriesId: invoiceSeriesId, invoice: true, payments: [{ financialAccountId: accountId, paymentMethod: "CARD", amount: total }] });
  await assert.rejects(assignOrderPartner(companyId, locationId, userId, opened.id, partnerId), /Comanda non valida/);
  await releaseFloorTable(actor(), invoiceTableId);
});

test("la combinazione configurata abilita la comanda multi-tavolo", async () => {
  const pair = [comboTableA, comboTableB];
  // L'unione al volo fra tavoli combinabili della stessa area non richiede più
  // una preconfigurazione: è la regola che permette al canale pubblico di
  // accettare gruppi grandi senza promettere ciò che la Sala non può aprire.
  const adHoc = await openOrder(companyId, locationId, userId, { tableIds: pair, guestCount: 4, serviceType: "DINE_IN" });
  await prisma.restaurantOrder.update({ where: { id: adHoc.id }, data: { status: "CANCELLED" } });

  // Ciò che resta rifiutato: un tavolo dichiarato non combinabile.
  await prisma.restaurantTable.update({ where: { id: comboTableB }, data: { combinable: false } });
  await assert.rejects(
    openOrder(companyId, locationId, userId, { tableIds: pair, guestCount: 4, serviceType: "DINE_IN" }),
    /Combinazione tavoli non consentita/,
    "un tavolo non combinabile non si unisce al volo",
  );
  await prisma.restaurantTable.update({ where: { id: comboTableB }, data: { combinable: true } });
  assert.equal((await getAreaCombinations({ companyId, locationId }, areaId)).length, 0);
  // Creata dalla configurazione Sala, la combinazione compare ed è utilizzabile.
  const combination = await saveTableCombination(companyId, locationId, { name: `Tavolata ${suffix}`, tableIds: pair, active: true });
  const listed = await getAreaCombinations({ companyId, locationId }, areaId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, combination.id);
  assert.deepEqual(new Set(listed[0].tables.map(({ table }) => table.id)), new Set(pair));
  const order = await openOrder(companyId, locationId, userId, { tableIds: pair, guestCount: 4, serviceType: "DINE_IN" });
  assert.equal(await prisma.restaurantOrderTable.count({ where: { orderId: order.id } }), 2);
  // Una combinazione in uso non è scioglibile.
  await assert.rejects(dissolveTableCombination(companyId, locationId, combination.id), /comanda o prenotazione attiva/);
  await prisma.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  await dissolveTableCombination(companyId, locationId, combination.id);
  assert.equal((await getAreaCombinations({ companyId, locationId }, areaId)).length, 0);
});

test("geometria: tondi e quadrati restano a lati uguali anche nel salvataggio pianta", async () => {
  const conf = { companyId, locationId, userId };
  const geoArea = await saveFloorArea(conf, { code: `GEO${suffix.slice(0, 4)}`, name: "Geometria", active: true, sortOrder: 0, layoutWidth: 1200, layoutHeight: 800, backgroundOpacity: 0.1 });
  const base = { areaId: geoArea.id, name: "Tondo", seats: 4, sortOrder: 0, active: true, visibleInFloor: true, fusionTableNumber: null };
  const round = await saveFloorTable(conf, { ...base, code: `R${suffix.slice(0, 4)}`, shape: "ROUND", positionX: 40, positionY: 40, width: 100, height: 100, rotation: 0 });
  const area = await prisma.restaurantArea.findUniqueOrThrow({ where: { id: geoArea.id }, select: { updatedAt: true } });
  // Larghezza != altezza su un tavolo ROUND deve essere respinta anche in batch.
  await assert.rejects(
    saveFloorLayout(conf, geoArea.id, area.updatedAt, [{ id: round.id, positionX: 40, positionY: 40, width: 160, height: 100, rotation: 0 }]),
    (error: unknown) => error instanceof FloorConfigError && /lati uguali/.test((error as Error).message),
  );
  // Il messaggio identifica il tavolo colpevole.
  await assert.rejects(
    saveFloorLayout(conf, geoArea.id, area.updatedAt, [{ id: round.id, positionX: 40, positionY: 40, width: 5000, height: 5000, rotation: 0 }]),
    new RegExp(`R${suffix.slice(0, 4)}`, "i"),
  );
  // Lati uguali passa.
  await saveFloorLayout(conf, geoArea.id, area.updatedAt, [{ id: round.id, positionX: 600, positionY: 400, width: 140, height: 140, rotation: 0 }]);
  const saved = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: round.id } });
  assert.equal(Number(saved.width), 140);
  assert.equal(Number(saved.height), 140);
  // sortOrder non intero respinto come errore di dominio.
  await assert.rejects(
    saveFloorTable(conf, { ...base, id: round.id, code: `R${suffix.slice(0, 4)}`, shape: "ROUND", positionX: 600, positionY: 400, width: 140, height: 140, rotation: 0, sortOrder: Number.NaN }),
    (error: unknown) => error instanceof FloorConfigError && /Ordine non valido/.test((error as Error).message),
  );
  // Codice tavolo duplicato: errore di dominio, non P2002 grezzo.
  await assert.rejects(
    saveFloorTable(conf, { ...base, code: `R${suffix.slice(0, 4)}`, shape: "SQUARE", positionX: 400, positionY: 400, width: 80, height: 80, rotation: 0 }),
    (error: unknown) => error instanceof FloorConfigError && /codice tavolo è già utilizzato/i.test((error as Error).message),
  );
  // Restringere la sala lasciando tavoli fuori pianta è bloccato.
  await assert.rejects(
    saveFloorArea(conf, { id: geoArea.id, code: `GEO${suffix.slice(0, 4)}`, name: "Geometria", active: true, sortOrder: 0, layoutWidth: 320, layoutHeight: 240, backgroundOpacity: 0.1 }),
    (error: unknown) => error instanceof FloorConfigError && /resterebbero fuori dalla pianta/.test((error as Error).message),
  );
  // Allargare resta possibile.
  await saveFloorArea(conf, { id: geoArea.id, code: `GEO${suffix.slice(0, 4)}`, name: "Geometria", active: true, sortOrder: 0, layoutWidth: 1600, layoutHeight: 1000, backgroundOpacity: 0.1 });
});

test("riassegnare una comanda propaga i tavoli alla prenotazione collegata", async () => {
  const start = new Date(Date.now() + 3600000);
  const reservation = await prisma.restaurantReservation.create({
    data: { companyId, locationId, code: `RES-${suffix}`, guestName: "Propagazione", partySize: 2, reservationDate: start, startTime: start, endTime: new Date(start.getTime() + 3600000), durationMinutes: 60, status: "CONFIRMED", tables: { create: [{ tableId: comboTableA }] } },
    select: { id: true },
  });
  const order = await openOrder(companyId, locationId, userId, { reservationId: reservation.id, guestCount: 2, serviceType: "DINE_IN" });
  await reassignOrderTables(companyId, locationId, order.id, [comboTableB]);
  const linked = await prisma.restaurantReservationTable.findMany({ where: { reservationId: reservation.id }, select: { tableId: true } });
  assert.deepEqual(linked.map(({ tableId }) => tableId), [comboTableB], "la prenotazione deve seguire la comanda");
  // Il tavolo liberato può essere ripreso da un walk-in...
  const walkIn = await openOrder(companyId, locationId, userId, { tableId: comboTableA, guestCount: 2, serviceType: "DINE_IN" });
  // ...e chiudere la prenotazione non deve più liberarglielo sotto.
  await transitionReservation(companyId, locationId, reservation.id, "SEATED");
  await transitionReservation(companyId, locationId, reservation.id, "COMPLETED");
  assert.equal(deriveTableStatusFromRow(await prisma.restaurantTable.findUniqueOrThrow({ where: { id: comboTableA }, include: tableStatusInclude })), "OCCUPIED", "il tavolo del walk-in non va liberato");
  for (const id of [order.id, walkIn.id]) await prisma.restaurantOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { id: { in: [comboTableA, comboTableB] } }, data: { physicalStatus: "READY" } });
});

test("aperture concorrenti producono codici comanda univoci", async () => {
  // Deterministico: nello stesso millisecondo il solo timestamp collide.
  const generated = new Set(Array.from({ length: 2000 }, () => newOrderCode()));
  assert.equal(generated.size, 2000, "il codice comanda deve essere univoco anche a parità di millisecondo");
  const codes = new Set<string>();
  const tables = [tableId, secondTableId, lifecycleTableId, walkInTableId, invoiceTableId];
  await prisma.restaurantOrder.updateMany({ where: { companyId, locationId, status: { notIn: ["CLOSED", "CANCELLED"] } }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { companyId, locationId, id: { in: tables } }, data: { physicalStatus: "READY" } });
  const results = await Promise.all(tables.map((table) => openOrder(companyId, locationId, userId, { tableId: table, guestCount: 2, serviceType: "DINE_IN" })));
  for (const row of results) codes.add((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: row.id }, select: { code: true } })).code);
  assert.equal(codes.size, tables.length, "ogni comanda deve avere un codice distinto");
});

test("presentazione: lo stato dei tavoli è derivato, non letto dalla colonna", async () => {
  const conf = { companyId, locationId, userId };
  const seen = async () => {
    const floor = await getOperationalRestaurantFloor(companyId, locationId);
    return new Map(floor.areas.flatMap((a) => a.tables).map((t) => [t.id, t.status]));
  };
  // Stato di partenza pulito su un tavolo dedicato.
  await prisma.restaurantOrder.updateMany({ where: { companyId, locationId, status: { notIn: ["CLOSED", "CANCELLED"] } }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { companyId, locationId, id: secondTableId }, data: { physicalStatus: "READY" } });
  assert.equal((await seen()).get(secondTableId), "AVAILABLE");

  // Una comanda aperta rende OCCUPIED senza che nessuno scriva la colonna.
  await prisma.restaurantTable.updateMany({ where: { id: secondTableId }, data: { physicalStatus: "READY" } });
  const order = await openFloorTable(actor(), secondTableId, 2);
  assert.equal((await seen()).get(secondTableId), "OCCUPIED");
  const stored = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: secondTableId } });
  assert.equal(stored.physicalStatus, "READY", "la colonna fisica non cambia per una comanda");

  // Una colonna legacy mentita non influenza più la Sala.
  await prisma.restaurantTable.updateMany({ where: { id: secondTableId }, data: { physicalStatus: "READY" } });
  assert.equal((await seen()).get(secondTableId), "OCCUPIED", "la colonna legacy non è più autorevole");

  // Chiusa la comanda resta lo stato fisico DA RIASSETTARE.
  await prisma.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { id: secondTableId }, data: { physicalStatus: "DIRTY" } });
  assert.equal((await seen()).get(secondTableId), "DIRTY");
  await prisma.restaurantTable.updateMany({ where: { id: secondTableId }, data: { physicalStatus: "OUT_OF_SERVICE" } });
  assert.equal((await seen()).get(secondTableId), "OUT_OF_SERVICE", "il fuori servizio ha la precedenza");

  // Una prenotazione imminente colora il tavolo; una lontana no.
  await prisma.restaurantTable.updateMany({ where: { id: secondTableId }, data: { physicalStatus: "READY" } });
  const soon = new Date(Date.now() + 20 * 60000);
  const resv = await prisma.restaurantReservation.create({ data: { companyId, locationId, code: `RSV-${suffix}`, guestName: "Imminente", partySize: 2, reservationDate: soon, startTime: soon, endTime: new Date(soon.getTime() + 3600000), status: "CONFIRMED", tables: { create: [{ tableId: secondTableId }] } }, select: { id: true } });
  assert.equal((await seen()).get(secondTableId), "RESERVED");
  await prisma.restaurantReservation.update({ where: { id: resv.id }, data: { startTime: new Date(Date.now() + 6 * 3600000), endTime: new Date(Date.now() + 7 * 3600000) } });
  assert.equal((await seen()).get(secondTableId), "AVAILABLE", "una prenotazione oltre la finestra non colora");

  // Anche la configurazione Sala deriva.
  const area = (await getFloorConfiguration(conf)).find((a) => a.tables.some((t) => t.id === secondTableId));
  assert.equal(area?.tables.find((t) => t.id === secondTableId)?.status, "AVAILABLE");
  await prisma.restaurantReservationTable.deleteMany({ where: { reservationId: resv.id } });
  await prisma.restaurantReservation.delete({ where: { id: resv.id } });
});

test("apertura comanda: decidono lo stato fisico e le comande aperte", async () => {
  // Due casi sono spariti da questo test insieme alla colonna legacy: non e'
  // piu' possibile farla mentire "OCCUPIED" senza comanda o "AVAILABLE" con
  // una comanda aperta. Cio' che resta e' la sostanza del controllo.
  const reset = async (physicalStatus: "READY" | "DIRTY" | "OUT_OF_SERVICE") => {
    await prisma.restaurantOrder.updateMany({ where: { companyId, locationId, status: { notIn: ["CLOSED", "CANCELLED"] } }, data: { status: "CANCELLED" } });
    await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus } });
  };

  await reset("READY");
  const opened = await openFloorTable(actor(), comboTableA, 2);
  assert.ok(opened.id);

  // Con una comanda aperta il tavolo e' rifiutato: controllo relazionale.
  await assert.rejects(openFloorTable(actor(), comboTableA, 2), /già occupati|non disponibile/);

  // Stato fisico DA RIASSETTARE: rifiutato.
  await reset("DIRTY");
  await assert.rejects(openFloorTable(actor(), comboTableA, 2), /non disponibile/);

  // Fuori servizio: rifiutato.
  await reset("OUT_OF_SERVICE");
  await assert.rejects(openFloorTable(actor(), comboTableA, 2), /non appartengono|non disponibile/);

  await reset("READY");
  // Una prenotazione imminente colora il tavolo ma NON impedisce il walk-in.
  await reset("READY");
  const soon = new Date(Date.now() + 20 * 60000);
  const resv = await prisma.restaurantReservation.create({ data: { companyId, locationId, code: `WLK-${suffix}`, guestName: "Imminente", partySize: 2, reservationDate: soon, startTime: soon, endTime: new Date(soon.getTime() + 3600000), status: "CONFIRMED", tables: { create: [{ tableId: comboTableA }] } }, select: { id: true } });
  const floor = await getOperationalRestaurantFloor(companyId, locationId);
  assert.equal(floor.areas.flatMap((a) => a.tables).find((t) => t.id === comboTableA)?.status, "RESERVED");
  const walkIn = await openFloorTable(actor(), comboTableA, 2);
  assert.ok(walkIn.id, "una prenotazione imminente non deve bloccare un walk-in");

  await prisma.restaurantOrder.updateMany({ where: { companyId, locationId, status: { notIn: ["CLOSED", "CANCELLED"] } }, data: { status: "CANCELLED" } });
  await prisma.restaurantReservationTable.deleteMany({ where: { reservationId: resv.id } });
  await prisma.restaurantReservation.delete({ where: { id: resv.id } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
});

test("incassato in cassa: chiude senza documento e libera subito il tavolo", async () => {
  const table = () => prisma.restaurantTable.findUniqueOrThrow({ where: { id: comboTableB }, include: tableStatusInclude });
  // Lo stato non e' piu' una colonna: si deriva, ed e' quello che la Sala mostra.
  const derived = async () => deriveTableStatusFromRow(await table());
  await prisma.restaurantTable.updateMany({ where: { id: comboTableB }, data: { physicalStatus: "READY" } });
  const docsBefore = await prisma.businessDocument.count({ where: { companyId } });
  const movesBefore = await prisma.financialMovement.count({ where: { companyId } });
  const opened = await openFloorTable(actor(), comboTableB, 2);
  const sent = await addFloorOrderItem(actor(), opened.id, itemId);
  await dispatchFloorOrder(actor(), opened.id, `settle-${suffix}`);
  const neverSent = await addFloorOrderItem(actor(), opened.id, secondItemId);
  assert.equal((await prisma.restaurantOrderLine.findUniqueOrThrow({ where: { id: neverSent.id } })).status, "NEW");
  assert.equal(await derived(), "OCCUPIED");
  assert.ok(await prisma.kitchenTicket.count({ where: { orderId: opened.id, status: { notIn: ["COMPLETED", "CANCELLED"] } } }) > 0, "l'invio deve aver creato un ticket aperto");

  await settleFloorOrder(actor(), opened.id);

  const order = await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: opened.id } });
  assert.equal(order.status, "CLOSED");
  assert.equal(order.documentId, null, "nessun documento emesso");
  assert.ok(order.closedAt, "closedAt valorizzato");
  // Nulla di documentale o finanziario viene creato dalla chiusura da cassa.
  assert.equal(await prisma.businessDocument.count({ where: { companyId } }), docsBefore);
  assert.equal(await prisma.financialMovement.count({ where: { companyId } }), movesBefore);
  // Righe: anche quella mai inviata risulta servita, per scelta.
  const lines = await prisma.restaurantOrderLine.findMany({ where: { orderId: opened.id } });
  assert.deepEqual(new Set(lines.map((l) => l.status)), new Set(["SERVED"]));
  assert.ok(lines.find((l) => l.id === neverSent.id)?.servedAt, "anche la riga NEW ha servedAt");
  assert.ok(lines.find((l) => l.id === sent.id)?.servedAt);
  // Nessun ticket fantasma nel Kitchen Display.
  assert.equal(await prisma.kitchenTicket.count({ where: { orderId: opened.id, status: { notIn: ["COMPLETED", "CANCELLED"] } } }), 0);
  assert.equal(await prisma.kitchenTicketLine.count({ where: { ticket: { orderId: opened.id }, status: { not: "CANCELLED" } } }), 0);
  // Il tavolo torna libero in un solo gesto: niente DA RIASSETTARE.
  assert.equal((await table()).physicalStatus, "READY", "non passa per DIRTY");
  const floor = await getOperationalRestaurantFloor(companyId, locationId);
  assert.equal(floor.areas.flatMap((a) => a.tables).find((t) => t.id === comboTableB)?.status, "AVAILABLE");
  // Ed e' immediatamente riapribile, senza rilascio esplicito.
  const reopened = await openFloorTable(actor(), comboTableB, 2);
  assert.notEqual(reopened.id, opened.id);
  await prisma.restaurantOrder.update({ where: { id: reopened.id }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableB }, data: { physicalStatus: "READY" } });
});

test("incassato in cassa: rifiutata su comanda inesistente, gia chiusa o gia fatturata", async () => {
  await assert.rejects(settleFloorOrder(actor(), randomUUID()), /Comanda non valida/);
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
  const opened = await openFloorTable(actor(), comboTableA, 2);
  await addFloorOrderItem(actor(), opened.id, itemId);
  await settleFloorOrder(actor(), opened.id);
  await assert.rejects(settleFloorOrder(actor(), opened.id), /Comanda non valida/, "una comanda chiusa non si richiude");

  // Comanda con conto gia emesso: deve rimandare alla chiusura documentale.
  const holder = await prisma.restaurantOrder.findFirstOrThrow({ where: { companyId, documentId: { not: null } }, select: { id: true, documentId: true } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
  const billed = await openFloorTable(actor(), comboTableA, 2);
  await prisma.restaurantOrder.update({ where: { id: holder.id }, data: { documentId: null } });
  await prisma.restaurantOrder.update({ where: { id: billed.id }, data: { documentId: holder.documentId } });
  await assert.rejects(settleFloorOrder(actor(), billed.id), /conto emesso/);
  // ripristino dell'associazione originale
  await prisma.restaurantOrder.update({ where: { id: billed.id }, data: { documentId: null, status: "CANCELLED" } });
  await prisma.restaurantOrder.update({ where: { id: holder.id }, data: { documentId: holder.documentId } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
});

test("incassato in cassa: annulla le comande ancora in coda verso il POS", async () => {
  await prisma.restaurantTable.updateMany({ where: { id: comboTableB }, data: { physicalStatus: "READY" } });
  const opened = await openFloorTable(actor(), comboTableB, 2);
  await addFloorOrderItem(actor(), opened.id, itemId);
  await dispatchFloorOrder(actor(), opened.id, `queued-${suffix}`);
  const queued = await prisma.kitchenPrintJob.findMany({ where: { companyId, ticket: { orderId: opened.id } } });
  assert.ok(queued.length, "l'invio deve aver accodato almeno un job di stampa");
  assert.deepEqual(new Set(queued.map((j) => j.status)), new Set(["PENDING"]));

  // Un secondo job gia' in consegna: il connector tiene il lease e puo' avere
  // gia' scritto sul socket, quindi non va toccato.
  const inFlight = await prisma.kitchenPrintJob.create({
    data: { ...({ companyId, locationId, stationId: queued[0].stationId, ticketId: queued[0].ticketId, printerId: queued[0].printerId, payload: queued[0].payload, payloadHash: queued[0].payloadHash, requestedById: queued[0].requestedById, idempotencyKey: `${companyId}:inflight:${suffix}`, status: "PROCESSING" }) },
  });

  await settleFloorOrder(actor(), opened.id);

  const after = await prisma.kitchenPrintJob.findMany({ where: { companyId, ticket: { orderId: opened.id } } });
  for (const job of after.filter((j) => j.id !== inFlight.id)) {
    assert.equal(job.status, "CANCELLED", "nessun job resta consegnabile dopo la chiusura");
    assert.match(job.lastError ?? "", /incassata in cassa/i);
  }
  assert.equal(
    (await prisma.kitchenPrintJob.findUniqueOrThrow({ where: { id: inFlight.id } })).status,
    "PROCESSING",
    "un job gia' in consegna non viene annullato: il frame puo' essere gia' partito",
  );
  await prisma.kitchenPrintJob.deleteMany({ where: { id: inFlight.id } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableB }, data: { physicalStatus: "READY" } });
});
test("un job la cui comanda e' stata annullata non viene piu' consegnato", async () => {
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
  const opened = await openFloorTable(actor(), comboTableA, 2);
  await addFloorOrderItem(actor(), opened.id, itemId);
  await dispatchFloorOrder(actor(), opened.id, `guard-${suffix}`);
  const job = await prisma.kitchenPrintJob.findFirstOrThrow({ where: { companyId, ticket: { orderId: opened.id }, status: "PENDING" } });
  const device = await prisma.kitchenConnectorDevice.create({
    data: { companyId, locationId, printerId: job.printerId, name: `guard-${suffix}`, credentialHash: `hash-${suffix}`, credentialPrefix: "gu", leaseSeconds: 60 },
  });
  const poll = { id: device.id, companyId, locationId, printerId: job.printerId, leaseSeconds: 60 };
  assert.ok((await fetchConnectorJobs(poll)).some((row) => row.id === job.id), "finche' il ticket e' vivo il job e' consegnabile");

  // Il ticket viene annullato dopo l'accodamento: e' cio' che fa la chiusura da
  // cassa, ed e' cio' che faceva finire una comanda vecchia sul POS.
  await prisma.kitchenTicket.updateMany({ where: { companyId, orderId: opened.id }, data: { status: "CANCELLED" } });

  assert.equal((await fetchConnectorJobs(poll)).some((row) => row.id === job.id), false, "il connector non deve piu' vederlo");
  await assert.rejects(claimConnectorJob(poll, job.id), /non disponibile/i, "e non deve poterlo acquisire nemmeno con una lista stantia");
  assert.equal((await prisma.kitchenPrintJob.findUniqueOrThrow({ where: { id: job.id } })).status, "PENDING", "il job resta invariato: la guardia non lo consuma");

  await prisma.kitchenConnectorDevice.deleteMany({ where: { id: device.id } });
  await prisma.restaurantOrder.update({ where: { id: opened.id }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
});

test("cucina collegata: basta un connector vivo, non servono tutti", async () => {
  const printer = await prisma.restaurantPrinter.findFirstOrThrow({ where: { companyId } });
  const mk = async (name: string, heartbeat: Date | null, extra: Record<string, unknown> = {}) =>
    prisma.kitchenConnectorDevice.create({
      data: { companyId, locationId, printerId: printer.id, name: `${name}-${suffix}`, credentialHash: `h-${name}-${suffix}`, credentialPrefix: name.slice(0, 2), lastHeartbeatAt: heartbeat, ...extra },
    });
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  // Nessun connector configurato non e' un guasto: sarebbe rumore in sala.
  assert.equal((await getKitchenChannelHealth(companyId, locationId)).stale, false);

  const stale = await mk("vecchio", minutesAgo(60 * 24 * 18));
  const health = await getKitchenChannelHealth(companyId, locationId);
  assert.equal(health.stale, true, "un solo device, fermo da 18 giorni: canale giu'");
  assert.equal(health.staleForMinutes, 60 * 24 * 18);

  // La situazione reale di Frisa: un device sostituito e mai revocato accanto a
  // quello vivo. Il canale e' sano, e il banner non deve accendersi.
  const alive = await mk("realme", minutesAgo(0));
  const withBoth = await getKitchenChannelHealth(companyId, locationId);
  assert.equal(withBoth.stale, false, "il device stantio non deve falsare il vivo");
  assert.equal(withBoth.staleForMinutes, 0, "si conta dall'ultimo battito, non dal piu' vecchio");

  // Un device revocato o disattivato non tiene in piedi il canale da solo.
  await prisma.kitchenConnectorDevice.update({ where: { id: alive.id }, data: { active: false, revokedAt: new Date() } });
  assert.equal((await getKitchenChannelHealth(companyId, locationId)).stale, true, "revocato non conta come vivo");

  // E la Sala espone il verdetto, non lo ricalcola per conto suo.
  const floor = await getOperationalRestaurantFloor(companyId, locationId);
  assert.equal(floor.connector.stale, true);
  assert.equal(floor.connector.maxAgeMinutes, PRINT_JOB_MAX_AGE_MINUTES);

  await prisma.kitchenConnectorDevice.deleteMany({ where: { id: { in: [stale.id, alive.id] } } });
});

test("stato riga: la Sala dice cosa il POS ha confermato, non cosa Nexus spera", async () => {
  await prisma.restaurantTable.updateMany({ where: { id: comboTableB }, data: { physicalStatus: "READY" } });
  const opened = await openFloorTable(actor(), comboTableB, 2);
  const line = await addFloorOrderItem(actor(), opened.id, itemId);
  const stateOf = async () => {
    const floor = await getOperationalRestaurantFloor(companyId, locationId);
    return floor.orders.find((o) => o.id === opened.id)?.lines.find((l) => l.id === line.id)?.state;
  };
  assert.equal(await stateOf(), "DA_INVIARE", "prima dell'invio");

  await dispatchFloorOrder(actor(), opened.id, `state-${suffix}`);
  const job = await prisma.kitchenPrintJob.findFirstOrThrow({ where: { companyId, ticket: { orderId: opened.id } } });
  const dispatchId = (await prisma.kitchenTicket.findFirstOrThrow({ where: { companyId, orderId: opened.id } })).dispatchId;
  assert.equal(await stateOf(), "IN_INVIO", "appena inviata");

  // Oltre la tolleranza il ritardo si vede sulla riga, non solo nel banner.
  await prisma.kitchenPrintJob.update({ where: { id: job.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
  assert.equal(await stateOf(), "IN_RITARDO");

  // Conferma del POS: l'unico verde.
  await prisma.kitchenDispatch.update({ where: { id: dispatchId }, data: { fusionStatus: "ACCEPTED" } });
  await prisma.kitchenPrintJob.update({ where: { id: job.id }, data: { status: "PRINTED" } });
  assert.equal(await stateOf(), "ARRIVATA");

  // Rifiuto del POS: rosso anche se il job risulta stampato.
  await prisma.kitchenDispatch.update({ where: { id: dispatchId }, data: { fusionStatus: "REJECTED" } });
  assert.equal(await stateOf(), "NON_ARRIVATA");

  // Incerto: vince su tutto, perche' e' l'unico caso in cui rimandare fa danno.
  await prisma.kitchenPrintJob.update({ where: { id: job.id }, data: { status: "UNCERTAIN" } });
  assert.equal(await stateOf(), "INCERTA");

  // Il difetto strutturale: senza alcun job la riga risultava "INVIATO".
  await prisma.kitchenDispatch.update({ where: { id: dispatchId }, data: { fusionStatus: "PENDING" } });
  await prisma.kitchenPrintJob.deleteMany({ where: { id: job.id } });
  const orphan = await stateOf();
  assert.equal(orphan, "DA_VERIFICARE", "nessun job non significa consegnata");
  assert.notEqual(orphan, "ARRIVATA");

  await prisma.restaurantOrder.update({ where: { id: opened.id }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableB }, data: { physicalStatus: "READY" } });
});

test("invio a canale fermo: rifiutato senza presa d'atto, accettato con, e senza duplicare", async () => {
  const printer = await prisma.restaurantPrinter.findFirstOrThrow({ where: { companyId } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
  const opened = await openFloorTable(actor(), comboTableA, 2);
  await addFloorOrderItem(actor(), opened.id, itemId);
  const key = `offline-${suffix}`;

  // Canale fermo: un connector attivo che non batte da mezz'ora.
  const device = await prisma.kitchenConnectorDevice.create({
    data: { companyId, locationId, printerId: printer.id, name: `off-${suffix}`, credentialHash: `ho-${suffix}`, credentialPrefix: "of", lastHeartbeatAt: new Date(Date.now() - 30 * 60_000) },
  });
  assert.equal((await getKitchenChannelHealth(companyId, locationId)).stale, true);

  await assert.rejects(
    dispatchFloorOrder(actor(), opened.id, key),
    (error: Error) => error instanceof KitchenChannelOfflineError,
    "senza presa d'atto l'invio non passa",
  );
  // Il rifiuto non deve lasciare tracce: niente dispatch, niente ticket, niente
  // job, e soprattutto la chiave resta spendibile.
  assert.equal(await prisma.kitchenDispatch.count({ where: { companyId, orderId: opened.id } }), 0);
  assert.equal(await prisma.kitchenTicket.count({ where: { companyId, orderId: opened.id } }), 0);

  // Con la presa d'atto passa, e la comanda finisce in coda come deve.
  const sent = await dispatchFloorOrder(actor(), opened.id, key, { offlineAcknowledged: true });
  assert.ok(sent.id);
  assert.equal(await prisma.kitchenDispatch.count({ where: { companyId, orderId: opened.id } }), 1);
  const queued = await prisma.kitchenPrintJob.count({ where: { companyId, ticket: { orderId: opened.id }, status: "PENDING" } });
  assert.ok(queued > 0, "la comanda resta in coda, pronta a uscire al ripristino");

  // Stessa chiave dopo il rifiuto: e' lo stesso invio, non uno nuovo.
  const again = await dispatchFloorOrder(actor(), opened.id, key, { offlineAcknowledged: true });
  assert.equal(again.id, sent.id, "idempotenza preservata attraverso il rifiuto");
  assert.equal(await prisma.kitchenDispatch.count({ where: { companyId, orderId: opened.id } }), 1);

  // Canale sano: nessuna presa d'atto richiesta.
  await prisma.kitchenConnectorDevice.update({ where: { id: device.id }, data: { lastHeartbeatAt: new Date() } });
  assert.equal((await getKitchenChannelHealth(companyId, locationId)).stale, false);
  await addFloorOrderItem(actor(), opened.id, secondItemId);
  const healthy = await dispatchFloorOrder(actor(), opened.id, `healthy-${suffix}`);
  assert.ok(healthy.id, "a canale sano l'invio resta un gesto solo");

  await prisma.kitchenConnectorDevice.deleteMany({ where: { id: device.id } });
  await prisma.restaurantOrder.update({ where: { id: opened.id }, data: { status: "CANCELLED" } });
  await prisma.restaurantTable.updateMany({ where: { id: comboTableA }, data: { physicalStatus: "READY" } });
});
