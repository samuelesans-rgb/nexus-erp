import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";

const staffEmail = "admin@nexuserp.local";
const staffPassword = "Admin123!";

function dateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Public Booking: prenotazione pubblica e gestione completa staff", async ({ page }) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { companyId: company.id, active: true, user: { email: staffEmail } }, select: { defaultLocationId: true } });
  const location = await prisma.location.findFirstOrThrow({
    where: { id: membership.defaultLocationId ?? undefined, companyId: company.id, active: true, deletedAt: null, restaurantBookingSettings: { is: { enabled: true } } },
    select: { id: true, slug: true },
  });
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const guestName = `Cliente E2E ${suffix}`;
  const guestEmail = `booking-e2e-${suffix}@example.test`;
  const bookingDate = new Date();
  bookingDate.setDate(bookingDate.getDate() + 50);
  bookingDate.setHours(12, 0, 0, 0);
  let reservationId: string | undefined;

  try {
    await page.goto(`/book/${location.slug}`);
    await expect(page.getByText("Prenota un tavolo", { exact: true })).toBeVisible();
    await page.locator('input[name="date"]').fill(dateValue(bookingDate));
    await page.locator('input[name="people"]').fill("2");
    await page.getByRole("button", { name: "Mostra orari" }).click();
    await page.getByRole("radio").first().check();
    await page.getByLabel("Nome e cognome").fill(guestName);
    await page.getByLabel("Telefono").fill("+390212345678");
    await page.getByLabel("Email").fill(guestEmail);
    await page.getByLabel("Note (facoltative)").fill("Prenotazione E2E pubblica");
    await page.getByRole("checkbox", { name: /Acconsento al trattamento/ }).check();
    await page.getByRole("button", { name: "Conferma prenotazione" }).click();
    await expect(page.getByText("Prenotazione ricevuta")).toBeVisible();
    const code = (await page.locator("#confirmation-title").textContent())?.trim();
    expect(code).toMatch(/^RES-[A-F0-9]+$/);
    const reservation = await prisma.restaurantReservation.findFirstOrThrow({ where: { companyId: company.id, locationId: location.id, code, email: guestEmail }, include: { tables: true } });
    reservationId = reservation.id;

    await page.goto("/login");
    await page.getByLabel("Email").fill(staffEmail);
    await page.getByLabel("Password").fill(staffPassword);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(`/restaurant/reservations?date=${dateValue(reservation.startTime)}&q=${encodeURIComponent(code!)}`);
    await expect(page.getByText(code!, { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Dettaglio" }).click();
    await expect(page.getByRole("heading", { name: code! })).toBeVisible();
    await page.getByRole("button", { name: "Conferma", exact: true }).click();
    await expect(page.getByText("CONFIRMED · WEBSITE")).toBeVisible();

    const assignedTableId = reservation.tables[0]?.tableId;
    const alternateTable = await prisma.restaurantTable.findFirstOrThrow({
      where: { companyId: company.id, locationId: location.id, id: assignedTableId ? { not: assignedTableId } : undefined, active: true, deletedAt: null, status: { notIn: ["OUT_OF_SERVICE", "OCCUPIED"] }, OR: [{ maxSeats: { gte: 2 } }, { maxSeats: null, seats: { gte: 2 } }] },
      select: { id: true },
    });
    await page.locator('select[name="tableId"]').selectOption(alternateTable.id);
    await page.getByRole("button", { name: /Cambia tavolo|Assegna tavolo/ }).click();
    await expect.poll(() => prisma.restaurantReservationTable.count({ where: { reservationId: reservation.id, tableId: alternateTable.id } })).toBe(1);

    await page.getByRole("button", { name: "Annulla" }).click();
    await expect(page.getByText("CANCELLED · WEBSITE")).toBeVisible();
    await expect.poll(async () => (await prisma.restaurantReservation.findUnique({ where: { id: reservation.id }, select: { status: true } }))?.status).toBe("CANCELLED");
  } finally {
    if (!reservationId) reservationId = (await prisma.restaurantReservation.findFirst({ where: { companyId: company.id, locationId: location.id, email: guestEmail }, select: { id: true } }))?.id;
    if (reservationId) {
      await prisma.domainEvent.deleteMany({ where: { companyId: company.id, aggregateType: "RestaurantReservation", aggregateId: reservationId } });
      await prisma.restaurantReservationTable.deleteMany({ where: { companyId: company.id, reservationId } });
      await prisma.restaurantReservation.deleteMany({ where: { id: reservationId, companyId: company.id } });
      await prisma.idempotencyRecord.deleteMany({ where: { companyId: company.id, aggregateType: "RestaurantReservation", aggregateId: reservationId } });
    }
  }
});
