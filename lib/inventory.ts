import "server-only";

import { Prisma, type InventoryMovementType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { executeIdempotent } from "@/lib/idempotency";

export class InventoryDomainError extends Error {
  constructor(message: string) { super(message); this.name = "InventoryDomainError"; }
}

const INBOUND = new Set<InventoryMovementType>(["OPENING", "RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "INVENTORY_GAIN", "PRODUCTION", "RETURN_IN"]);
const OUTBOUND = new Set<InventoryMovementType>(["ISSUE", "TRANSFER_OUT", "ADJUSTMENT_OUT", "INVENTORY_LOSS", "CONSUMPTION", "RETURN_OUT"]);

export type MovementInput = {
  warehouseId: string; locationId?: string; binId?: string | null; itemId: string; movementType: InventoryMovementType;
  quantity: number | string; unitOfMeasureId: string; lotId?: string | null; serialId?: string | null;
  unitCost?: number | string | null; referenceType?: string | null; referenceId?: string | null;
  reason?: string | null; note?: string | null; occurredAt?: Date;
};

function positive(value: number | string, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new InventoryDomainError(`${label} deve essere positiva.`);
  return number;
}

function direction(type: InventoryMovementType) {
  if (INBOUND.has(type)) return 1;
  if (OUTBOUND.has(type)) return -1;
  throw new InventoryDomainError("Il tipo REVERSAL è riservato al servizio di storno.");
}

async function emit(tx: Prisma.TransactionClient, companyId: string, eventType: string, aggregateType: string, aggregateId: string, payload: Prisma.InputJsonValue) {
  await tx.domainEvent.create({ data: { companyId, eventType, aggregateType, aggregateId, payload, occurredAt: new Date() } });
}

async function postWithTx(tx: Prisma.TransactionClient, companyId: string, userId: string, input: MovementInput & { reversalOfId?: string; forcedDirection?: 1 | -1 }) {
  const quantity = positive(input.quantity, "La quantità");
  const movementDirection = input.forcedDirection ?? direction(input.movementType);
  const [warehouse, item, unit, bin, lot, serial] = await Promise.all([
    tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId, ...(input.locationId ? { locationId: input.locationId } : {}), active: true, deletedAt: null }, select: { id: true, locationId: true, allowNegativeStock: true } }),
    tx.item.findFirst({ where: { id: input.itemId, companyId, active: true, deletedAt: null }, select: { id: true, type: true, stockManaged: true, trackLots: true, trackSerials: true, trackExpiration: true, unitOfMeasureId: true, standardCost: true, productProfile: { select: { minimumStock: true, reorderPoint: true } } } }),
    tx.unitOfMeasure.findFirst({ where: { id: input.unitOfMeasureId, companyId, active: true, deletedAt: null }, select: { id: true, precision: true } }),
    input.binId ? tx.warehouseBin.findFirst({ where: { id: input.binId, companyId, warehouseId: input.warehouseId, active: true, deletedAt: null }, select: { id: true } }) : null,
    input.lotId ? tx.inventoryLot.findFirst({ where: { id: input.lotId, companyId, locationId: input.locationId ?? undefined, itemId: input.itemId, active: true }, select: { id: true, locationId: true, expirationDate: true } }) : null,
    input.serialId ? tx.inventorySerial.findFirst({ where: { id: input.serialId, companyId, locationId: input.locationId ?? undefined, itemId: input.itemId }, select: { id: true, locationId: true, status: true } }) : null,
  ]);
  if (!warehouse || !item || !unit || (input.binId && !bin) || (input.lotId && !lot) || (input.serialId && !serial)) throw new InventoryDomainError("Uno o più riferimenti Inventory non sono validi per la Company.");
  if ((lot && lot.locationId !== warehouse.locationId) || (serial && serial.locationId !== warehouse.locationId)) throw new InventoryDomainError("Lotto o seriale non appartiene alla Location del magazzino.");
  if (!item.stockManaged || !["PRODUCT", "INGREDIENT"].includes(item.type)) throw new InventoryDomainError("Solo PRODUCT e INGREDIENT stock-managed possono movimentare giacenza.");
  if (item.unitOfMeasureId !== unit.id) throw new InventoryDomainError("La V1 non converte unità di misura: usa l'unità base dell'Item.");
  if (item.trackLots && !lot) throw new InventoryDomainError("Il lotto è obbligatorio per questo Item.");
  if (item.trackSerials && !serial) throw new InventoryDomainError("Il seriale è obbligatorio per questo Item.");
  if (item.trackSerials && quantity !== 1) throw new InventoryDomainError("Un movimento serializzato deve avere quantità 1.");
  if (item.trackExpiration && (!lot || !lot.expirationDate)) throw new InventoryDomainError("Il lotto deve avere una scadenza.");
  const decimals = (String(quantity).split(".")[1] ?? "").length;
  if (decimals > unit.precision) throw new InventoryDomainError(`La quantità ammette al massimo ${unit.precision} decimali.`);

  const current = await tx.stockBalance.findUnique({ where: { companyId_warehouseId_itemId: { companyId, warehouseId: warehouse.id, itemId: item.id } } });
  const oldQuantity = Number(current?.quantity ?? 0);
  const oldAverage = Number(current?.averageCost ?? item.standardCost ?? 0);
  const newQuantity = oldQuantity + movementDirection * quantity;
  if (newQuantity < 0 && !warehouse.allowNegativeStock) throw new InventoryDomainError("Giacenza insufficiente: lo stock negativo non è consentito.");
  const requestedCost = input.unitCost === null || input.unitCost === undefined ? undefined : Number(input.unitCost);
  if (requestedCost !== undefined && (!Number.isFinite(requestedCost) || requestedCost < 0)) throw new InventoryDomainError("Costo unitario non valido.");
  const movementCost = requestedCost ?? oldAverage;
  const averageCost = movementDirection > 0 && newQuantity > 0 ? ((oldQuantity * oldAverage) + (quantity * movementCost)) / newQuantity : oldAverage;
  const stockValue = newQuantity * averageCost;
  const postedAt = new Date();
  const movement = await tx.inventoryMovement.create({ data: { companyId, locationId: warehouse.locationId, warehouseId: warehouse.id, binId: bin?.id, itemId: item.id, movementType: input.movementType, quantity, direction: movementDirection, unitOfMeasureId: unit.id, lotId: lot?.id, serialId: serial?.id, unitCost: movementCost, totalCost: quantity * movementCost, referenceType: input.referenceType, referenceId: input.referenceId, reason: input.reason, note: input.note, occurredAt: input.occurredAt ?? postedAt, postedAt, postedById: userId, reversalOfId: input.reversalOfId }, select: { id: true } });
  await tx.stockBalance.upsert({ where: { companyId_warehouseId_itemId: { companyId, warehouseId: warehouse.id, itemId: item.id } }, create: { companyId, locationId: warehouse.locationId, warehouseId: warehouse.id, itemId: item.id, quantity: newQuantity, averageCost, stockValue }, update: { quantity: newQuantity, averageCost, stockValue } });
  if (serial) await tx.inventorySerial.update({ where: { id: serial.id }, data: { status: movementDirection > 0 ? "AVAILABLE" : "ISSUED" } });
  await emit(tx, companyId, "InventoryMovementPosted", "InventoryMovement", movement.id, { movementId: movement.id, warehouseId: warehouse.id, itemId: item.id, quantity, direction: movementDirection });
  if (lot?.expirationDate) {
    const alertLimit = new Date();
    alertLimit.setDate(alertLimit.getDate() + 30);
    if (lot.expirationDate >= new Date() && lot.expirationDate <= alertLimit) {
      await emit(tx, companyId, "InventoryLotExpiringSoon", "InventoryLot", lot.id, { lotId: lot.id, itemId: item.id, expirationDate: lot.expirationDate.toISOString() });
    }
  }
  const minimum = Number(item.productProfile?.minimumStock ?? item.productProfile?.reorderPoint ?? 0);
  if (minimum > 0 && newQuantity < minimum) await emit(tx, companyId, "StockBelowMinimum", "Item", item.id, { warehouseId: warehouse.id, quantity: newQuantity, minimum });
  return movement;
}

