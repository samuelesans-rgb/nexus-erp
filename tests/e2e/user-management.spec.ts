import "dotenv/config";

import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test"))
  throw new Error("User management E2E requires a _test database.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
test.afterAll(() => prisma.$disconnect());

test("admin crea SALA; SALA non vede né apre Utenti", async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const email = `sala-ui-${suffix}@test.invalid`;
  const password = "SalaInterface123!";
  let userId = "";
  let membershipId = "";
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@nexuserp.local");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "Utenti" })).toBeVisible();
  await page.getByRole("link", { name: "Utenti" }).click();
  await expect(page.getByRole("heading", { name: "Utenti" })).toBeVisible();
  await page.getByRole("link", { name: "Nuovo utente" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Cameriere");
  await page.getByLabel("Cognome", { exact: true }).fill("E2E");
  await page.getByLabel("Email / login").fill(email);
  await page.getByLabel("Password iniziale").fill(password);
  await page.locator('input[name="locationIds"]').first().check();
  await page.getByRole("button", { name: "Salva utente" }).click();
  await expect(page).toHaveURL(/\/users\?success=/);
  await expect(page.getByText(email)).toBeVisible();
  const membership = await prisma.membership.findFirstOrThrow({
    where: { user: { email } },
  });
  membershipId = membership.id;
  userId = membership.userId;

  const salaContext = await browser.newContext();
  const salaPage = await salaContext.newPage();
  try {
    await salaPage.goto("/login");
    await salaPage.getByLabel("Email").fill(email);
    await salaPage.getByLabel("Password").fill(password);
    await salaPage.getByRole("button", { name: "Accedi" }).click();
    await expect(salaPage).toHaveURL(/\/restaurant\/floor/);
    await expect
      .poll(
        async () =>
          (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
            .lastLogin,
      )
      .not.toBeNull();
    await expect(salaPage.getByRole("link", { name: "Utenti" })).toHaveCount(0);
    await salaPage.goto("/users");
    await expect(salaPage).toHaveURL(/\/restaurant\/floor/);
  } finally {
    await salaContext.close();
    if (userId) {
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId }, { entityId: membershipId }] },
      });
      await prisma.user.delete({ where: { id: userId } });
    }
  }
});
