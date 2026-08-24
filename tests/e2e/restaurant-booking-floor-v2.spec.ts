import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
const email = "admin@nexuserp.local",
  password = "Admin123!";
test.afterAll(async () => {
  await prisma.$disconnect();
});
test("Booking Floor V2: staff crea layout, combinazione, servizi ed eccezione", async ({
  page,
}) => {
  const company = await prisma.company.findUniqueOrThrow({
      where: { vatNumber: "IT00000000000" },
    }),
    membership = await prisma.membership.findFirstOrThrow({
      where: { companyId: company.id, user: { email } },
      select: { defaultLocationId: true },
    }),
    location = await prisma.location.findUniqueOrThrow({
      where: { id: membership.defaultLocationId ?? "" },
    }),
    suffix = Date.now().toString(36).toUpperCase(),
    areaCode = "E2F-" + suffix,
    tableCodes = ["E2T1-" + suffix, "E2T2-" + suffix],
    serviceNames = ["Pranzo " + suffix, "Cena " + suffix],
    comboName = "Combo " + suffix;
  let areaId = "",
    tableIds: string[] = [],
    serviceIds: string[] = [],
    exceptionId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/restaurant/areas");
    await page
      .locator("select[name=locationId][required]")
      .selectOption(location.id);
    await page.locator('input[name="code"]').fill(areaCode);
    await page.locator('input[name="name"]').fill("Sala E2E " + suffix);
    await page.getByRole("button", { name: "Salva area" }).click();
    await expect
      .poll(() =>
        prisma.restaurantArea.count({
          where: {
            companyId: company.id,
            locationId: location.id,
            code: areaCode,
          },
        }),
      )
      .toBe(1);
    areaId = (
      await prisma.restaurantArea.findFirstOrThrow({
        where: {
          companyId: company.id,
          locationId: location.id,
          code: areaCode,
        },
        select: { id: true },
      })
    ).id;
    for (const code of tableCodes) {
      await page.goto("/restaurant/tables");
      await page.locator('select[name="areaId"]').selectOption(areaId);
      await page.locator('input[name="code"]').fill(code);
      await page.locator('input[name="name"]').fill(code);
      await page.locator('input[name="seats"]').fill("2");
      await page.getByRole("button", { name: "Salva tavolo" }).click();
      await expect
        .poll(() =>
          prisma.restaurantTable.count({
            where: { companyId: company.id, locationId: location.id, code },
          }),
        )
        .toBe(1);
    }
    tableIds = (
      await prisma.restaurantTable.findMany({
        where: { companyId: company.id, code: { in: tableCodes } },
        select: { id: true },
      })
    ).map((x) => x.id);
    await page.goto("/restaurant/floor");
    const tableButton = page.getByRole("button", {
      name: new RegExp(tableCodes[0]),
    });
    const box = await tableButton.boundingBox();
    if (!box) throw new Error("Tavolo non visibile");
    const tableForm = tableButton.locator("..");
    await tableForm.dispatchEvent("pointerdown", {
      pointerId: 1,
      clientX: box.x + 10,
      clientY: box.y + 10,
    });
    await tableForm.dispatchEvent("pointermove", {
      pointerId: 1,
      clientX: box.x + 90,
      clientY: box.y + 70,
    });
    await tableForm.dispatchEvent("pointerup", {
      pointerId: 1,
      clientX: box.x + 90,
      clientY: box.y + 70,
    });
    await tableButton.evaluate((button) =>
      button.closest("form")?.requestSubmit(),
    );
    await expect
      .poll(async () =>
        Number(
          (
            await prisma.restaurantTable.findUniqueOrThrow({
              where: { id: tableIds[0] },
            })
          ).positionX,
        ),
      )
      .not.toBe(20);
    await page.goto("/restaurant/floor");
    await page.locator('input[name="name"]').fill(comboName);
    await page.locator('select[name="tableIds"]').selectOption(tableIds);
    await page.getByRole("button", { name: "Salva combinazione" }).click();
    await expect
      .poll(() =>
        prisma.restaurantTableCombination.count({
          where: {
            companyId: company.id,
            locationId: location.id,
            name: comboName,
          },
        }),
      )
      .toBe(1);
    await page.goto("/restaurant/settings/booking");
    for (const [index, name] of serviceNames.entries()) {
      const form = page
        .locator("form")
        .filter({ has: page.locator('input[name="name"]') })
        .first();
      await form.locator('input[name="name"]').fill(name);
      await form
        .locator('input[name="startTime"]')
        .fill(index ? "19:00" : "12:00");
      await form
        .locator('input[name="endTime"]')
        .fill(index ? "23:00" : "15:00");
      await form.locator('input[name="daysOfWeek"]').first().check();
      await form.getByRole("button", { name: "Aggiungi servizio" }).click();
      await page.goto("/restaurant/settings/booking");
    }
    serviceIds = (
      await prisma.restaurantServiceWindow.findMany({
        where: {
          companyId: company.id,
          locationId: location.id,
          name: { in: serviceNames },
        },
        select: { id: true },
      })
    ).map((x) => x.id);
    const date = new Date();
    date.setDate(date.getDate() + 80);
    const exceptionForm = page
      .locator("form")
      .filter({ has: page.locator('select[name="type"]') });
    await exceptionForm
      .locator('input[name="date"]')
      .fill(date.toISOString().slice(0, 10));
    await exceptionForm.locator('select[name="type"]').selectOption("CLOSED");
    await exceptionForm.locator('input[name="reason"]').fill("Chiusura E2E");
    await exceptionForm
      .getByRole("button", { name: "Aggiungi eccezione" })
      .click();
    await expect
      .poll(() =>
        prisma.restaurantCalendarException.count({
          where: {
            companyId: company.id,
            locationId: location.id,
            reason: "Chiusura E2E",
          },
        }),
      )
      .toBe(1);
    exceptionId = (
      await prisma.restaurantCalendarException.findFirstOrThrow({
        where: {
          companyId: company.id,
          locationId: location.id,
          reason: "Chiusura E2E",
        },
        select: { id: true },
      })
    ).id;
  } finally {
    if (exceptionId)
      await prisma.restaurantCalendarException.deleteMany({
        where: { id: exceptionId },
      });
    if (serviceIds.length)
      await prisma.restaurantServiceWindow.deleteMany({
        where: { id: { in: serviceIds } },
      });
    await prisma.restaurantTableCombinationTable.deleteMany({
      where: { tableId: { in: tableIds } },
    });
    await prisma.restaurantTableCombination.deleteMany({
      where: { companyId: company.id, name: comboName },
    });
    await prisma.restaurantTable.deleteMany({
      where: { companyId: company.id, locationId: location.id, areaId },
    });
    if (areaId)
      await prisma.restaurantArea.deleteMany({ where: { id: areaId } });
  }
});