export async function postInventoryMovementTx(tx: Prisma.TransactionClient, companyId: string, userId: string, input: MovementInput) {
  return postWithTx(tx, companyId, userId, input);
}

export async function postInventoryMovementsBatchTx(tx: Prisma.TransactionClient, companyId: string, userId: string, inputs: MovementInput[]) {
  if (!inputs.length) throw new InventoryDomainError("Il batch Inventory richiede almeno un movimento.");
  const movements: Array<{ id: string }> = [];
  for (const input of inputs) movements.push(await postInventoryMovementTx(tx, companyId, userId, input));
  return movements;
}

export async function postInventoryMovementsBatch(companyId: string, userId: string, idempotencyKey: string, inputs: MovementInput[]) {
  return executeIdempotent(companyId, "InventoryMovementBatch", idempotencyKey, async (tx) => {
    const movements = await postInventoryMovementsBatchTx(tx, companyId, userId, inputs);
    return { aggregateId: movements[0]?.id ?? "", movementIds: movements.map(({ id }) => id) };
  }, { aggregateType: "InventoryMovementBatch", timeout: 30000 });
}

export async function postInventoryMovement(companyId: string, userId: string, input: MovementInput) {
  return prisma.$transaction((tx) => postWithTx(tx, companyId, userId, input), { isolationLevel: "Serializable", timeout: 10000 });
}

