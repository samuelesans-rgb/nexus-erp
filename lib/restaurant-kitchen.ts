import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type KitchenDispatchType,
  type KitchenTicketStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  postInventoryMovementsBatchTx,
  type MovementInput,
} from "@/lib/inventory";
import { executeIdempotent } from "@/lib/idempotency";
import { emitRestaurantEventTx, RestaurantDomainError } from "@/lib/restaurant";
import { writeAuditLogTx } from "@/lib/audit";

const cleanError = (error: unknown) =>
  String(error instanceof Error ? error.message : error)
    .replace(/postgresql:\/\/[^\s]+/gi, "[redacted]")
    .slice(0, 500);
export const kitchenPayloadHash = (payload: string) =>
  createHash("sha256").update(payload, "utf8").digest("hex");
export const DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN =
  "DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN";
const assertDirectPrinterSafe = (printer: {
  mode: "LEGACY_FUSION" | "NEXUS_DIRECT";
  deviceType: "FISCAL" | "NON_FISCAL";
}) => {
  if (printer.mode === "NEXUS_DIRECT" && printer.deviceType === "FISCAL")
    throw new RestaurantDomainError(DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN);
};
const cleanText = (value: unknown, max = 500) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u009b]/g, "")
    .replace(/<[^>]*>/g, "")
    .slice(0, max)
    .trim();
