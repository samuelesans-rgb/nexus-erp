import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;
const safeError = (value: unknown) => String(value instanceof Error ? value.message : value).replace(/(?:bearer|token|secret|credential)\s*[:=]?\s*\S+/gi, "[redacted]").slice(0, 500);
const safeJson = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const scrub = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.slice(0, 100).map(scrub);
    if (!item || typeof item !== "object") return typeof item === "string" ? item.slice(0, 500) : item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([key]) => !/(credential|secret|token|password|cookie|authorization|database.?url)/i.test(key)).slice(0, 100).map(([key, child]) => [key, scrub(child)]));
  };
  return JSON.parse(JSON.stringify(scrub(value))) as Prisma.InputJsonValue;
};

export class ConnectorError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function createPairingToken(companyId: string, locationId: string, printerId: string, userId: string, ttlMinutes = 10) {
  const printer = await prisma.restaurantPrinter.findFirst({ where: { id: printerId, companyId, locationId, enabled: true } });
  if (!printer) throw new ConnectorError("Stampante non valida.", 404);
  const raw = token("pair");
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.kitchenConnectorPairingToken.create({ data: { companyId, locationId, printerId, tokenHash: digest(raw), expiresAt: new Date(Date.now() + Math.min(Math.max(ttlMinutes, 1), 30) * 60_000), createdById: userId } });
    await writeAuditLogTx(tx, { companyId, locationId, userId, action: "KITCHEN_CONNECTOR_PAIRING_CREATED", entityType: "KitchenConnectorPairingToken", entityId: created.id, metadata: { printerId, expiresAt: created.expiresAt.toISOString() } });
    return created;
  });
  return { pairingToken: raw, expiresAt: row.expiresAt };
}