export async function reverseInventoryMovement(companyId: string, userId: string, movementId: string, reason?: string, locationId?: string) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.inventoryMovement.findFirst({ where: { id: movementId, companyId, locationId }, select: { id: true, locationId: true, warehouseId: true, binId: true, itemId: true, quantity: true, direction: true, unitOfMeasureId: true, lotId: true, serialId: true, unitCost: true, reversedBy: { select: { id: true } } } });
    if (!original) throw new InventoryDomainError("Movimento non trovato.");
    if (original.reversedBy) throw new InventoryDomainError("Il movimento è già stato stornato.");
    return postWithTx(tx, companyId, userId, { warehouseId: original.warehouseId, locationId: original.locationId, binId: original.binId, itemId: original.itemId, movementType: "REVERSAL", quantity: original.quantity.toString(), unitOfMeasureId: original.unitOfMeasureId, lotId: original.lotId, serialId: original.serialId, unitCost: Number(original.unitCost ?? 0), reason: reason ?? "Storno", reversalOfId: original.id, forcedDirection: original.direction === 1 ? -1 : 1 });
  }, { isolationLevel: "Serializable", timeout: 10000 });
}

export async function createTransfer(companyId: string, userId: string, input: { code: string; sourceWarehouseId: string; destinationWarehouseId: string; sourceBinId?: string | null; destinationBinId?: string | null; lines: Array<{ itemId: string; quantity: number; unitOfMeasureId: string; lotId?: string | null; serialId?: string | null }> }) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) throw new InventoryDomainError("Origine e destinazione devono essere differenti.");
  if (!input.lines.length) throw new InventoryDomainError("Il trasferimento richiede almeno una riga.");
  return prisma.$transaction(async (tx) => {
    const warehouses = await tx.warehouse.findMany({ where: { companyId, id: { in: [input.sourceWarehouseId, input.destinationWarehouseId] }, active: true, deletedAt: null }, select: { id: true, locationId: true } });
    if (warehouses.length !== 2) throw new InventoryDomainError("Magazzini non validi per la Company.");
    const source = warehouses.find((warehouse) => warehouse.id === input.sourceWarehouseId)!;
    const destination = warehouses.find((warehouse) => warehouse.id === input.destinationWarehouseId)!;
    if (source.locationId !== destination.locationId) throw new InventoryDomainError("I trasferimenti inter-location non sono ancora supportati.");
    if (input.sourceBinId && !(await tx.warehouseBin.findFirst({ where: { id: input.sourceBinId, companyId, warehouseId: input.sourceWarehouseId, active: true, deletedAt: null }, select: { id: true } }))) throw new InventoryDomainError("Ubicazione di origine non valida.");
    if (input.destinationBinId && !(await tx.warehouseBin.findFirst({ where: { id: input.destinationBinId, companyId, warehouseId: input.destinationWarehouseId, active: true, deletedAt: null }, select: { id: true } }))) throw new InventoryDomainError("Ubicazione di destinazione non valida.");
    return tx.inventoryTransfer.create({ data: { companyId, code: input.code, sourceLocationId: source.locationId, destinationLocationId: destination.locationId, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, sourceBinId: input.sourceBinId, destinationBinId: input.destinationBinId, createdById: userId, lines: { create: input.lines.map((line) => ({ ...line, quantity: positive(line.quantity, "La quantità") })) } }, select: { id: true } });
  });
}