const wrap = (value: string, width: number, prefix = "") => {
  const available = Math.max(8, width - prefix.length),
    out: string[] = [];
  for (const paragraph of cleanText(value).split("\n")) {
    if (!paragraph) {
      out.push(prefix.trimEnd());
      continue;
    }
    let rest = paragraph;
    while (rest.length > available) {
      let cut = rest.lastIndexOf(" ", available);
      if (cut < 1) cut = available;
      out.push(prefix + rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    out.push(prefix + rest);
  }
  return out;
};
type TicketSnapshot = {
  dispatchType: KitchenDispatchType;
  dispatchNumber: number;
  orderCode: string;
  tableNames: unknown;
  guestCount: number;
  operatorName: string;
  stationCode: string;
  stationName: string;
  createdAt: Date;
  lines: Array<{
    quantity: unknown;
    productName: string;
    variantName: string | null;
    modifiers: unknown;
    notes: string | null;
    allergens: unknown;
  }>;
};
export function renderKitchenTicket(
  ticket: TicketSnapshot,
  paperWidth = 80,
  reprint = false,
  charsPerLine?: number,
) {
  const width = charsPerLine ?? (paperWidth === 58 ? 32 : 48),
    rule = "-".repeat(width),
    tables = Array.isArray(ticket.tableNames)
      ? ticket.tableNames.map((x) => cleanText(x, 100)).join(", ")
      : "-",
    time = ticket.createdAt.toLocaleTimeString("it-IT", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }),
    rows = [
      rule,
      "FRISÀ BISTRÒ",
      reprint ? "*** RISTAMPA ***" : "",
      ...wrap(`TAVOLO ${tables || "-"}`, width),
      ...wrap(`COMANDA #${cleanText(ticket.orderCode, 80)}`, width),
      time,
      rule,
    ];
  for (const line of ticket.lines) {
    rows.push(
      ...wrap(
        `${Number(line.quantity)} x ${cleanText(line.productName, 160).toUpperCase()}`,
        width,
      ),
    );
    if (line.variantName)
      rows.push(
        ...wrap(`VARIANTE: ${cleanText(line.variantName, 120)}`, width, "  "),
      );
    for (const modifier of Array.isArray(line.modifiers) ? line.modifiers : [])
      rows.push(
        ...wrap(
          cleanText((modifier as { name?: string }).name ?? modifier, 120),
          width,
          "    → ",
        ),
      );
    if (line.notes)
      for (const note of cleanText(line.notes, 500).split("\n"))
        rows.push(...wrap(`*** ${note.toUpperCase()} ***`, width, "    "));
    rows.push("");
  }
  rows.push(rule, `${ticket.guestCount} COPERTI`, rule);
  return rows
    .filter((row, index) => row !== "" || rows[index - 1] !== "")
    .join("\n");
}

async function operatorName(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  return user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : "Sistema";
}
async function lineAllergens(
  tx: Prisma.TransactionClient,
  companyId: string,
  itemId: string,
) {
  return tx.itemAllergen
    .findMany({
      where: { companyId, itemId },
      select: { allergen: { select: { code: true, name: true } } },
      orderBy: { allergen: { code: "asc" } },
    })
    .then((rows) => rows.map((row) => row.allergen));
}

async function sendOrderToKitchenAttempt(
  companyId: string,
  locationId: string,
  orderId: string,
  userId: string = "system",
  idempotencyKey: string = randomUUID(),
  requiresFusionAck = false,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ":" + orderId}))`;
      const existing = await tx.kitchenDispatch.findFirst({
        where: { companyId, orderId, idempotencyKey },
        include: { tickets: { include: { printJobs: true } } },
      });
      if (existing)
        return {
          ...existing,
          duplicate: true,
          printFailed: existing.tickets.some((t) =>
            t.printJobs.some((j) => j.status === "FAILED"),
          ),
        };
      const order = await tx.restaurantOrder.findFirst({
        where: {
          id: orderId,
          companyId,
          locationId,
          status: { in: ["OPEN", "SENT", "IN_PROGRESS"] },
        },
        include: {
          tables: { include: { table: true } },
          lines: {
            where: { status: { not: "CANCELLED" } },
            include: {
              item: true,
              modifiers: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              },
            },
          },
        },
      });
      if (!order) throw new RestaurantDomainError("Comanda non valida.");
      const actorId =
        userId === "system" ? (order.createdById ?? "system") : userId;
      const pending = order.lines
        .map((line) => ({
          line,
          quantity: Number(line.quantity) - Number(line.sentQuantity),
        }))
        .filter((x) => x.quantity > 0.0001);
      if (!pending.length)
        throw new RestaurantDomainError("Nessuna nuova quantità da inviare.");
      const routed = [] as Array<{
        line: (typeof pending)[number]["line"];
        quantity: number;
        station: { id: string; code: string; name: string };
        printer: {
          id: string;
          paperWidth: number;
          copies: number;
          charsPerLine: number | null;
          mode: "LEGACY_FUSION" | "NEXUS_DIRECT";
          deviceType: "FISCAL" | "NON_FISCAL";
        };
      }>;
      for (const entry of pending) {
        const assignment = await tx.kitchenStationAssignment.findFirst({
          where: {
            companyId,
            active: true,
            station: { locationId, active: true },
            OR: [
              { itemId: entry.line.itemId },
              { itemCategoryId: entry.line.item.categoryId },
            ],
          },
          include: {
            station: {
              include: {
                printers: {
                  where: { enabled: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ itemId: "desc" }, { priority: "desc" }],
        });
        if (!assignment)
          throw new RestaurantDomainError(
            `Nessuna postazione configurata per ${entry.line.productName}.`,
          );
        const printer = assignment.station.printers[0];
        if (!printer)
          throw new RestaurantDomainError(
            `Nessuna stampante attiva configurata per ${assignment.station.name}.`,
          );
        assertDirectPrinterSafe(printer);
        routed.push({
          line: entry.line,
          quantity: entry.quantity,
          station: assignment.station,
          printer,
        });
      }
      const sequenceNumber =
        (
          await tx.kitchenDispatch.aggregate({
            where: { companyId, orderId },
            _max: { sequenceNumber: true },
          })
        )._max.sequenceNumber ?? 0;
      const type: KitchenDispatchType = sequenceNumber ? "ADDITION" : "NEW";
      const hasLegacyFusion = routed.some(
        ({ printer }) => printer.mode === "LEGACY_FUSION",
      );
      const gateDirectPrint = requiresFusionAck || hasLegacyFusion;
      const dispatch = await tx.kitchenDispatch.create({
        data: {
          companyId,
          locationId,
          orderId,
          sequenceNumber: sequenceNumber + 1,
          type,
          idempotencyKey,
          fusionStatus: gateDirectPrint ? "PENDING" : "NOT_REQUIRED",
          createdById: actorId,
        },
      });
      const actor = await operatorName(tx, actorId);
      const tableNames = order.tables.map(
        (row) => `${row.table.code} · ${row.table.name}`,
      );
      const groups = new Map<string, typeof routed>();
      for (const row of routed)
        groups.set(row.station.id, [
          ...(groups.get(row.station.id) ?? []),
          row,
        ]);
      const tickets = [];
      for (const group of groups.values()) {
        const first = group[0];
        const ticket = await tx.kitchenTicket.create({
          data: {
            companyId,
            locationId,
            kitchenStationId: first.station.id,
            orderId,
            dispatchId: dispatch.id,
            dispatchType: type,
            dispatchNumber: dispatch.sequenceNumber,
            orderCode: order.code,
            tableNames,
            guestCount: order.guestCount,
            operatorName: actor,
            stationCode: first.station.code,
            stationName: first.station.name,
          },
        });
        for (const row of group) {
          const allergens = await lineAllergens(tx, companyId, row.line.itemId);
          await tx.kitchenTicketLine.create({
            data: {
              companyId,
              locationId,
              ticketId: ticket.id,
              orderLineId: row.line.id,
              dispatchId: dispatch.id,
              quantity: row.quantity,
              productName: row.line.productName,
              variantName: row.line.variantName,
              modifiers: row.line.modifiers.map((m) => ({
                groupName: m.groupName,
                name: m.kitchenLabel,
                notes: m.notes,
              })),
              notes: row.line.kitchenNotes ?? row.line.notes,
              allergens,
              stationCode: first.station.code,
              stationName: first.station.name,
            },
          });
          await tx.restaurantOrderLine.update({
            where: { id: row.line.id },
            data: {
              sentQuantity: { increment: row.quantity },
              status: "SENT",
              sentAt: new Date(),
            },
          });
        }
        const snapshot = await tx.kitchenTicket.findUniqueOrThrow({
          where: { id: ticket.id },
          include: { lines: true },
        });
        const payload = renderKitchenTicket(
          snapshot,
          first.printer.paperWidth,
          false,
          first.printer.charsPerLine ?? undefined,
        );
        await tx.kitchenPrintJob.create({
          data: {
            companyId,
            locationId,
            stationId: first.station.id,
            ticketId: ticket.id,
            printerId: first.printer.id,
            payload,
            payloadHash: kitchenPayloadHash(payload),
            idempotencyKey: `${companyId}:${dispatch.id}:${first.printer.id}:PRINT`,
            status:
              first.printer.mode === "NEXUS_DIRECT" && gateDirectPrint
                ? "BLOCKED"
                : "PENDING",
            requestedById: actorId,
          },
        });
        tickets.push(ticket);
      }
      await tx.restaurantOrder.update({
        where: { id: orderId },
        data: { status: "SENT", updatedById: userId },
      });
      await emitRestaurantEventTx(
        tx,
        companyId,
        "RestaurantOrderSentToKitchen",
        "KitchenDispatch",
        dispatch.id,
        {
          orderId,
          sequenceNumber: dispatch.sequenceNumber,
          type,
          ticketIds: tickets.map((t) => t.id),
        },
      );
      await writeAuditLogTx(tx, {
        companyId,
        userId: order.createdById ?? undefined,
        locationId,
        action: "KITCHEN_DISPATCH_SENT",
        entityType: "KitchenDispatch",
        entityId: dispatch.id,
        metadata: {
          orderId,
          sequenceNumber: dispatch.sequenceNumber,
          type,
          ticketIds: tickets.map((t) => t.id),
        },
      });
      return { ...dispatch, tickets, duplicate: false, printFailed: false };
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
}
export async function sendOrderToKitchen(
  companyId: string,
  locationId: string,
  orderId: string,
  userId: string = "system",
  idempotencyKey: string = randomUUID(),
  requiresFusionAck = false,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await sendOrderToKitchenAttempt(
        companyId,
        locationId,
        orderId,
        userId,
        idempotencyKey,
        requiresFusionAck,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.kitchenDispatch.findFirst({
          where: { companyId, orderId, idempotencyKey },
          include: { tickets: { include: { printJobs: true } } },
        });
        if (existing)
          return {
            ...existing,
            duplicate: true,
            printFailed: existing.tickets.some((ticket) =>
              ticket.printJobs.some((job) => job.status === "FAILED"),
            ),
          };
      }
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new RestaurantDomainError("Invio cucina non riuscito.");
}

export async function changeOrderLineQuantity(
  companyId: string,
  locationId: string,
  orderId: string,
  lineId: string,
  userId: string,
  quantity: number,
  idempotencyKey: string = randomUUID(),
) {
  if (quantity < 0) throw new RestaurantDomainError("Quantità non valida.");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ":" + orderId}))`;
      const line = await tx.restaurantOrderLine.findFirst({
        where: {
          id: lineId,
          companyId,
          locationId,
          orderId,
          status: { not: "CANCELLED" },
        },
        include: {
          order: { include: { tables: { include: { table: true } } } },
          modifiers: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          item: true,
        },
      });
      if (!line) throw new RestaurantDomainError("Riga non trovata.");
      const old = Number(line.quantity),
        sent = Number(line.sentQuantity);
      if (Math.abs(quantity - old) < 0.0001) return { id: lineId };
      if (quantity > old) {
        await tx.restaurantOrderLine.update({
          where: { id: lineId },
          data: {
            quantity,
            lineTotal: quantity * Number(line.unitPrice),
            status: sent > 0 ? "SENT" : "NEW",
          },
        });
        return { id: lineId, requiresDispatch: true };
      }
      const cancelled = Math.min(old - quantity, sent);
      await tx.restaurantOrderLine.update({
        where: { id: lineId },
        data: {
          quantity,
          lineTotal: quantity * Number(line.unitPrice),
          sentQuantity: Math.max(0, sent - cancelled),
          status:
            quantity === 0
              ? "CANCELLED"
              : sent - cancelled > 0
                ? "SENT"
                : "NEW",
          cancelledAt: quantity === 0 ? new Date() : null,
        },
      });
      if (cancelled <= 0) return { id: lineId, requiresDispatch: false };
      const assignment = await tx.kitchenStationAssignment.findFirst({
        where: {
          companyId,
          active: true,
          station: { locationId, active: true },
          OR: [
            { itemId: line.itemId },
            { itemCategoryId: line.item.categoryId },
          ],
        },
        include: {
          station: {
            include: { printers: { where: { enabled: true }, take: 1 } },
          },
        },
        orderBy: [{ itemId: "desc" }, { priority: "desc" }],
      });
      if (!assignment?.station.printers[0])
        throw new RestaurantDomainError(
          "Routing o stampante cucina non disponibili per l annullamento.",
        );
      const prior = await tx.kitchenTicketLine.findFirst({
        where: { companyId, orderLineId: lineId },
        orderBy: { createdAt: "desc" },
      });
      if (!prior)
        throw new RestaurantDomainError(
          "Snapshot cucina originale non trovato.",
        );
      const seq =
        (
          await tx.kitchenDispatch.aggregate({
            where: { companyId, orderId },
            _max: { sequenceNumber: true },
          })
        )._max.sequenceNumber ?? 0;
      const dispatch = await tx.kitchenDispatch.create({
        data: {
          companyId,
          locationId,
          orderId,
          sequenceNumber: seq + 1,
          type: "CANCELLATION",
          idempotencyKey,
          createdById: userId,
        },
      });
      const station = assignment.station,
        printer = station.printers[0],
        actor = await operatorName(tx, userId);
      const ticket = await tx.kitchenTicket.create({
        data: {
          companyId,
          locationId,
          kitchenStationId: station.id,
          orderId,
          dispatchId: dispatch.id,
          dispatchType: "CANCELLATION",
          dispatchNumber: dispatch.sequenceNumber,
          orderCode: line.order.code,
          tableNames: line.order.tables.map(
            (row) => `${row.table.code} · ${row.table.name}`,
          ),
          guestCount: line.order.guestCount,
          operatorName: actor,
          stationCode: station.code,
          stationName: station.name,
        },
      });
      await tx.kitchenTicketLine.create({
        data: {
          companyId,
          locationId,
          ticketId: ticket.id,
          orderLineId: line.id,
          dispatchId: dispatch.id,
          quantity: -cancelled,
          productName: prior.productName,
          variantName: prior.variantName,
          modifiers: prior.modifiers as Prisma.InputJsonValue,
          notes: prior.notes,
          allergens: prior.allergens as Prisma.InputJsonValue,
          stationCode: station.code,
          stationName: station.name,
          status: "CANCELLED",
        },
      });
      const snapshot = await tx.kitchenTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { lines: true },
      });
      const payload = renderKitchenTicket(
        snapshot,
        printer.paperWidth,
        false,
        printer.charsPerLine ?? undefined,
      );
      await tx.kitchenPrintJob.create({
        data: {
          companyId,
          locationId,
          stationId: station.id,
          ticketId: ticket.id,
          printerId: printer.id,
          payload,
          payloadHash: kitchenPayloadHash(payload),
          idempotencyKey: `${companyId}:${dispatch.id}:${printer.id}:PRINT`,
          requestedById: userId,
        },
      });
      await writeAuditLogTx(tx, {
        companyId,
        userId,
        locationId,
        action: "KITCHEN_CANCELLATION_SENT",
        entityType: "KitchenDispatch",
        entityId: dispatch.id,
        metadata: { orderId, lineId, quantity: cancelled },
      });
      return {
        id: lineId,
        dispatchId: dispatch.id,
        sequenceNumber: dispatch.sequenceNumber,
      };
    },
    { isolationLevel: "Serializable" },
  );
}
export const cancelOrderLine = (
  companyId: string,
  locationId: string,
  orderId: string,
  lineId: string,
  userId: string,
  idempotencyKey?: string,
) =>
  changeOrderLineQuantity(
    companyId,
    locationId,
    orderId,
    lineId,
    userId,
    0,
    idempotencyKey,
  );