export async function pairConnector(pairingToken: string, input: { name: string; serialConfig?: unknown }) {
  if (!pairingToken.startsWith("pair_") || !input.name.trim()) throw new ConnectorError("Pairing non valido.", 401);
  const credential = token("device");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${digest(pairingToken)}))`;
    const pairing = await tx.kitchenConnectorPairingToken.findFirst({ where: { tokenHash: digest(pairingToken), usedAt: null, expiresAt: { gt: new Date() } }, include: { printer: true } });
    if (!pairing) throw new ConnectorError("Pairing token scaduto o già usato.", 401);
    const device = await tx.kitchenConnectorDevice.create({ data: { companyId: pairing.companyId, locationId: pairing.locationId, printerId: pairing.printerId, name: input.name.trim(), credentialHash: digest(credential), credentialPrefix: credential.slice(0, 14), serialConfig: safeJson(input.serialConfig) } });
    await tx.kitchenConnectorPairingToken.update({ where: { id: pairing.id }, data: { usedAt: new Date(), usedByDeviceId: device.id } });
    await writeAuditLogTx(tx, { companyId: pairing.companyId, locationId: pairing.locationId, action: "KITCHEN_CONNECTOR_PAIRED", entityType: "KitchenConnectorDevice", entityId: device.id, metadata: { printerId: pairing.printerId, name: device.name } });
    return { deviceId: device.id, credential, locationId: device.locationId, printerId: device.printerId, printer: { name: pairing.printer.name, type: pairing.printer.type, connectionType: pairing.printer.connectionType } };
  }, { isolationLevel: "Serializable" });
}

export async function authenticateConnector(credential: string) {
  if (!credential.startsWith("device_")) throw new ConnectorError("Credenziale device non valida.", 401);
  const candidate = digest(credential);
  const device = await prisma.kitchenConnectorDevice.findUnique({ where: { credentialHash: candidate }, include: { printer: true } });
  if (!device || !device.active || device.revokedAt || device.status === "REVOKED") throw new ConnectorError("Connector non autorizzato.", 401);
  if (!timingSafeEqual(Buffer.from(candidate), Buffer.from(device.credentialHash))) throw new ConnectorError("Connector non autorizzato.", 401);
  return device;
}

export async function heartbeatConnector(deviceId: string, input: { printerOnline: boolean; queueDepth: number; failedJobs: number; connectorVersion?: string; lastError?: string | null; diagnostics?: unknown }) {
  const now = new Date();
  return prisma.kitchenConnectorDevice.update({ where: { id: deviceId }, data: { status: input.printerOnline && !input.lastError ? "ONLINE" : "DEGRADED", lastHeartbeatAt: now, lastSeenAt: now, connectorVersion: input.connectorVersion?.slice(0, 100), printerOnline: input.printerOnline, queueDepth: Math.min(1_000_000, Math.max(0, Math.trunc(input.queueDepth))), failedJobs: Math.min(1_000_000, Math.max(0, Math.trunc(input.failedJobs))), lastError: input.lastError ? safeError(input.lastError) : null, diagnostics: safeJson(input.diagnostics) } });
}

export async function fetchConnectorJobs(device: { id: string; companyId: string; locationId: string; printerId: string }, take = 20) {
  return prisma.kitchenPrintJob.findMany({ where: { companyId: device.companyId, locationId: device.locationId, printerId: device.printerId, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseExpiresAt: { lt: new Date() } }] }, orderBy: { createdAt: "asc" }, take: Math.min(Math.max(take, 1), 50), select: { id: true, type: true, printType: true, status: true, attempts: true, createdAt: true } });
}

export async function claimConnectorJob(device: { id: string; companyId: string; locationId: string; printerId: string; leaseSeconds: number }, jobId: string) {
  const leaseToken = token("lease"), now = new Date(), expires = new Date(Date.now() + device.leaseSeconds * 1000);
  const job = await prisma.$transaction(async (tx) => {
    const candidate = await tx.kitchenPrintJob.findFirst({ where: { id: jobId, companyId: device.companyId, locationId: device.locationId, printerId: device.printerId }, select: { printType: true } });
    if (candidate?.printType === "FISCAL_RECEIPT") throw new ConnectorError("Protocollo fiscale non certificato.", 422);
    const changed = await tx.kitchenPrintJob.updateMany({ where: { id: jobId, companyId: device.companyId, locationId: device.locationId, printerId: device.printerId, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseExpiresAt: { lt: now } }] }, data: { status: "PROCESSING", connectorId: device.id, leaseTokenHash: digest(leaseToken), leaseExpiresAt: expires, claimedAt: now, startedAt: now, attempts: { increment: 1 }, lastError: null } });
    if (!changed.count) return null;
    return tx.kitchenPrintJob.findFirst({ where: { id: jobId, companyId: device.companyId, locationId: device.locationId, connectorId: device.id }, include: { printer: true, ticket: { include: { order: { include: { tables: true } }, lines: { include: { orderLine: { include: { modifiers: true } } } } } } } });
  });
  if (!job) throw new ConnectorError("Job non disponibile o già acquisito.", 409);
  const fusionOrder = job.ticket ? { tableIds: job.ticket.order.tables.map((row) => row.tableId), lines: job.ticket.lines.map((line) => ({ lineId: line.id, itemId: line.orderLine.itemId, quantity: Number(line.quantity), hasModifiers: line.orderLine.modifiers.length > 0, hasNotes: Boolean(line.notes) })) } : undefined;
  return { jobId: job.id, leaseToken, leaseExpiresAt: expires, payload: job.payload, printType: job.printType, copies: job.printer.copies, paperWidth: job.printer.paperWidth, printerType: job.printer.type, connectionType: job.printer.connectionType, attempts: job.attempts, fusionOrder };
}

async function ownedLease(device: { id: string; companyId: string; locationId: string }, jobId: string, leaseToken: string) {
  const job = await prisma.kitchenPrintJob.findFirst({ where: { id: jobId, companyId: device.companyId, locationId: device.locationId, connectorId: device.id } });
  if (!job?.leaseTokenHash || digest(leaseToken) !== job.leaseTokenHash) throw new ConnectorError("Lease non valido.", 409);
  return job;
}

export async function acknowledgeConnectorJob(device: { id: string; companyId: string; locationId: string }, jobId: string, leaseToken: string) {
  const current = await ownedLease(device, jobId, leaseToken);
  if (current.status === "PRINTED") return current;
  if (current.status !== "PROCESSING") throw new ConnectorError("Job non in elaborazione.", 409);
  return prisma.$transaction(async (tx) => {
    const job = await tx.kitchenPrintJob.update({ where: { id: jobId }, data: { status: "PRINTED", printedAt: new Date(), acknowledgedAt: new Date(), leaseExpiresAt: null, lastError: null } });
    await tx.kitchenConnectorDevice.update({ where: { id: device.id }, data: { lastSuccessfulPrintAt: new Date(), printerOnline: true } });
    return job;
  });
}

export async function failConnectorJob(device: { id: string; companyId: string; locationId: string }, jobId: string, leaseToken: string, error: unknown) {
  const current = await ownedLease(device, jobId, leaseToken);
  if (current.status === "FAILED") return current;
  if (current.status !== "PROCESSING") throw new ConnectorError("Job non in elaborazione.", 409);
  return prisma.$transaction(async (tx) => {
    const job = await tx.kitchenPrintJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: safeError(error), acknowledgedAt: new Date(), leaseExpiresAt: null } });
    await tx.kitchenConnectorDevice.update({ where: { id: device.id }, data: { failedJobs: { increment: 1 }, printerOnline: false, lastError: safeError(error) } });
    return job;
  });
}

export async function retryConnectorJob(companyId: string, locationId: string, jobId: string, userId: string) {
  const changed = await prisma.kitchenPrintJob.updateMany({ where: { id: jobId, companyId, locationId, status: "FAILED" }, data: { status: "PENDING", lastError: null, connectorId: null, leaseTokenHash: null, leaseExpiresAt: null, acknowledgedAt: null } });
  if (!changed.count) throw new ConnectorError("Job fallito non trovato.", 404);
  await writeAuditLogTx(prisma, { companyId, locationId, userId, action: "KITCHEN_CONNECTOR_JOB_RETRIED", entityType: "KitchenPrintJob", entityId: jobId });
}

export async function rotateConnectorCredential(companyId: string, locationId: string, deviceId: string, userId: string) {
  const credential = token("device");
  const changed = await prisma.kitchenConnectorDevice.updateMany({ where: { id: deviceId, companyId, locationId, active: true, revokedAt: null }, data: { credentialHash: digest(credential), credentialPrefix: credential.slice(0, 14), credentialVersion: { increment: 1 } } });
  if (!changed.count) throw new ConnectorError("Connector non trovato.", 404);
  await writeAuditLogTx(prisma, { companyId, locationId, userId, action: "KITCHEN_CONNECTOR_CREDENTIAL_ROTATED", entityType: "KitchenConnectorDevice", entityId: deviceId });
  return { credential };
}

export async function createConnectorTestPrint(companyId: string, locationId: string, printerId: string, userId: string) {
  const printer = await prisma.restaurantPrinter.findFirst({ where: { id: printerId, companyId, locationId, enabled: true } });
  if (!printer) throw new ConnectorError("Stampante non valida.", 404);
  const key = randomUUID(), payload = ["FRISÀ BISTRÒ", "TEST STAMPANTE", printer.name, new Date().toISOString(), printer.code].join("\n");
  return prisma.$transaction(async (tx) => {
    const job = await tx.kitchenPrintJob.create({ data: { companyId, locationId, stationId: printer.stationId, printerId, ticketId: null, type: "PRINT", printType: "TEST", payload, idempotencyKey: `test:${key}`, requestedById: userId } });
    await writeAuditLogTx(tx, { companyId, locationId, userId, action: "KITCHEN_CONNECTOR_TEST_PRINT", entityType: "KitchenPrintJob", entityId: job.id, metadata: { printerId } });
    return job;
  });
}

export async function revokeConnector(companyId: string, locationId: string, deviceId: string, userId: string) {
  const result = await prisma.kitchenConnectorDevice.updateMany({ where: { id: deviceId, companyId, locationId }, data: { active: false, status: "REVOKED", revokedAt: new Date(), credentialVersion: { increment: 1 } } });
  if (!result.count) throw new ConnectorError("Connector non trovato.", 404);
  await prisma.auditLog.create({ data: { companyId, locationId, userId, action: "KITCHEN_CONNECTOR_REVOKED", entityType: "KitchenConnectorDevice", entityId: deviceId } });
}

export async function getConnectorDashboard(companyId: string, locationId: string) {
  const devices = await prisma.kitchenConnectorDevice.findMany({ where: { companyId, locationId }, include: { printer: { include: { station: true } } }, orderBy: { createdAt: "desc" } });
  const pending = await prisma.kitchenPrintJob.count({ where: { companyId, locationId, status: "PENDING" } }), failed = await prisma.kitchenPrintJob.count({ where: { companyId, locationId, status: "FAILED" } });
  return { pending, failed, devices: devices.map((d) => ({ ...d, online: !!d.lastHeartbeatAt && Date.now() - d.lastHeartbeatAt.getTime() < 120_000 })) };
}
