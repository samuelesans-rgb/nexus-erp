import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type IdempotentResult = Prisma.JsonObject;
type Options = { aggregateType?: string; aggregateId?: string; timeout?: number; staleAfterMs?: number };

function safeError(error: unknown): Prisma.JsonObject {
  return { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : "Comando non riuscito" };
}

function log(commandType: string, idempotencyKey: string, companyId: string, outcome: string, aggregateId?: string, error?: unknown) {
  console.info(JSON.stringify({ scope: "idempotency", commandType, idempotencyKey, companyId, aggregateId, outcome, error: error instanceof Error ? error.name : undefined }));
}

export async function executeIdempotent<T extends IdempotentResult>(companyId: string, commandType: string, idempotencyKey: string, operation: (tx: Prisma.TransactionClient) => Promise<T>, options: Options = {}): Promise<T> {
  const key = idempotencyKey.trim();
  if (!key || key.length > 191) throw new Error("Idempotency key obbligatoria e non superiore a 191 caratteri.");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({ where: { companyId_commandType_idempotencyKey: { companyId, commandType, idempotencyKey: key } } });
      if (existing?.status === "SUCCEEDED" && existing.result) return existing.result as T;
      if (existing?.status === "PROCESSING") {
        const staleBefore = new Date(Date.now() - (options.staleAfterMs ?? 300000));
        const recovered = await tx.idempotencyRecord.updateMany({ where: { id: existing.id, status: "PROCESSING", startedAt: { lte: staleBefore } }, data: { startedAt: new Date(), error: Prisma.JsonNull } });
        if (!recovered.count) throw new Error("Comando già in elaborazione.");
      }
      else if (existing?.status === "FAILED") {
        const claimed = await tx.idempotencyRecord.updateMany({ where: { id: existing.id, status: "FAILED" }, data: { status: "PROCESSING", error: Prisma.JsonNull, startedAt: new Date(), completedAt: null } });
        if (!claimed.count) throw new Error("Comando già in elaborazione.");
      } else if (!existing) {
        await tx.idempotencyRecord.create({ data: { companyId, commandType, idempotencyKey: key, aggregateType: options.aggregateType, aggregateId: options.aggregateId } });
      }
      const value = await operation(tx);
      await tx.idempotencyRecord.update({ where: { companyId_commandType_idempotencyKey: { companyId, commandType, idempotencyKey: key } }, data: { status: "SUCCEEDED", result: value, error: Prisma.JsonNull, aggregateType: options.aggregateType, aggregateId: options.aggregateId ?? (typeof value.aggregateId === "string" ? value.aggregateId : undefined), completedAt: new Date() } });
      return value;
      }, { isolationLevel: "Serializable", timeout: options.timeout ?? 30000 });
      log(commandType, key, companyId, "SUCCEEDED", options.aggregateId);
      return result;
    } catch (error) {
      lastError = error;
      const concurrentConflict = error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
      if (!concurrentConflict) break;
      const existing = await prisma.idempotencyRecord.findUnique({ where: { companyId_commandType_idempotencyKey: { companyId, commandType, idempotencyKey: key } } });
      if (existing?.status === "SUCCEEDED" && existing.result) return existing.result as T;
    }
  }
  const completed = await prisma.idempotencyRecord.findUnique({ where: { companyId_commandType_idempotencyKey: { companyId, commandType, idempotencyKey: key } } });
  if (completed?.status === "SUCCEEDED" && completed.result) return completed.result as T;
  if (completed?.status === "FAILED") {
    await prisma.idempotencyRecord.updateMany({ where: { id: completed.id, status: "FAILED" }, data: { error: safeError(lastError), completedAt: new Date() } }).catch(() => undefined);
  } else if (!completed) {
    await prisma.idempotencyRecord.create({ data: { companyId, commandType, idempotencyKey: key, status: "FAILED", aggregateType: options.aggregateType, aggregateId: options.aggregateId, error: safeError(lastError), completedAt: new Date() } }).catch(() => undefined);
  }
  log(commandType, key, companyId, "FAILED", options.aggregateId, lastError);
  throw lastError;
}
