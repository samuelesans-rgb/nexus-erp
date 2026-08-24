import "dotenv/config";

import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const sourceUrl = process.env.DATABASE_URL ?? "";
const databaseUrl = sourceUrl.includes("_test") ? sourceUrl : sourceUrl.replace("nexus_erp", "nexus_erp_test");
if (!databaseUrl.includes("_test")) throw new Error("Gli E2E richiedono DATABASE_URL _test.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const email = "admin@nexuserp.local";
const password = "Admin123!";

async function cleanupRestaurantE2ETestArtifacts(
  companyId: string,
  createdOrderIds: string[],
  createdTableIds: string[],
  createdDocumentIds: string[],
) {
  const tableIds = createdTableIds.filter(Boolean);
  const orders = await prisma.restaurantOrder.findMany({
    where: {
      companyId,
      OR: [
        { id: { in: createdOrderIds.filter(Boolean) } },
        { tableId: { in: tableIds } },
      ],
    },
    select: { id: true, documentId: true },
  });
  const orderIds = [...new Set(orders.map((order) => order.id))];
  const documentIds = [...new Set([
    ...createdDocumentIds.filter(Boolean),
    ...orders.flatMap((order) => order.documentId ? [order.documentId] : []),
  ])];

  if (orderIds.length) {
    const lines = await prisma.restaurantOrderLine.findMany({ where: { companyId, orderId: { in: orderIds } }, select: { id: true } });
    const lineIds = lines.map((line) => line.id);
    const tickets = await prisma.kitchenTicket.findMany({ where: { companyId, orderId: { in: orderIds } }, select: { id: true } });
    const ticketIds = tickets.map((ticket) => ticket.id);

    await prisma.recipeConsumption.deleteMany({ where: { companyId, orderId: { in: orderIds } } });
    await prisma.kitchenTicketLine.deleteMany({ where: { companyId, orderLineId: { in: lineIds } } });
    await prisma.kitchenTicket.deleteMany({ where: { companyId, id: { in: ticketIds } } });

    const movements = await prisma.inventoryMovement.findMany({ where: { companyId, referenceType: "RestaurantOrderLine", referenceId: { in: lineIds } }, select: { id: true, warehouseId: true, itemId: true, quantity: true, direction: true } });
    for (const movement of movements) {
      const balance = await prisma.stockBalance.findUnique({ where: { companyId_warehouseId_itemId: { companyId, warehouseId: movement.warehouseId, itemId: movement.itemId } } });
      if (balance) {
        const nextQuantity = Number(balance.quantity) - Number(movement.quantity) * movement.direction;
        await prisma.stockBalance.update({ where: { companyId_warehouseId_itemId: { companyId, warehouseId: movement.warehouseId, itemId: movement.itemId } }, data: { quantity: nextQuantity } });
      }
    }
    await prisma.inventoryMovement.deleteMany({ where: { id: { in: movements.map((movement) => movement.id) } } });
    await prisma.restaurantOrderLine.deleteMany({ where: { companyId, id: { in: lineIds } } });
    await prisma.restaurantOrder.deleteMany({ where: { companyId, id: { in: orderIds } } });
  }

  if (documentIds.length) {
    await prisma.financialMovement.deleteMany({ where: { companyId, documentId: { in: documentIds } } });
    await prisma.paymentSchedule.deleteMany({ where: { companyId, documentId: { in: documentIds } } });
    await prisma.businessDocumentLine.deleteMany({ where: { companyId, documentId: { in: documentIds } } });
    await prisma.businessDocument.deleteMany({ where: { companyId, id: { in: documentIds } } });
  }

  if (tableIds.length) {
    await prisma.restaurantTable.deleteMany({ where: { companyId, id: { in: tableIds } } });
  }
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Restaurant Core: login, cucina, pagamenti e idempotenza UI", async ({ page }) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const restaurantReceiptSeries = await prisma.documentSeries.findFirstOrThrow({
    where: {
      companyId: company.id,
      documentType: "SALES_RECEIPT",
      active: true,
    },
    select: { id: true },
  });
  const recipe = await prisma.item.findFirstOrThrow({
    where: {
      companyId: company.id,
      type: "RECIPE",
      active: true,
      deletedAt: null,
    },
    select: { id: true, name: true, recipeComponents: { select: { componentItem: { select: { id: true, trackLots: true, trackExpiration: true } } }, take: 1 } },
  });
  const ingredient = recipe.recipeComponents[0]?.componentItem;
  if (!ingredient) throw new Error("La fixture Core E2E richiede una ricetta con componente.");
  await prisma.item.update({
    where: { id: ingredient.id },
    data: { trackLots: false, trackExpiration: false },
  });

  const createdOrderIds: string[] = [];
  const createdTableIds: string[] = [];
  const createdDocumentIds: string[] = [];
  let createdAreaId = "";
  let fixtureMembershipId = "";
  let originalDefaultLocationId: string | null = null;
  let fixtureBalanceId = "";
  let originalBalanceQuantity = 0;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tableCode = `E2E-${suffix}`;
  const tableName = `Tavolo E2E ${suffix}`;

  try {
    const membership = await prisma.membership.findFirstOrThrow({ where: { companyId: company.id, user: { email }, active: true }, include: { authorizedLocations: { include: { location: { include: { warehouses: { where: { active: true, deletedAt: null }, include: { balances: { where: { itemId: ingredient.id, quantity: { gt: 0 } } } } } } } } } } });
    const location = membership.authorizedLocations.map((row) => row.location).find((row) => row.active && !row.deletedAt && row.warehouses.some((warehouse) => warehouse.balances.length > 0));
    if (!location) throw new Error("La fixture Core E2E richiede una Location autorizzata con stock ingrediente.");
    fixtureMembershipId = membership.id;
    originalDefaultLocationId = membership.defaultLocationId;
    await prisma.membership.update({ where: { id: membership.id }, data: { defaultLocationId: location.id } });
    const fixtureBalance = location.warehouses.flatMap((warehouse) => warehouse.balances)[0];
    if (!fixtureBalance) throw new Error("Stock ingrediente non disponibile per la fixture Core E2E.");
    fixtureBalanceId = fixtureBalance.id;
    originalBalanceQuantity = Number(fixtureBalance.quantity);
    await prisma.stockBalance.update({ where: { id: fixtureBalance.id }, data: { quantity: 100 } });
    const area = await prisma.restaurantArea.create({ data: { companyId: company.id, locationId: location.id, code: `E2E-AREA-${suffix}`, name: `Area Core E2E ${suffix}` } });
    createdAreaId = area.id;
    const table = await prisma.restaurantTable.create({
      data: {
        companyId: company.id,
        locationId: location.id,
        areaId: area.id,
        code: tableCode,
        name: tableName,
        seats: 2,
        status: "AVAILABLE",
      },
      select: { id: true, name: true },
    });
    createdTableIds.push(table.id);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/restaurant/orders/new");
    await page.locator('select[name="tableIds"]').selectOption(table.id);
    await page.locator('select[name="partnerId"]').selectOption({ index: 1 });
    await page.getByRole("button", { name: "Apri comanda" }).click();
    await expect(page).toHaveURL(
      /\/restaurant\/orders\/(?!new(?:\/)?(?:\?.*)?$)[^/?]+(?:\?.*)?$/,
    );
    const orderUrl = new URL(page.url());
    const orderId = orderUrl.pathname.split("/").filter(Boolean).at(-1);
    if (!orderId || orderId === "new") {
      throw new Error(`Order ID non valido nell'URL: ${page.url()}`);
    }
    createdOrderIds.push(orderId);

    for (let index = 0; index < 2; index += 1) {
      await page.locator('select[name="itemId"]').selectOption(recipe.id);
      await page.locator('input[name="quantity"]').fill("1");
      await page.getByRole("button", { name: "Aggiungi riga" }).click();
    }

    await page.getByRole("button", { name: "Invia in cucina" }).click();
    await expect.poll(
      () =>
        prisma.kitchenTicketLine.count({
          where: {
            companyId: company.id,
            orderLine: { orderId },
          },
        }),
      { timeout: 10_000 },
    ).toBe(2);
    await page.goto("/restaurant/kitchen");
    const ticketCards = page.locator(`[data-order-id="${orderId}"]`);
    const servedButtons = ticketCards.getByRole("button", { name: "SERVED" });
    const cardsInState = (status: string) =>
      ticketCards.filter({
        has: page.locator("span").filter({
          hasText: new RegExp(`\\s·\\s${status}$`),
        }),
      });
    await expect(ticketCards).toHaveCount(2);
    await expect(servedButtons).toHaveCount(2);

    for (let expected = 1; expected <= 2; expected += 1) {
      const newTicketCards = cardsInState("NEW");
      await expect(newTicketCards).toHaveCount(3 - expected);
      await newTicketCards.getByRole("button", { name: "IN_PREPARATION" }).first().click();
      await expect.poll(
        () => prisma.restaurantOrderLine.count({ where: { orderId, status: "IN_PREPARATION" } }),
      ).toBe(expected);
      await expect.poll(
        () => prisma.kitchenTicketLine.count({ where: { orderLine: { orderId }, status: "IN_PREPARATION" } }),
      ).toBe(expected);
    }

    for (let expected = 1; expected <= 2; expected += 1) {
      const preparingTicketCards = cardsInState("IN_PREPARATION");
      await expect(preparingTicketCards).toHaveCount(3 - expected);
      await preparingTicketCards.getByRole("button", { name: "READY" }).first().click();
      await expect.poll(
        () => prisma.restaurantOrderLine.count({ where: { orderId, status: "READY" } }),
      ).toBe(expected);
      await expect.poll(
        () => prisma.kitchenTicketLine.count({ where: { orderLine: { orderId }, status: "READY" } }),
      ).toBe(expected);
    }

    for (let index = 0; index < 2; index += 1) {
      const readyTicketCards = cardsInState("READY");
      await expect(readyTicketCards).toHaveCount(2 - index);
      await readyTicketCards.getByRole("button", { name: "SERVED" }).first().click();
      await expect.poll(
        () => prisma.restaurantOrderLine.count({ where: { orderId, status: "SERVED" } }),
      ).toBe(index + 1);
      await expect.poll(
        () => prisma.kitchenTicketLine.count({ where: { orderLine: { orderId }, status: "COMPLETED" } }),
      ).toBe(index + 1);
    }

    const servedLines = await prisma.restaurantOrderLine.findMany({ where: { orderId, status: "SERVED" }, select: { id: true } });
    expect(servedLines).toHaveLength(2);

    const recipeConsumptions = await prisma.recipeConsumption.findMany({ where: { orderLineId: { in: servedLines.map((line) => line.id) } }, select: { orderLineId: true, componentItemId: true } });
    expect(recipeConsumptions.length).toBeGreaterThanOrEqual(servedLines.length);
    expect(new Set(recipeConsumptions.map((consumption) => `${consumption.orderLineId}:${consumption.componentItemId}`)).size).toBe(recipeConsumptions.length);

    for (const line of servedLines) {
      expect(await prisma.inventoryMovement.count({ where: { referenceType: "RestaurantOrderLine", referenceId: line.id } })).toBeGreaterThan(0);
    }
    const movements = await prisma.inventoryMovement.findMany({ where: { referenceType: "RestaurantOrderLine", referenceId: { in: servedLines.map((line) => line.id) } }, select: { referenceId: true, itemId: true } });
    expect(new Set(movements.map((movement) => `${movement.referenceId}:${movement.itemId}`)).size).toBe(movements.length);

    await page.goto(`/restaurant/orders/${orderId}`);
    const total = Number((await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } })).lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0));
    const firstPayment = total / 2;
    await page.locator('select[name="seriesId"]').selectOption(restaurantReceiptSeries.id);
    await expect(page.getByRole("checkbox", { name: "Fattura" })).not.toBeChecked();
    await page.locator('input[name="amount"]').fill(firstPayment.toFixed(2));
    await page.getByRole("button", { name: "Registra conto" }).click();
    await expect.poll(async () => {
      const order = await prisma.restaurantOrder.findFirst({
        where: { id: orderId, companyId: company.id },
        select: { paymentStatus: true },
      });
      return order?.paymentStatus;
    }).toBe("PARTIALLY_PAID");
    await expect(page.getByText("PARTIALLY_PAID")).toBeVisible();

    const partiallyPaidOrder = await prisma.restaurantOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { documentId: true },
    });
    if (!partiallyPaidOrder.documentId) {
      throw new Error("Documento non associato dopo il primo pagamento.");
    }
    const partiallyPaidDocument = await prisma.businessDocument.findUniqueOrThrow({
      where: { id: partiallyPaidOrder.documentId },
      select: { total: true },
    });
    const remainingAmount = Number(partiallyPaidDocument.total) - firstPayment;

    await page.locator('select[name="paymentMethod"]').selectOption("CARD");
    await page.locator('input[name="amount"]').fill(remainingAmount.toFixed(2));
    await page.getByRole("button", { name: "Registra conto" }).dblclick();
    await expect.poll(async () => {
      const closedOrder = await prisma.restaurantOrder.findFirst({
        where: { id: orderId, companyId: company.id },
        select: { paymentStatus: true, status: true },
      });
      return `${closedOrder?.status}:${closedOrder?.paymentStatus}`;
    }).toBe("CLOSED:PAID");
    await expect.poll(async () => {
      const residual = await prisma.paymentSchedule.aggregate({
        where: { companyId: company.id, documentId: partiallyPaidOrder.documentId },
        _sum: { residualAmount: true },
      });
      return Number(residual._sum.residualAmount ?? 0);
    }).toBe(0);
    await expect.poll(() =>
      prisma.financialMovement.count({
        where: {
          companyId: company.id,
          documentId: partiallyPaidOrder.documentId,
          movementType: "CUSTOMER_RECEIPT",
        },
      }),
    ).toBe(2);
    await expect(page.getByText("CLOSED · PAID")).toBeVisible();

    const order = await prisma.restaurantOrder.findUniqueOrThrow({ where: { id: orderId }, include: { document: true, table: true } });
    if (order.documentId) createdDocumentIds.push(order.documentId);
    expect(order.document?.status).toBe("POSTED");
    expect(order.table?.status).toBe("DIRTY");
    expect(await prisma.financialMovement.count({ where: { documentId: order.documentId, movementType: "CUSTOMER_RECEIPT" } })).toBe(2);
    await page.reload();
    if (!order.documentId) throw new Error("Documento non associato all'ordine test.");
    expect(await prisma.businessDocument.count({ where: { id: order.documentId } })).toBe(1);

    await page.getByRole("button", { name: /logout|esci/i }).click();
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await cleanupRestaurantE2ETestArtifacts(company.id, createdOrderIds, createdTableIds, createdDocumentIds);
    if (fixtureMembershipId) await prisma.membership.update({ where: { id: fixtureMembershipId }, data: { defaultLocationId: originalDefaultLocationId } });
    if (fixtureBalanceId) await prisma.stockBalance.update({ where: { id: fixtureBalanceId }, data: { quantity: originalBalanceQuantity } });
    if (createdAreaId) await prisma.restaurantArea.deleteMany({ where: { id: createdAreaId, companyId: company.id } });
    await prisma.item.update({
      where: { id: ingredient.id },
      data: {
        trackLots: ingredient.trackLots,
        trackExpiration: ingredient.trackExpiration,
      },
    });
  }
});
