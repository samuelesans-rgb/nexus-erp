import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { acknowledgeConnectorJob, authenticateConnector, claimConnectorJob, createConnectorTestPrint, createPairingToken, failConnectorJob, fetchConnectorJobs, heartbeatConnector, pairConnector, retryConnectorJob, revokeConnector, rotateConnectorCredential } from "../../lib/kitchen-connector";
import { prisma } from "../../lib/prisma";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("Kitchen Connector tests require a database ending in _test.");
let fixture: Awaited<ReturnType<typeof createFixture>>;

async function createFixture() {
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({ data: { name: `Connector ${suffix}`, vatNumber: `KC${suffix}` } });
  const user = await prisma.user.create({ data: { email: `connector-${suffix}@test.invalid`, firstName: "Test", lastName: "Connector", password: "test" } });
  const location = await prisma.location.create({ data: { companyId: company.id, code: "KC", slug: `kc-${suffix}`, name: "Kitchen" } });
  const station = await prisma.kitchenStation.create({ data: { companyId: company.id, locationId: location.id, code: "K", name: "Kitchen" } });
  const printer = await prisma.restaurantPrinter.create({ data: { companyId: company.id, locationId: location.id, stationId: station.id, code: "SIM", name: "Simulator" } });
  return { company, user, location, station, printer };
}

before(async () => { fixture = await createFixture(); });
after(async () => {
  const companyId = fixture.company.id;
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.kitchenPrintJob.deleteMany({ where: { companyId } });
  await prisma.kitchenConnectorDevice.deleteMany({ where: { companyId } });
  await prisma.kitchenConnectorPairingToken.deleteMany({ where: { companyId } });
  await prisma.restaurantPrinter.deleteMany({ where: { companyId } });
  await prisma.kitchenStation.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.user.delete({ where: { id: fixture.user.id } });
  await prisma.$disconnect();
});

test("Kitchen Connector V1 integration and simulator lifecycle", async () => {
  const pairToken = await createPairingToken(fixture.company.id, fixture.location.id, fixture.printer.id, fixture.user.id, 5);
  const paired = await pairConnector(pairToken.pairingToken, { name: "simulator", serialConfig: { port: "virtual" } });
  await assert.rejects(pairConnector(pairToken.pairingToken, { name: "duplicate" }));
  let device = await authenticateConnector(paired.credential);
  await heartbeatConnector(device.id, { printerOnline: true, queueDepth: 0, failedJobs: 0, diagnostics: { adapter: "SIMULATOR" } });
  const job = await createConnectorTestPrint(fixture.company.id, fixture.location.id, fixture.printer.id, fixture.user.id);
  assert.equal((await fetchConnectorJobs(device)).some((row) => row.id === job.id), true);
  const claims = await Promise.allSettled([claimConnectorJob(device, job.id), claimConnectorJob(device, job.id)]);
  assert.equal(claims.filter((result) => result.status === "fulfilled").length, 1);
  const claim = (claims.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof claimConnectorJob>>>).value;
  assert.equal((await acknowledgeConnectorJob(device, job.id, claim.leaseToken)).status, "PRINTED");
  assert.equal((await acknowledgeConnectorJob(device, job.id, claim.leaseToken)).status, "PRINTED");
  await assert.rejects(acknowledgeConnectorJob(device, job.id, "lease_wrong"));

  const failed = await createConnectorTestPrint(fixture.company.id, fixture.location.id, fixture.printer.id, fixture.user.id);
  const failedClaim = await claimConnectorJob(device, failed.id);
  assert.equal((await failConnectorJob(device, failed.id, failedClaim.leaseToken, "device credential_secret")).status, "FAILED");
  assert.doesNotMatch((await prisma.kitchenPrintJob.findUniqueOrThrow({ where: { id: failed.id } })).lastError ?? "", /secret/);
  await retryConnectorJob(fixture.company.id, fixture.location.id, failed.id, fixture.user.id);
  const firstLease = await claimConnectorJob(device, failed.id);
  await prisma.kitchenPrintJob.update({ where: { id: failed.id }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) } });
  const reclaimed = await claimConnectorJob(device, failed.id);
  assert.notEqual(reclaimed.leaseToken, firstLease.leaseToken);

  const rotated = await rotateConnectorCredential(fixture.company.id, fixture.location.id, device.id, fixture.user.id);
  await assert.rejects(authenticateConnector(paired.credential));
  device = await authenticateConnector(rotated.credential);
  await revokeConnector(fixture.company.id, fixture.location.id, device.id, fixture.user.id);
  await assert.rejects(authenticateConnector(rotated.credential));
  const audit = await prisma.auditLog.findMany({ where: { companyId: fixture.company.id } });
  assert.ok(audit.some((row) => row.action === "KITCHEN_CONNECTOR_PAIRED"));
  assert.ok(audit.some((row) => row.action === "KITCHEN_CONNECTOR_CREDENTIAL_ROTATED"));
  assert.ok(audit.some((row) => row.action === "KITCHEN_CONNECTOR_REVOKED"));
});