export async function completeTransfer(companyId: string, userId: string, transferId: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.inventoryTransfer.findFirst({ where: { id: transferId, companyId, status: "DRAFT" }, include: { lines: true } });
    if (!transfer) throw new InventoryDomainError("Trasferimento non disponibile o già completato.");
    for (const line of transfer.lines) {
      const common = { itemId: line.itemId, quantity: line.quantity.toString(), unitOfMeasureId: line.unitOfMeasureId, lotId: line.lotId, serialId: line.serialId, referenceType: "InventoryTransfer", referenceId: transfer.id };
      await postWithTx(tx, companyId, userId, { ...common, warehouseId: transfer.sourceWarehouseId, binId: transfer.sourceBinId, movementType: "TRANSFER_OUT" });
      await postWithTx(tx, companyId, userId, { ...common, warehouseId: transfer.destinationWarehouseId, binId: transfer.destinationBinId, movementType: "TRANSFER_IN" });
    }
    await tx.inventoryTransfer.update({ where: { id: transfer.id }, data: { status: "COMPLETED", completedAt: new Date(), completedById: userId } });
    await emit(tx, companyId, "InventoryTransferCompleted", "InventoryTransfer", transfer.id, { transferId: transfer.id, lines: transfer.lines.length });
    return { id: transfer.id };
  }, { isolationLevel: "Serializable", timeout: 20000 });
}

export async function createInventoryCount(companyId: string, userId: string, input: { code: string; warehouseId: string; locationId?: string; binId?: string | null; lines: Array<{ itemId: string; countedQuantity: number; unitOfMeasureId: string; lotId?: string | null; serialId?: string | null }> }) {
  if (!input.lines.length) throw new InventoryDomainError("L'inventario richiede almeno una riga.");
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId, active: true, deletedAt: null }, select: { id: true, locationId: true } });
    if (!warehouse || (input.locationId && warehouse.locationId !== input.locationId)) throw new InventoryDomainError("Magazzino non valido per la Location corrente.");
    if (input.binId && !(await tx.warehouseBin.findFirst({ where: { id: input.binId, companyId, warehouseId: input.warehouseId, active: true, deletedAt: null }, select: { id: true } }))) throw new InventoryDomainError("Ubicazione non valida.");
    const lines = [];
    for (const line of input.lines) {
      if (!Number.isFinite(line.countedQuantity) || line.countedQuantity < 0) throw new InventoryDomainError("La quantità contata non può essere negativa.");
      const item = await tx.item.findFirst({ where: { id: line.itemId, companyId, active: true, deletedAt: null, stockManaged: true, unitOfMeasureId: line.unitOfMeasureId }, select: { id: true } });
      if (!item) throw new InventoryDomainError("Item o unità di misura non validi per la Company.");
      const [lot, serial, movements] = await Promise.all([
        line.lotId ? tx.inventoryLot.findFirst({ where: { id: line.lotId, companyId, locationId: warehouse.locationId, itemId: line.itemId, active: true }, select: { id: true } }) : null,
        line.serialId ? tx.inventorySerial.findFirst({ where: { id: line.serialId, companyId, locationId: warehouse.locationId, itemId: line.itemId }, select: { id: true } }) : null,
        tx.inventoryMovement.findMany({ where: { companyId, locationId: warehouse.locationId, warehouseId: input.warehouseId, binId: input.binId || undefined, itemId: line.itemId, lotId: line.lotId || undefined, serialId: line.serialId || undefined }, select: { quantity: true, direction: true } }),
      ]);
      if ((line.lotId && !lot) || (line.serialId && !serial)) throw new InventoryDomainError("Lotto o seriale non valido per la Location del magazzino.");
      const expected = movements.reduce((sum, movement) => sum + Number(movement.quantity) * movement.direction, 0);
      lines.push({ ...line, expectedQuantity: expected, difference: Number(line.countedQuantity) - expected });
    }
    return tx.inventoryCount.create({ data: { companyId, locationId: warehouse.locationId, code: input.code, warehouseId: input.warehouseId, binId: input.binId, createdById: userId, countedAt: new Date(), lines: { create: lines } }, select: { id: true } });
  });
}

export async function postInventoryCount(companyId: string, userId: string, countId: string, locationId?: string) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findFirst({ where: { id: countId, companyId, locationId, status: "DRAFT" }, include: { lines: true } });
    if (!count) throw new InventoryDomainError("Inventario non disponibile o già contabilizzato.");
    for (const line of count.lines) if (Number(line.difference) !== 0) await postWithTx(tx, companyId, userId, { warehouseId: count.warehouseId, binId: count.binId, itemId: line.itemId, movementType: Number(line.difference) > 0 ? "INVENTORY_GAIN" : "INVENTORY_LOSS", quantity: Math.abs(Number(line.difference)), unitOfMeasureId: line.unitOfMeasureId, lotId: line.lotId, serialId: line.serialId, referenceType: "InventoryCount", referenceId: count.id });
    await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "POSTED", postedAt: new Date(), postedById: userId } });
    await emit(tx, companyId, "InventoryCountPosted", "InventoryCount", count.id, { countId: count.id, lines: count.lines.length });
    return { id: count.id };
  }, { isolationLevel: "Serializable", timeout: 20000 });
}