export async function recordFusionDispatchOutcome(
  companyId: string,
  locationId: string,
  dispatchId: string,
  outcome: "DISPATCHING" | "ACCEPTED" | "REJECTED" | "UNCERTAIN",
  error?: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ":fusion:" + dispatchId}))`;
    const dispatch = await tx.kitchenDispatch.findFirst({
      where: { id: dispatchId, companyId, locationId },
    });
    if (!dispatch) throw new RestaurantDomainError("Invio cucina non trovato.");
    const allowed: Record<string, string[]> = {
      PENDING: ["DISPATCHING", "ACCEPTED", "REJECTED", "UNCERTAIN"],
      DISPATCHING: ["ACCEPTED", "REJECTED", "UNCERTAIN"],
      ACCEPTED: ["ACCEPTED"],
      REJECTED: ["REJECTED"],
      UNCERTAIN: ["UNCERTAIN"],
    };
    if (!allowed[dispatch.fusionStatus]?.includes(outcome))
      throw new RestaurantDomainError("Transizione FUSION non valida.");
    const updated = await tx.kitchenDispatch.update({
      where: { id: dispatch.id },
      data: {
        fusionStatus: outcome,
        fusionError: error ? cleanError(error) : null,
        fusionUpdatedAt: new Date(),
      },
    });
    if (outcome === "ACCEPTED")
      await tx.kitchenPrintJob.updateMany({
        where: {
          companyId,
          locationId,
          ticket: { dispatchId },
          status: "BLOCKED",
        },
        data: { status: "PENDING" },
      });
    await writeAuditLogTx(tx, {
      companyId,
      locationId,
      action: `KITCHEN_FUSION_${outcome}`,
      entityType: "KitchenDispatch",
      entityId: dispatch.id,
      metadata: error ? { error: cleanError(error) } : undefined,
    });
    return updated;
  });
}

export async function processKitchenPrintJob(
  companyId: string,
  locationId: string,
  jobId?: string,
) {
  const claimed = await prisma.$transaction(async (tx) => {
    const job = await tx.kitchenPrintJob.findFirst({
      where: {
        companyId,
        locationId,
        id: jobId,
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      include: { printer: true },
    });
    if (!job) return null;
    const updated = await tx.kitchenPrintJob.updateMany({
      where: { id: job.id, companyId, locationId, status: job.status },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    return updated.count ? job : null;
  });
  if (!claimed) return null;
  try {
    if (!claimed.printer.enabled) throw new Error("Stampante disabilitata");
    assertDirectPrinterSafe(claimed.printer);
    if (claimed.printer.mode !== "NEXUS_DIRECT")
      throw new Error("LEGACY_FUSION_REQUIRES_FUSION_CONNECTOR");
    if (claimed.printer.type === "ESC_POS")
      throw new Error("Connector ESC/POS non configurato");
    if (claimed.printer.address === "MOCK_FAIL")
      throw new Error("Errore MOCK configurato");
    if (claimed.printer.address === "MOCK_UNCERTAIN")
      return prisma.kitchenPrintJob.update({
        where: { id: claimed.id },
        data: {
          status: "UNCERTAIN",
          writeStartedAt: new Date(),
          lastError: "Stampa incerta — verificare fisicamente la stampante.",
        },
      });
    return await prisma.kitchenPrintJob.update({
      where: { id: claimed.id },
      data: { status: "PRINTED", printedAt: new Date(), lastError: null },
    });
  } catch (error) {
    return prisma.kitchenPrintJob.update({
      where: { id: claimed.id },
      data: { status: "FAILED", lastError: cleanError(error) },
    });
  }
}
export async function retryKitchenPrintJob(
  companyId: string,
  locationId: string,
  userId: string,
  jobId: string,
) {
  const job = await prisma.kitchenPrintJob.findFirst({
    where: { id: jobId, companyId, locationId, status: "FAILED" },
  });
  if (!job) {
    const concurrent = await prisma.kitchenPrintJob.findFirst({
      where: {
        id: jobId,
        companyId,
        locationId,
        status: { in: ["PENDING", "PROCESSING", "PRINTED"] },
      },
    });
    if (concurrent)
      return concurrent.status === "PENDING"
        ? processKitchenPrintJob(companyId, locationId, concurrent.id)
        : concurrent;
    throw new RestaurantDomainError("Job fallito non trovato.");
  }
  await prisma.kitchenPrintJob.update({
    where: { id: job.id },
    data: { status: "PENDING", lastError: null },
  });
  await prisma.auditLog.create({
    data: {
      companyId,
      userId,
      locationId,
      action: "KITCHEN_PRINT_RETRY",
      entityType: "KitchenPrintJob",
      entityId: job.id,
      metadata: { attempts: job.attempts },
    },
  });
  return processKitchenPrintJob(companyId, locationId, job.id);
}
export async function reprintKitchenTicket(
  companyId: string,
  locationId: string,
  userId: string,
  ticketId: string,
  idempotencyKey: string = randomUUID(),
  reason = "Ristampa manuale",
) {
  return prisma.$transaction(async (tx) => {
    const key = `reprint:${ticketId}:${idempotencyKey}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ":" + key}))`;
    const existing = await tx.kitchenPrintJob.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey: key } },
    });
    if (existing) return existing;
    const ticket = await tx.kitchenTicket.findFirst({
      where: { id: ticketId, companyId, locationId },
      include: {
        lines: true,
        station: {
          include: {
            printers: {
              where: {
                enabled: true,
                mode: "NEXUS_DIRECT",
                deviceType: "NON_FISCAL",
              },
              take: 1,
            },
          },
        },
      },
    });
    if (!ticket) throw new RestaurantDomainError("Ticket non trovato.");
    const printer = ticket.station.printers[0];
    if (!printer)
      throw new RestaurantDomainError("Stampante attiva non configurata.");
    const originalJob = await tx.kitchenPrintJob.findFirst({
      where: { companyId, ticketId, printerId: printer.id, type: "PRINT" },
      orderBy: { createdAt: "asc" },
    });
    if (!originalJob)
      throw new RestaurantDomainError("Job originale non trovato.");
    const payload = renderKitchenTicket(
      ticket,
      printer.paperWidth,
      true,
      printer.charsPerLine ?? undefined,
    );
    const job = await tx.kitchenPrintJob.create({
      data: {
        companyId,
        locationId,
        stationId: ticket.kitchenStationId,
        ticketId,
        printerId: printer.id,
        type: "REPRINT",
        payload,
        payloadHash: kitchenPayloadHash(payload),
        idempotencyKey: key,
        originalJobId: originalJob.id,
        reprintReason: cleanText(reason, 300) || "Ristampa manuale",
        requestedById: userId,
      },
    });
    await tx.kitchenTicket.update({
      where: { id: ticket.id },
      data: { reprintCount: { increment: 1 } },
    });
    await writeAuditLogTx(tx, {
      companyId,
      userId,
      locationId,
      action: "KITCHEN_TICKET_REPRINTED",
      entityType: "KitchenTicket",
      entityId: ticket.id,
      metadata: {
        jobId: job.id,
        originalJobId: originalJob.id,
        reason: job.reprintReason,
      },
    });
    return job;
  });
}

export async function advanceKitchenLine(
  companyId: string,
  locationId: string,
  userId: string,
  lineId: string,
  status: "IN_PREPARATION" | "READY" | "SERVED",
) {
  if (status === "SERVED")
    return serveRestaurantOrderLine(
      companyId,
      locationId,
      userId,
      lineId,
      `${companyId}:${lineId}:serve`,
    );
  const line = await prisma.restaurantOrderLine.findFirst({
    where: { id: lineId, companyId, locationId },
  });
  if (!line) throw new RestaurantDomainError("Riga non trovata.");
  const data =
    status === "IN_PREPARATION"
      ? { status, startedAt: new Date() }
      : { status, readyAt: new Date() };
  await prisma.$transaction(async (tx) => {
    await tx.restaurantOrderLine.update({ where: { id: line.id }, data });
    await tx.kitchenTicketLine.updateMany({
      where: {
        companyId,
        locationId,
        orderLineId: line.id,
        status: { not: "CANCELLED" },
      },
      data: { status },
    });
    await tx.kitchenTicket.updateMany({
      where: {
        companyId,
        locationId,
        lines: { some: { orderLineId: line.id, status: { not: "CANCELLED" } } },
      },
      data: { status },
    });
    await emitRestaurantEventTx(
      tx,
      companyId,
      status === "READY" ? "KitchenItemReady" : "KitchenPreparationStarted",
      "RestaurantOrderLine",
      line.id,
      { status },
    );
  });
  return { id: line.id };
}
export async function serveRestaurantOrderLine(
  companyId: string,
  locationId: string,
  userId: string,
  lineId: string,
  idempotencyKey: string,
  lotSelections: Record<string, string> = {},
) {
  return executeIdempotent(
    companyId,
    "RestaurantOrderLineServe",
    locationId + ":" + idempotencyKey,
    async (tx) => {
      const line = await tx.restaurantOrderLine.findFirst({
        where: {
          id: lineId,
          companyId,
          locationId,
          status: { in: ["READY", "SERVED"] },
        },
        include: {
          order: true,
          item: {
            include: {
              recipeComponents: {
                where: { deletedAt: null },
                include: {
                  componentItem: true,
                  unitOfMeasure: { select: { precision: true } },
                },
              },
            },
          },
          variant: {
            include: {
              recipeImpacts: {
                include: {
                  componentItem: true,
                  unitOfMeasure: { select: { precision: true } },
                },
              },
            },
          },
          modifiers: {
            include: {
              modifier: {
                include: {
                  recipeImpacts: {
                    include: {
                      componentItem: true,
                      unitOfMeasure: { select: { precision: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!line)
        throw new RestaurantDomainError(
          "Solo una riga pronta può essere servita.",
        );
      if (line.status === "SERVED")
        return { aggregateId: line.id, orderLineId: line.id, movementIds: [] };
      type Component = {
        itemId: string;
        unitOfMeasureId: string;
        quantity: number;
        precision: number;
        item: { name: string; trackLots: boolean; trackSerials: boolean };
      };
      const components = new Map<string, Component>();
      const add = (
        itemId: string,
        uom: string,
        quantity: number,
        precision: number,
        item: Component["item"],
      ) => {
        const current = components.get(itemId);
        if (current && current.unitOfMeasureId !== uom)
          throw new RestaurantDomainError(
            "Unità di misura incoerente per " + item.name,
          );
        components.set(itemId, {
          itemId,
          unitOfMeasureId: uom,
          quantity: (current?.quantity ?? 0) + quantity,
          precision,
          item,
        });
      };
      if (line.item.type === "RECIPE")
        for (const c of line.item.recipeComponents)
          add(
            c.componentItemId,
            c.unitOfMeasureId,
            Number(c.quantity) * (1 + Number(c.wastePercentage || 0) / 100),
            c.unitOfMeasure.precision,
            c.componentItem,
          );
      for (const impact of [
        ...(line.variant?.recipeImpacts ?? []),
        ...line.modifiers.flatMap((x) => x.modifier?.recipeImpacts ?? []),
      ])
        add(
          impact.componentItemId,
          impact.unitOfMeasureId,
          Number(impact.quantityDelta),
          impact.unitOfMeasure.precision,
          impact.componentItem,
        );
      const active = [...components.values()].filter((c) => c.quantity > 0);
      const warehouse = active.length
        ? await tx.warehouse.findFirst({
            where: { companyId, locationId, active: true, deletedAt: null },
            include: {
              bins: { where: { active: true, deletedAt: null }, take: 1 },
            },
          })
        : null;
      if (active.length && !warehouse)
        throw new RestaurantDomainError(
          "Magazzino Restaurant non configurato.",
        );
      const inputs: MovementInput[] = active.map((c) => {
        const lotId = lotSelections[c.itemId];
        if ((c.item.trackLots || c.item.trackSerials) && !lotId)
          throw new RestaurantDomainError(
            "Lotto o seriale obbligatorio per " + c.item.name,
          );
        return {
          warehouseId: warehouse!.id,
          binId: warehouse!.bins[0]?.id,
          itemId: c.itemId,
          movementType: "CONSUMPTION",
          quantity:
            Math.round(
              (Number(line.quantity) * c.quantity + Number.EPSILON) *
                10 ** Math.min(3, c.precision),
            ) /
            10 ** Math.min(3, c.precision),
          unitOfMeasureId: c.unitOfMeasureId,
          lotId: c.item.trackLots ? lotId : null,
          serialId: c.item.trackSerials ? lotId : null,
          referenceType: "RestaurantOrderLine",
          referenceId: line.id,
          reason: "Consumo ricetta servita",
        };
      });
      const movements = inputs.length
        ? await postInventoryMovementsBatchTx(tx, companyId, userId, inputs)
        : [];
      for (let i = 0; i < inputs.length; i++)
        await tx.recipeConsumption.create({
          data: {
            companyId,
            locationId,
            orderId: line.order.id,
            orderLineId: line.id,
            recipeItemId: line.item.id,
            componentItemId: inputs[i].itemId,
            inventoryMovementId: movements[i].id,
            quantity: Number(inputs[i].quantity),
          },
        });
      await tx.restaurantOrderLine.update({
        where: { id: line.id },
        data: { status: "SERVED", servedAt: new Date() },
      });
      await tx.kitchenTicketLine.updateMany({
        where: {
          companyId,
          locationId,
          orderLineId: line.id,
          status: { not: "CANCELLED" },
        },
        data: { status: "COMPLETED" },
      });
      await emitRestaurantEventTx(
        tx,
        companyId,
        "RestaurantOrderLineServed",
        "RestaurantOrderLine",
        line.id,
        { movementIds: movements.map((m) => m.id) },
      );
      return {
        aggregateId: line.id,
        orderLineId: line.id,
        movementIds: movements.map((m) => m.id),
      };
    },
    { aggregateType: "RestaurantOrderLine", aggregateId: lineId },
  );
}
export async function reverseRecipeConsumption(
  companyId: string,
  locationId: string,
  userId: string,
  lineId: string,
  idempotencyKey = `${companyId}:${lineId}:reverse-consumption`,
) {
  return executeIdempotent(
    companyId,
    "RestaurantRecipeConsumptionReverse",
    locationId + ":" + idempotencyKey,
    async (tx) => {
      const rows = await tx.recipeConsumption.findMany({
        where: { companyId, locationId, orderLineId: lineId },
        include: { inventoryMovement: true },
      });
      const inputs: MovementInput[] = rows.map((row) => ({
        warehouseId: row.inventoryMovement.warehouseId,
        binId: row.inventoryMovement.binId,
        itemId: row.componentItemId,
        movementType: "ADJUSTMENT_IN",
        quantity: Number(row.quantity),
        unitOfMeasureId: row.inventoryMovement.unitOfMeasureId,
        lotId: row.inventoryMovement.lotId,
        serialId: row.inventoryMovement.serialId,
        unitCost: Number(row.inventoryMovement.unitCost ?? 0),
        referenceType: "RestaurantOrderLineReversal",
        referenceId: lineId,
        reason: "Storno compensativo completo consumo Restaurant",
      }));
      const movements = await postInventoryMovementsBatchTx(
        tx,
        companyId,
        userId,
        inputs,
      );
      await emitRestaurantEventTx(
        tx,
        companyId,
        "RecipeInventoryConsumptionReversed",
        "RestaurantOrderLine",
        lineId,
        { movementIds: movements.map((m) => m.id) },
      );
      return {
        aggregateId: lineId,
        count: movements.length,
        movementIds: movements.map((m) => m.id),
      };
    },
  );
}
export const getKitchen = (
  companyId: string,
  locationId: string,
  input:
    | string
    | {
        stationId?: string;
        status?: KitchenTicketStatus;
        table?: string;
        from?: Date;
      } = {},
) => {
  const filters = typeof input === "string" ? { stationId: input } : input;
  return prisma.kitchenTicket
    .findMany({
      where: {
        companyId,
        locationId,
        kitchenStationId: filters.stationId,
        status: filters.status ?? { notIn: ["COMPLETED", "CANCELLED"] },
        createdAt: filters.from ? { gte: filters.from } : undefined,
      },
      include: {
        station: true,
        order: true,
        dispatch: true,
        lines: {
          include: {
            orderLine: {
              include: {
                modifiers: {
                  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                },
              },
            },
          },
        },
        printJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    })
    .then((rows) =>
      filters.table
        ? rows.filter(
            (row) =>
              Array.isArray(row.tableNames) &&
              row.tableNames.some((value) =>
                String(value)
                  .toLowerCase()
                  .includes(filters.table!.toLowerCase()),
              ),
          )
        : rows,
    );
};
export const getPrintQueue = (companyId: string, locationId: string) =>
  prisma.kitchenPrintJob.findMany({
    where: { companyId, locationId },
    include: { printer: true, station: true, ticket: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
export async function saveKitchenStation(
  companyId: string,
  locationId: string,
  userId: string,
  input: {
    id?: string;
    code: string;
    name: string;
    sortOrder: number;
    active: boolean;
  },
) {
  const data = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    sortOrder: input.sortOrder,
    active: input.active,
  };
  if (!data.code || !data.name)
    throw new RestaurantDomainError("Codice e nome sono obbligatori.");
  const station = input.id
    ? await prisma.kitchenStation
        .updateMany({ where: { id: input.id, companyId, locationId }, data })
        .then((x) => (x.count ? { id: input.id } : null))
    : await prisma.kitchenStation.create({
        data: { companyId, locationId, ...data },
        select: { id: true },
      });
  if (!station) throw new RestaurantDomainError("Postazione non trovata.");
  await prisma.auditLog.create({
    data: {
      companyId,
      userId,
      locationId,
      action: "KITCHEN_STATION_SAVED",
      entityType: "KitchenStation",
      entityId: station.id,
    },
  });
  return station;
}
export async function saveRestaurantPrinter(
  companyId: string,
  locationId: string,
  userId: string,
  input: {
    id?: string;
    stationId: string;
    code: string;
    name: string;
    type: "MOCK" | "ESC_POS" | "CUSTOM_KUBE" | "FUSION_XML_1745";
    connectionType: "MOCK" | "NETWORK" | "USB" | "RS232" | "TCP";
    mode?: "LEGACY_FUSION" | "NEXUS_DIRECT";
    deviceType?: "FISCAL" | "NON_FISCAL";
    address?: string;
    enabled: boolean;
    copies: number;
    paperWidth: number;
    driver?:
      | "MOCK"
      | "ESC_POS_TCP"
      | "ESC_POS_USB"
      | "ESC_POS_SERIAL"
      | "VENDOR_SPECIFIC";
    host?: string;
    port?: number;
    charsPerLine?: number;
    encoding?: string;
  },
) {
  const station = await prisma.kitchenStation.findFirst({
    where: { id: input.stationId, companyId, locationId },
  });
  const mode =
    input.mode ??
    (["CUSTOM_KUBE", "FUSION_XML_1745"].includes(input.type)
      ? "LEGACY_FUSION"
      : "NEXUS_DIRECT");
  const deviceType =
    input.deviceType ??
    (["CUSTOM_KUBE", "FUSION_XML_1745"].includes(input.type)
      ? "FISCAL"
      : "NON_FISCAL");
  assertDirectPrinterSafe({ mode, deviceType });
  if (
    mode === "NEXUS_DIRECT" &&
    ["CUSTOM_KUBE", "FUSION_XML_1745"].includes(input.type)
  )
    throw new RestaurantDomainError(DIRECT_PRINT_TO_FISCAL_DEVICE_FORBIDDEN);
  if (
    ["CUSTOM_KUBE", "FUSION_XML_1745"].includes(input.type) &&
    (mode !== "LEGACY_FUSION" || deviceType !== "FISCAL")
  )
    throw new RestaurantDomainError(
      "KUBE_AND_FUSION_REQUIRE_LEGACY_FUSION_FISCAL",
    );
  if (
    mode === "LEGACY_FUSION" &&
    !["CUSTOM_KUBE", "FUSION_XML_1745"].includes(input.type)
  )
    throw new RestaurantDomainError("LEGACY_FUSION_REQUIRES_FUSION_PRINTER");
  if (
    !station ||
    ![58, 80].includes(input.paperWidth) ||
    input.copies < 1 ||
    (input.port !== undefined && (input.port < 1 || input.port > 65535)) ||
    (input.charsPerLine !== undefined &&
      (input.charsPerLine < 16 || input.charsPerLine > 96))
  )
    throw new RestaurantDomainError("Configurazione stampante non valida.");
  const data = {
    stationId: station.id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    type: input.type,
    mode,
    deviceType,
    connectionType: input.connectionType,
    address: input.address?.trim() || null,
    enabled: input.enabled,
    copies: input.copies,
    paperWidth: input.paperWidth,
    driver: input.driver ?? "MOCK",
    host: input.host?.trim() || null,
    port: input.port ?? null,
    charsPerLine: input.charsPerLine ?? null,
    encoding: input.encoding?.trim() || "UTF-8",
  };
  const printer = input.id
    ? await prisma.restaurantPrinter
        .updateMany({ where: { id: input.id, companyId, locationId }, data })
        .then((x) => (x.count ? { id: input.id } : null))
    : await prisma.restaurantPrinter.create({
        data: { companyId, locationId, ...data },
        select: { id: true },
      });
  if (!printer) throw new RestaurantDomainError("Stampante non trovata.");
  await prisma.auditLog.create({
    data: {
      companyId,
      userId,
      locationId,
      action: "RESTAURANT_PRINTER_SAVED",
      entityType: "RestaurantPrinter",
      entityId: printer.id,
      metadata: { stationId: station.id, type: input.type },
    },
  });
  return printer;
}
export async function saveKitchenRouting(
  companyId: string,
  locationId: string,
  userId: string,
  itemId: string,
  stationId: string,
) {
  const [item, station] = await Promise.all([
    prisma.item.findFirst({
      where: { id: itemId, companyId, active: true, deletedAt: null },
    }),
    prisma.kitchenStation.findFirst({
      where: { id: stationId, companyId, locationId, active: true },
    }),
  ]);
  if (!item || !station)
    throw new RestaurantDomainError("Prodotto o postazione non validi.");
  await prisma.$transaction(async (tx) => {
    await tx.kitchenStationAssignment.updateMany({
      where: { companyId, itemId, active: true },
      data: { active: false },
    });
    await tx.kitchenStationAssignment.create({
      data: { companyId, kitchenStationId: station.id, itemId, priority: 100 },
    });
    await writeAuditLogTx(tx, {
      companyId,
      userId,
      locationId,
      action: "KITCHEN_ROUTING_SAVED",
      entityType: "Item",
      entityId: itemId,
      metadata: { stationId },
    });
  });
}
