import "dotenv/config";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test"))
  throw new Error("Kitchen E2E requires _test.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const email = "admin@nexuserp.local",
  password = "Admin123!";
test.describe.configure({ mode: "serial" });
test.afterAll(() => prisma.$disconnect());
test("Kitchen Printing V1: order, addition, print, reprint and cancellation", async ({
  page,
}) => {
  const company = await prisma.company.findUniqueOrThrow({
    where: { vatNumber: "IT00000000000" },
  });
  const membership = await prisma.membership.findFirstOrThrow({
    where: { companyId: company.id, user: { email }, active: true },
    include: { authorizedLocations: true },
  });
  const locationId =
    membership.defaultLocationId ??
    membership.authorizedLocations[0]?.locationId;
  if (!locationId) throw new Error("Location fixture missing");
  const item = await prisma.item.findFirstOrThrow({
    where: {
      companyId: company.id,
      sellable: true,
      active: true,
      deletedAt: null,
      restaurantMenuItems: {
        some: {
          available: true,
          section: {
            active: true,
            menu: { locationId, active: true, deletedAt: null },
          },
        },
      },
      restaurantModifierGroups: {
        none: { active: true, required: true, deletedAt: null },
      },
      kitchenAssignments: {
        some: { active: true, station: { locationId, active: true } },
      },
    },
    include: {
      kitchenAssignments: {
        where: { active: true, station: { locationId, active: true } },
        include: { station: true },
        take: 1,
      },
    },
  });
  const station = item.kitchenAssignments[0].station;
  let printer = await prisma.restaurantPrinter.findFirst({
      where: {
        companyId: company.id,
        locationId,
        stationId: station.id,
        enabled: true,
      },
    }),
    createdPrinter = false;
  if (!printer) {
    printer = await prisma.restaurantPrinter.create({
      data: {
        companyId: company.id,
        locationId,
        stationId: station.id,
        code: `E2E-${Date.now()}`,
        name: "E2E Mock",
      },
    });
    createdPrinter = true;
  }
  let orderId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/restaurant/orders/new");
    await page.locator('select[name="partnerId"]').selectOption({ index: 1 });
    await page.getByRole("button", { name: "Apri comanda" }).click();
    await expect(page).toHaveURL(/\/restaurant\/orders\/(?!new(?:\/|$))[^/]+$/);
    orderId =
      new URL(page.url()).pathname.split("/").filter(Boolean).at(-1) ?? "";
    expect(orderId).not.toBe("new");
    for (const note of ["Prima inviata", "Aggiunta successiva"]) {
      await page.locator('select[name="itemId"]').selectOption(item.id);
      await page.locator('input[name="kitchenNotes"]').fill(note);
      await page.getByRole("button", { name: "Aggiungi riga" }).click();
      await page.getByRole("button", { name: "Invia in cucina" }).click();
      await expect
        .poll(() => prisma.kitchenDispatch.count({ where: { orderId } }))
        .toBe(note === "Prima inviata" ? 1 : 2);
    }
    const dispatches = await prisma.kitchenDispatch.findMany({
      where: { orderId },
      include: { tickets: { include: { lines: true } } },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(dispatches[0].type).toBe("NEW");
    expect(dispatches[1].type).toBe("ADDITION");
    expect(dispatches[1].tickets.flatMap((t) => t.lines)).toHaveLength(1);
    await page.goto("/restaurant/kitchen");
    await expect(page.locator(`[data-order-id="${orderId}"]`)).toHaveCount(2);
    await page.goto("/restaurant/kitchen/print-queue");
    const pending = page.getByText(/PENDING/).first();
    await expect(pending).toBeVisible();
    await page.getByRole("button", { name: "Stampa" }).first().click();
    await expect
      .poll(() =>
        prisma.kitchenPrintJob.count({
          where: { ticket: { orderId }, status: "PRINTED" },
        }),
      )
      .toBeGreaterThan(0);
    const reprintForm = page
      .getByRole("button", { name: "Ristampa" })
      .first()
      .locator("xpath=..");
    await reprintForm.getByPlaceholder("Motivo ristampa").fill("Test E2E");
    await reprintForm.getByRole("button", { name: "Ristampa" }).click();

    await expect
      .poll(() =>
        prisma.kitchenPrintJob.count({
          where: {
            ticket: { orderId },
            type: "REPRINT",
          },
        }),
      )
      .toBeGreaterThan(0);

    const reprint = await prisma.kitchenPrintJob.findFirstOrThrow({
      where: {
        ticket: { orderId },
        type: "REPRINT",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(reprint.payload).toContain("*** RISTAMPA ***");
    await page.goto(`/restaurant/orders/${orderId}`);
    await page.getByRole("button", { name: "Annulla" }).first().click();
    await expect
      .poll(() =>
        prisma.kitchenDispatch.count({
          where: { orderId, type: "CANCELLATION" },
        }),
      )
      .toBe(1);
  } finally {
    if (orderId) {
      const tickets = await prisma.kitchenTicket.findMany({
          where: { orderId },
          select: { id: true },
        }),
        ticketIds = tickets.map((t) => t.id);
      await prisma.auditLog.deleteMany({
        where: { companyId: company.id, entityId: { in: [...ticketIds] } },
      });
      await prisma.kitchenPrintJob.deleteMany({
        where: { ticketId: { in: ticketIds } },
      });
      await prisma.kitchenTicketLine.deleteMany({
        where: { ticketId: { in: ticketIds } },
      });
      await prisma.kitchenTicket.deleteMany({
        where: { id: { in: ticketIds } },
      });
      await prisma.kitchenDispatch.deleteMany({ where: { orderId } });
      await prisma.restaurantOrderLine.deleteMany({ where: { orderId } });
      await prisma.restaurantOrder.deleteMany({ where: { id: orderId } });
    }
    if (createdPrinter && printer)
      await prisma.restaurantPrinter.delete({ where: { id: printer.id } });
  }
});