export async function getStockBalance(companyId: string, locationId: string) { return prisma.stockBalance.findMany({ where: { companyId, locationId }, select: { quantity: true, averageCost: true, stockValue: true, item: { select: { id: true, code: true, name: true } }, warehouse: { select: { id: true, code: true, name: true } } }, orderBy: [{ item: { name: "asc" } }, { warehouse: { name: "asc" } }] }); }
export async function getItemStockByWarehouse(companyId: string, locationId: string, itemId: string) { return prisma.stockBalance.findMany({ where: { companyId, locationId, itemId }, select: { quantity: true, averageCost: true, stockValue: true, warehouse: { select: { id: true, code: true, name: true } } } }); }
export async function getLowStockItems(companyId: string, locationId: string) { const balances = await getStockBalance(companyId, locationId); const profiles = await prisma.productProfile.findMany({ where: { companyId, OR: [{ minimumStock: { not: null } }, { reorderPoint: { not: null } }] }, select: { itemId: true, minimumStock: true, reorderPoint: true } }); const thresholds = new Map(profiles.map((p) => [p.itemId, Number(p.minimumStock ?? p.reorderPoint ?? 0)])); return balances.filter((row) => Number(row.quantity) < (thresholds.get(row.item.id) ?? 0)); }
export async function getExpiringLots(companyId: string, locationId: string, days = 30) { const until = new Date(); until.setDate(until.getDate() + days); return prisma.inventoryLot.findMany({ where: { companyId, locationId, active: true, expirationDate: { gte: new Date(), lte: until } }, select: { id: true, lotNumber: true, expirationDate: true, item: { select: { id: true, code: true, name: true } }, movements: { where: { companyId, locationId }, select: { quantity: true, direction: true } } }, orderBy: { expirationDate: "asc" } }); }

export async function getInventoryOptions(companyId: string, locationId: string) {
  const [warehouses, items, lots, serials] = await Promise.all([
    prisma.warehouse.findMany({ where: { companyId, locationId, active: true, deletedAt: null }, select: { id: true, code: true, name: true, bins: { where: { active: true, deletedAt: null }, select: { id: true, code: true, name: true } } }, orderBy: { code: "asc" } }),
    prisma.item.findMany({ where: { companyId, active: true, deletedAt: null, stockManaged: true, type: { in: ["PRODUCT", "INGREDIENT"] } }, select: { id: true, code: true, name: true, unitOfMeasureId: true, unitOfMeasure: { select: { symbol: true } }, trackLots: true, trackSerials: true }, orderBy: { name: "asc" } }),
    prisma.inventoryLot.findMany({ where: { companyId, locationId, active: true }, select: { id: true, itemId: true, lotNumber: true, expirationDate: true }, orderBy: { lotNumber: "asc" } }),
    prisma.inventorySerial.findMany({ where: { companyId, locationId }, select: { id: true, itemId: true, serialNumber: true, status: true }, orderBy: { serialNumber: "asc" } }),
  ]);
  return { warehouses, items, lots, serials };
}

