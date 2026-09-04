import "dotenv/config";
import { expect, test } from "@playwright/test";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("_test"))
  throw new Error("Floor editor E2E requires _test DB.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
test.afterAll(() => prisma.$disconnect());

test("admin configura una pianta e SALA la usa read-only a 390x844", async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString(36),
    code = `ROOM-${suffix}`,
    email = `floor-sala-${suffix}@test.invalid`,
    password = "FloorSala123!";
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@nexuserp.local" },
  });
  const membership = await prisma.membership.findFirstOrThrow({
    where: { userId: admin.id, active: true },
    include: { authorizedLocations: true },
  });
  let locationId =
    membership.defaultLocationId ??
    membership.authorizedLocations[0]?.locationId;
  if (!locationId) throw new Error("Sede E2E assente.");
  let areaId = "",
    tableId = "",
    salaUserId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@nexuserp.local");
    await page.getByLabel("Password").fill("Admin123!");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/restaurant/settings/floor");
    await expect(
      page.getByRole("heading", { name: "Configurazione Sala" }),
    ).toBeVisible();
    await expect(page.getByText("+ Nuova sala")).toBeVisible();
    await page.getByText("+ Nuova sala").click();
    await page.getByPlaceholder("Codice").fill(code);
    await page.getByPlaceholder("Nome sala").fill(`Sala E2E ${suffix}`);
    await page.getByRole("button", { name: "Crea sala" }).click();
    await expect(page).toHaveURL(/\/restaurant\/settings\/floor\?success=/);
    const area = await prisma.restaurantArea.findFirstOrThrow({
      where: { code: code.toUpperCase() },
    });
    areaId = area.id;
    locationId = area.locationId;
    const usedFusionNumbers = new Set(
      (
        await prisma.restaurantTable.findMany({
          where: {
            companyId: area.companyId,
            locationId,
            fusionTableNumber: { not: null },
          },
          select: { fusionTableNumber: true },
        })
      ).map(({ fusionTableNumber }) => fusionTableNumber),
    );
    const fusionTableNumber =
      Array.from({ length: 199 }, (_, index) => index + 1).find(
        (value) => !usedFusionNumbers.has(value),
      ) ?? 199;
    await page.goto(`/restaurant/settings/floor/${areaId}`);
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`Pianta.*Sala E2E ${suffix}`),
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "+ Tavolo" }).click();
    await page.getByLabel("Numero / codice").fill(`T-${suffix}`);
    await page.getByLabel("Nome").fill("Tavolo grafico");
    await page.getByLabel("Capienza").fill("4");
    await page.getByLabel("Tavolo FUSION").fill(String(fusionTableNumber));
    await page.getByRole("button", { name: "Salva tavolo" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`Tavolo T-${suffix}`) }),
    ).toBeVisible();
    const tableCode = `T-${suffix}`.toUpperCase();
    await expect
      .poll(() =>
        prisma.restaurantTable.findFirst({
          where: { companyId: area.companyId, locationId, code: tableCode },
        }),
      )
      .not.toBeNull();
    tableId = (
      await prisma.restaurantTable.findFirstOrThrow({
        where: { companyId: area.companyId, locationId, code: tableCode },
      })
    ).id;
    await page.reload();
    const tableButton = page.getByRole("button", {
      name: new RegExp(`Tavolo ${tableCode}`),
    });
    await expect(tableButton).toBeVisible();
    const box = await tableButton.boundingBox();
    if (!box) throw new Error("Tavolo non renderizzato");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, box.y + box.height + 20);
    await page.mouse.up();
    await page.getByRole("button", { name: /Ruota 90°/ }).click();
    await page.getByRole("button", { name: "Salva pianta" }).click();
    await expect
      .poll(async () =>
        Number(
          (
            await prisma.restaurantTable.findUniqueOrThrow({
              where: { id: tableId },
            })
          ).rotation,
        ),
      )
      .toBe(90);
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: "SALA" },
    });
    const sala = await prisma.user.create({
      data: {
        firstName: "Sala",
        lastName: "Floor",
        email,
        password: await bcrypt.hash(password, 4),
      },
    });
    salaUserId = sala.id;
    await prisma.membership.create({
      data: {
        companyId: area.companyId,
        userId: sala.id,
        active: true,
        isDefault: true,
        defaultLocationId: locationId,
        roles: { create: { roleId: role.id } },
        authorizedLocations: { create: { locationId } },
      },
    });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      salaPage = await context.newPage();
    try {
      await salaPage.goto("/login");
      await salaPage.getByLabel("Email").fill(email);
      await salaPage.getByLabel("Password").fill(password);
      await salaPage.getByRole("button", { name: "Accedi" }).click();
      await expect(salaPage).toHaveURL(/\/restaurant\/floor/);
      const roomButton = salaPage.getByRole("button", {
        name: `Sala E2E ${suffix}`,
      });
      await expect(roomButton).toBeVisible();
      await roomButton.click();
      await expect(
        salaPage.getByRole("button", {
          name: new RegExp("Tavolo grafico: LIBERO"),
        }),
      ).toBeVisible();
      expect(
        await salaPage.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await salaPage.goto("/restaurant/settings/floor");
      await expect(salaPage).toHaveURL(/\/restaurant\/floor/);
    } finally {
      await context.close();
    }
  } finally {
    if (salaUserId) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: salaUserId },
            { entityId: { in: [areaId, tableId].filter(Boolean) } },
          ],
        },
      });
      await prisma.user.delete({ where: { id: salaUserId } });
    } else
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [areaId, tableId].filter(Boolean) } },
      });
    if (areaId) {
      await prisma.restaurantTable.deleteMany({ where: { areaId } });
      await prisma.restaurantArea.delete({ where: { id: areaId } });
    }
  }
});
