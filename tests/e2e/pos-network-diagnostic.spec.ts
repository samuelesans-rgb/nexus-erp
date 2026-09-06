import { expect, test } from "@playwright/test";

test("connector diagnostic rejects unauthenticated requests", async ({ request }) => {
  const response = await request.post("/api/kitchen-connector/v1/network-diagnostic", { data: { operation: "claim" } });
  expect(response.status()).toBe(401);
});

test("authenticated operator cannot enqueue arbitrary payloads or cross-origin diagnostics", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@nexuserp.local");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const absent = await page.request.get("/api/restaurant/pos-network-diagnostic?deviceId=missing-diagnostic-device");
  expect(absent.status()).toBe(200);
  expect(await absent.json()).toEqual({ connector: null, diagnostic: null });
  for (const key of ["host", "port", "command", "path"]) {
    const status = await page.evaluate(async key => (await fetch("/api/restaurant/pos-network-diagnostic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "missing-diagnostic-device", [key]: "denied" }) })).status, key);
    expect(status).toBe(400);
  }
  const deniedOrigin = await page.request.post("/api/restaurant/pos-network-diagnostic", { headers: { origin: "https://untrusted.invalid" }, data: { deviceId: "missing-diagnostic-device" } });
  expect(deniedOrigin.status()).toBe(403);
  const noDevice = await page.evaluate(async () => (await fetch("/api/restaurant/pos-network-diagnostic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "missing-diagnostic-device" }) })).status);
  expect(noDevice).toBe(409);
});
