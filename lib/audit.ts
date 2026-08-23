import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const forbidden = /password|token|cookie|secret|authorization|connection.?string|database.?url|iban|account.?number/i;
const scalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

export function sanitizeAuditMetadata(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (depth > 4 || value === undefined) return undefined;
  if (scalar(value)) return value as Prisma.InputJsonValue;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitizeAuditMetadata(entry, depth + 1) ?? null);
  if (typeof value !== "object" || !value) return String(value).slice(0, 500);
  const clean: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    if (forbidden.test(key)) continue;
    const sanitized = sanitizeAuditMetadata(entry, depth + 1);
    if (sanitized !== undefined) clean[key] = sanitized;
  }
  return clean;
}

export type AuditInput = {
  companyId?: string | null;
  membershipId?: string | null;
  userId?: string | null;
  locationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
};

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export function writeAuditLogTx(client: AuditClient, input: AuditInput) {
  return client.auditLog.create({
    data: {
      companyId: input.companyId ?? null,
      membershipId: input.companyId ? input.membershipId ?? null : null,
      userId: input.userId ?? null,
      locationId: input.companyId ? input.locationId ?? null : null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: sanitizeAuditMetadata(input.metadata),
    },
  });
}

export function writeAuditLog(input: AuditInput) {
  return writeAuditLogTx(prisma, input);
}

export async function safeWriteAuditLog(input: AuditInput) {
  try { await writeAuditLog(input); } catch { /* Authentication must fail closed even if audit storage is unavailable. */ }
}

export async function getAuditLogs(companyId: string, options: { entityType?: string; entityId?: string; take?: number } = {}) {
  return prisma.auditLog.findMany({
    where: { companyId, entityType: options.entityType, entityId: options.entityId },
    orderBy: { occurredAt: "desc" },
    take: Math.min(Math.max(options.take ?? 100, 1), 500),
  });
}
