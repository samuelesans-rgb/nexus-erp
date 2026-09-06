import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { test } from "node:test";
import { prisma } from "../../lib/prisma";
import { requestPosNetworkDiagnostic, claimPosNetworkDiagnostic, completePosNetworkDiagnostic, getPosNetworkDiagnostic } from "../../lib/pos-network-diagnostic";
import { POST } from "../../app/api/kitchen-connector/v1/network-diagnostic/route";
import { DIAGNOSTIC_HOST, DIAGNOSTIC_PORTS } from "../../tools/kitchen-connector/pos-network-diagnostic";

if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Diagnostic tests require _test database");

test("authenticated scoped single-use diagnostic with durable audit and strict API payload", async () => {
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: `Diagnostic ${suffix}`, vatNumber: suffix } });
  const user = await prisma.user.create({ data: { email: `${suffix}@test.invalid`, firstName: "Diagnostic", lastName: "Test", password: "test" } });
  try {
    const location = await prisma.location.create({ data: { companyId: company.id, name: "Diagnostic", code: "D", slug: suffix } });
    const otherLocation = await prisma.location.create({ data: { companyId: company.id, name: "Other", code: "O", slug: `${suffix}-other` } });
    const station = await prisma.kitchenStation.create({ data: { companyId: company.id, locationId: location.id, name: "Diagnostic", code: "D" } });
    const printer = await prisma.restaurantPrinter.create({ data: { companyId: company.id, locationId: location.id, stationId: station.id, name: "Diagnostic", code: "D" } });
    const credential = `device_${suffix}`;
    const device = await prisma.kitchenConnectorDevice.create({ data: { companyId: company.id, locationId: location.id, printerId: printer.id, name: "Realme mock", credentialHash: createHash("sha256").update(credential).digest("hex"), credentialPrefix: "device_mock", connectorVersion: "1.1.0", lastHeartbeatAt: new Date() } });
    await assert.rejects(requestPosNetworkDiagnostic(device, user.id));
    await prisma.kitchenConnectorDevice.update({ where: { id: device.id }, data: { connectorVersion: "1.1.0+pos-network-diagnostic-v1", diagnostics: { posNetworkDiagnostic: true } } });
    await assert.rejects(requestPosNetworkDiagnostic({ ...device, locationId: otherLocation.id }, user.id));
    const requests = await Promise.all([requestPosNetworkDiagnostic(device, user.id), requestPosNetworkDiagnostic(device, user.id)]);
    const record = requests[0];
    assert.equal(requests[1].id, record.id);
    assert.equal((await requestPosNetworkDiagnostic(device, user.id)).id, record.id);
    assert.equal(await claimPosNetworkDiagnostic({ ...device, companyId: "other-company" }), null);
    assert.equal(await claimPosNetworkDiagnostic({ ...device, locationId: otherLocation.id }), null);
    const api = (body: unknown, auth = credential) => POST(new Request("http://localhost/api/kitchen-connector/v1/network-diagnostic", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(body) }));
    assert.equal((await api({ operation: "claim" }, "device_invalid")).status, 401);
    for (const key of ["host", "port", "ports", "command", "shell", "script", "path"]) assert.equal((await api({ operation: "claim", [key]: "denied" })).status, 400);
    const claims = await Promise.all([api({ operation: "claim" }), api({ operation: "claim" })]);
    const jobs = await Promise.all(claims.map(response => response.json()));
    assert.equal(jobs.filter(body => body.job).length, 1);
    const job = jobs.find(body => body.job).job;
    assert.equal(job.id, record.id);
    assert.equal(await claimPosNetworkDiagnostic(device), null);
    const result = { host: DIAGNOSTIC_HOST, ports: DIAGNOSTIC_PORTS.map(port => ({ port, status: "CLOSED" })) };
    await assert.rejects(completePosNetworkDiagnostic({ ...device, locationId: otherLocation.id }, record.id, result));
    assert.equal((await api({ operation: "complete", job: { ...job, command: "denied" }, result })).status, 400);
    const completions = await Promise.all([api({ operation: "complete", job, result }), api({ operation: "complete", job, result })]);
    assert.deepEqual(completions.map(response => response.status), [200, 200]);
    assert.equal((await api({ operation: "complete", job, result })).status, 200);
    const changed = { ...result, ports: result.ports.map(row => ({ ...row, status: "OPEN" })) };
    assert.equal((await api({ operation: "complete", job, result: changed })).status, 409);
    assert.equal((await getPosNetworkDiagnostic(device))?.status, "SUCCEEDED");
    assert.equal(await getPosNetworkDiagnostic({ ...device, locationId: otherLocation.id }), null);
    assert.equal((await requestPosNetworkDiagnostic(device, user.id)).id, record.id);
    assert.equal(await claimPosNetworkDiagnostic(device), null);
    assert.equal(await prisma.auditLog.count({ where: { companyId: company.id, action: { startsWith: "POS_NETWORK_DIAGNOSTIC_" } } }), 3);
    assert.equal(await prisma.kitchenPrintJob.count({ where: { companyId: company.id } }), 0);
    assert.equal(await prisma.restaurantOrder.count({ where: { companyId: company.id } }), 0);
    await prisma.kitchenConnectorDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    assert.equal((await api({ operation: "claim" })).status, 401);
  } finally {
    await prisma.auditLog.deleteMany({ where: { companyId: company.id } });
    await prisma.idempotencyRecord.deleteMany({ where: { companyId: company.id } });
    await prisma.kitchenConnectorDevice.deleteMany({ where: { companyId: company.id } });
    await prisma.restaurantPrinter.deleteMany({ where: { companyId: company.id } });
    await prisma.kitchenStation.deleteMany({ where: { companyId: company.id } });
    await prisma.location.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
