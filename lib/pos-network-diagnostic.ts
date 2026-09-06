import "server-only";
import { prisma } from "@/lib/prisma";
import { ConnectorError } from "@/lib/kitchen-connector";
import { DIAGNOSTIC_TYPE, validateDiagnosticResult } from "@/tools/kitchen-connector/pos-network-diagnostic";

type Scope = { id: string; companyId: string; locationId: string };
const scopeWhere = (device: Scope) => ({ companyId: device.companyId, commandType: DIAGNOSTIC_TYPE, idempotencyKey: `${device.locationId}:${device.id}:pt15-channel-v1`, aggregateType: "KitchenConnectorDevice", aggregateId: device.id });

// This mission has exactly one durable key per device/location. Never recycle it.
export async function requestPosNetworkDiagnostic(device: Scope, userId: string) {
  return prisma.$transaction(async tx => {
    const target = await tx.kitchenConnectorDevice.findFirst({ where: { id: device.id, companyId: device.companyId, locationId: device.locationId, active: true, revokedAt: null, lastHeartbeatAt: { gte: new Date(Date.now() - 90_000) }, connectorVersion: "1.1.0+pos-network-diagnostic-v1" } });
    if (!target || !target.diagnostics || typeof target.diagnostics !== "object" || Array.isArray(target.diagnostics) || target.diagnostics.posNetworkDiagnostic !== true) throw new ConnectorError("Connector diagnostico aggiornato e online richiesto.", 409);
    const where = scopeWhere(device);
    const existing = await tx.idempotencyRecord.findFirst({ where });
    if (existing) return existing;
    const created = await tx.idempotencyRecord.createMany({ data: [{ ...where, result: { state: "QUEUED", locationId: device.locationId } }], skipDuplicates: true });
    const record = await tx.idempotencyRecord.findFirstOrThrow({ where });
    if (created.count) await tx.auditLog.create({ data: { companyId: device.companyId, locationId: device.locationId, userId, action: "POS_NETWORK_DIAGNOSTIC_REQUESTED", entityType: "KitchenConnectorDevice", entityId: device.id, metadata: { jobId: record.id } } });
    return record;
  });
}

export async function claimPosNetworkDiagnostic(device: Scope) {
  return prisma.$transaction(async tx => {
    const where = { ...scopeWhere(device), status: "PROCESSING" as const, createdAt: { gte: new Date(Date.now() - 15 * 60_000) }, result: { equals: { state: "QUEUED", locationId: device.locationId } } };
    const record = await tx.idempotencyRecord.findFirst({ where });
    if (!record) return null;
    const claimed = await tx.idempotencyRecord.updateMany({ where: { ...where, id: record.id }, data: { result: { state: "CLAIMED", locationId: device.locationId } } });
    if (!claimed.count) return null;
    await tx.auditLog.create({ data: { companyId: device.companyId, locationId: device.locationId, action: "POS_NETWORK_DIAGNOSTIC_CLAIMED", entityType: "KitchenConnectorDevice", entityId: device.id, metadata: { jobId: record.id } } });
    // Commit before delivery; a lost response/crash is deliberately not retried.
    return { type: DIAGNOSTIC_TYPE, id: record.id };
  });
}

export async function completePosNetworkDiagnostic(device: Scope, id: string, value: unknown) {
  const result = validateDiagnosticResult(value);
  return prisma.$transaction(async tx => {
    const where = { ...scopeWhere(device), id };
    const record = await tx.idempotencyRecord.findFirst({ where });
    if (!record) throw new ConnectorError("Diagnostica non trovata.", 404);
    if (record.status === "SUCCEEDED") {
      if (JSON.stringify(validateDiagnosticResult(record.result)) !== JSON.stringify(result)) throw new ConnectorError("Risultato diagnostico diverso.", 409);
      return;
    }
    const changed = await tx.idempotencyRecord.updateMany({ where: { ...where, status: "PROCESSING", result: { equals: { state: "CLAIMED", locationId: device.locationId } } }, data: { status: "SUCCEEDED", completedAt: new Date(), result: JSON.parse(JSON.stringify(result)) } });
    if (!changed.count) {
      const completed = await tx.idempotencyRecord.findFirst({ where: { ...where, status: "SUCCEEDED" } });
      if (completed && JSON.stringify(validateDiagnosticResult(completed.result)) === JSON.stringify(result)) return;
      throw new ConnectorError("Diagnostica non acquisita.", 409);
    }
    await tx.auditLog.create({ data: { companyId: device.companyId, locationId: device.locationId, action: "POS_NETWORK_DIAGNOSTIC_COMPLETED", entityType: "KitchenConnectorDevice", entityId: device.id, metadata: { jobId: id } } });
  });
}

export async function getPosNetworkDiagnostic(device: Scope) {
  const record = await prisma.idempotencyRecord.findFirst({ where: scopeWhere(device), select: { id: true, status: true, result: true, createdAt: true, completedAt: true } });
  return record;
}

export async function getPosNetworkDiagnosticDevice(device: Scope) {
  return prisma.kitchenConnectorDevice.findFirst({ where: { id: device.id, companyId: device.companyId, locationId: device.locationId }, select: { id: true, name: true, status: true, active: true, lastHeartbeatAt: true, connectorVersion: true, printerOnline: true } });
}