export async function getInventoryMovements(companyId: string, locationId: string, filters: { query?: string; movementType?: InventoryMovementType; warehouseId?: string; itemId?: string; from?: Date; to?: Date } = {}, page = 1) {
  const where: Prisma.InventoryMovementWhereInput = { companyId, locationId, movementType: filters.movementType, warehouseId: filters.warehouseId, itemId: filters.itemId, occurredAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined, ...(filters.query ? { OR: [{ item: { name: { contains: filters.query, mode: "insensitive" } } }, { item: { code: { contains: filters.query, mode: "insensitive" } } }, { referenceId: { contains: filters.query, mode: "insensitive" } }] } : {}) };
  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({ where, select: { id: true, movementType: true, quantity: true, direction: true, occurredAt: true, referenceType: true, referenceId: true, reversalOfId: true, item: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, lot: { select: { lotNumber: true } }, serial: { select: { serialNumber: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (Math.max(page, 1) - 1) * 25, take: 25 }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return { rows, total };
}

export async function getInventoryMovement(companyId: string, locationId: string, id: string) { return prisma.inventoryMovement.findFirst({ where: { id, companyId, locationId }, include: { item: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, bin: { select: { code: true, name: true } }, lot: { select: { lotNumber: true, expirationDate: true } }, serial: { select: { serialNumber: true } }, postedBy: { select: { firstName: true, lastName: true, email: true } }, reversalOf: { select: { id: true } }, reversedBy: { select: { id: true } } } }); }

export async function getInventoryTransfers(companyId: string, locationId: string) { return prisma.inventoryTransfer.findMany({ where: { companyId, sourceLocationId: locationId, destinationLocationId: locationId }, include: { sourceWarehouse: { select: { code: true } }, destinationWarehouse: { select: { code: true } }, lines: { select: { id: true } } }, orderBy: { createdAt: "desc" } }); }
export async function getInventoryTransfer(companyId: string, locationId: string, id: string) { return prisma.inventoryTransfer.findFirst({ where: { id, companyId, sourceLocationId: locationId, destinationLocationId: locationId }, include: { sourceWarehouse: true, destinationWarehouse: true, sourceBin: true, destinationBin: true, lines: { include: { item: true, lot: true, serial: true, unitOfMeasure: true } } } }); }
export async function getInventoryCounts(companyId: string, locationId: string) { return prisma.inventoryCount.findMany({ where: { companyId, locationId }, include: { warehouse: { select: { code: true, name: true } }, lines: { select: { id: true } } }, orderBy: { createdAt: "desc" } }); }
export async function getInventoryCount(companyId: string, locationId: string, id: string) { return prisma.inventoryCount.findFirst({ where: { id, companyId, locationId }, include: { warehouse: true, bin: true, lines: { include: { item: true, lot: true, serial: true, unitOfMeasure: true } } } }); }
export async function getWarehouses(companyId: string, locationId: string, includeDeleted = false) { return prisma.warehouse.findMany({ where: { companyId, locationId, ...(includeDeleted ? {} : { deletedAt: null }) }, include: { location: true, bins: { orderBy: { code: "asc" } } }, orderBy: { code: "asc" } }); }
export async function getInventoryLots(companyId: string, locationId: string, query?: string) { return prisma.inventoryLot.findMany({ where: { companyId, locationId, ...(query ? { OR: [{ lotNumber: { contains: query, mode: "insensitive" } }, { item: { name: { contains: query, mode: "insensitive" } } }] } : {}) }, include: { item: { select: { code: true, name: true } }, movements: { where: { companyId, locationId }, select: { quantity: true, direction: true } } }, orderBy: { expirationDate: { sort: "asc", nulls: "last" } } }); }
export async function getInventoryDashboard(companyId: string, locationId: string) { const [movements, transfers] = await Promise.all([prisma.inventoryMovement.findMany({ where: { companyId, locationId }, select: { id: true, movementType: true, quantity: true, direction: true, occurredAt: true, item: { select: { code: true } }, warehouse: { select: { code: true } } }, orderBy: { occurredAt: "desc" }, take: 6 }), prisma.inventoryTransfer.findMany({ where: { companyId, sourceLocationId: locationId, destinationLocationId: locationId, status: "DRAFT" }, select: { id: true, code: true, sourceWarehouse: { select: { code: true } }, destinationWarehouse: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 6 })]); return { movements, transfers }; }
export async function getDetailedStock(companyId: string, locationId: string) { const movements = await prisma.inventoryMovement.findMany({ where: { companyId, locationId }, select: { quantity: true, direction: true, warehouse: { select: { code: true } }, bin: { select: { code: true } }, item: { select: { code: true, name: true } }, lot: { select: { lotNumber: true } }, serial: { select: { serialNumber: true } } } }); const grouped = new Map<string, { warehouse: string; bin: string; item: string; lot: string; serial: string; quantity: number }>(); for (const row of movements) { const data = { warehouse: row.warehouse.code, bin: row.bin?.code ?? "—", item: `${row.item.code} · ${row.item.name}`, lot: row.lot?.lotNumber ?? "—", serial: row.serial?.serialNumber ?? "—", quantity: 0 }; const key = JSON.stringify(data); const current = grouped.get(key) ?? data; current.quantity += Number(row.quantity) * row.direction; grouped.set(key, current); } return [...grouped.values()].filter((row) => row.quantity !== 0).sort((a, b) => a.item.localeCompare(b.item)); }
