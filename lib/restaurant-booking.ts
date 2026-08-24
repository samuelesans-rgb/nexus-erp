import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Prisma, RestaurantReservationSource, RestaurantReservationStatus } from "@/generated/prisma/client";
import { executeIdempotent } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { lockRestaurantResources } from "@/lib/restaurant-locking";
import { checkAvailability, getBookingSettings, RestaurantAvailabilityError } from "@/lib/restaurant-availability";

export class RestaurantBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantBookingError";
  }
}

const terminal = new Set<RestaurantReservationStatus>(["CANCELLED", "COMPLETED", "NO_SHOW"]);
const transitions: Partial<Record<RestaurantReservationStatus, readonly RestaurantReservationStatus[]>> = {
  WAITLIST: ["PENDING", "CONFIRMED", "CANCELLED"],
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
};
const eventNames: Partial<Record<RestaurantReservationStatus, string>> = {
  CONFIRMED: "RestaurantReservationConfirmed",
  CANCELLED: "RestaurantReservationCancelled",
  SEATED: "RestaurantGuestSeated",
  COMPLETED: "RestaurantReservationCompleted",
  NO_SHOW: "RestaurantNoShowRecorded",
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export type ReservationInput = {
  locationId: string;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  partySize: number;
  startTime: Date;
  durationMinutes?: number;
  tableId?: string | null;
  tableIds?: string[];
  serviceWindowId?: string | null;
  partnerId?: string | null;
  source?: RestaurantReservationSource;
};

export type StaffReservationFilters = {
  date: Date;
  query?: string;
  status?: RestaurantReservationStatus;
};

export type StaffReservationUpdate = Pick<ReservationInput, "guestName" | "phone" | "email" | "notes" | "partySize" | "startTime" | "durationMinutes"> & {
  internalNotes?: string | null;
};

function event(tx: Prisma.TransactionClient, companyId: string, reservationId: string, eventType: string, payload: Prisma.InputJsonValue) {
  return tx.domainEvent.create({ data: { companyId, aggregateType: "RestaurantReservation", aggregateId: reservationId, eventType, payload, occurredAt: new Date() } });
}

async function byId(companyId: string, locationId: string, id: string) {
  const reservation = await prisma.restaurantReservation.findFirst({
    where: { id, companyId, locationId, deletedAt: null },
    include: { tables: true },
  });
  if (!reservation) throw new RestaurantBookingError("Prenotazione non trovata nella sede corrente.");
  return reservation;
}

export async function getStaffReservations(companyId: string, locationId: string, filters: StaffReservationFilters) {
  const start = new Date(filters.date);
  if (Number.isNaN(start.getTime())) throw new RestaurantBookingError("Data non valida.");
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const query = filters.query?.trim();
  return prisma.restaurantReservation.findMany({
    where: {
      companyId,
      locationId,
      deletedAt: null,
      startTime: { gte: start, lt: end },
      status: filters.status,
      ...(query
        ? {
            OR: [
              { guestName: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { code: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { tables: { include: { table: { select: { id: true, code: true, name: true } } } } },
    orderBy: [{ startTime: "asc" }, { code: "asc" }],
  });
}

export async function getStaffReservation(companyId: string, locationId: string, id: string) {
  return prisma.restaurantReservation.findFirst({
    where: { id, companyId, locationId, deletedAt: null },
    include: {
      tables: { include: { table: { select: { id: true, code: true, name: true, seats: true, maxSeats: true } } } },
    },
  });
}

export async function getReservationHistory(companyId: string, reservationId: string) {
  return prisma.domainEvent.findMany({
    where: { companyId, aggregateType: "RestaurantReservation", aggregateId: reservationId },
    select: { id: true, eventType: true, occurredAt: true, payload: true },
    orderBy: { occurredAt: "desc" },
  });
}

export async function getAssignableTables(companyId: string, locationId: string) {
  return prisma.restaurantTable.findMany({
    where: { companyId, locationId, active: true, deletedAt: null, status: { not: "OUT_OF_SERVICE" } },
    select: { id: true, code: true, name: true, seats: true, maxSeats: true, status: true },
    orderBy: [{ code: "asc" }],
  });
}

export async function createReservation(companyId: string, userId: string | null, idempotencyKey: string, input: ReservationInput) {
  if (!input.guestName.trim()) throw new RestaurantBookingError("Il nome del cliente è obbligatorio.");
  const availability = await checkAvailability(companyId, input.locationId, input);
  if (!availability.available || !availability.tableIds.length) throw new RestaurantBookingError("Nessun tavolo disponibile per l'orario selezionato.");
  return executeIdempotent(companyId, "RestaurantBookingCreate", idempotencyKey, async (tx) => {
    await lockRestaurantResources(tx, companyId, availability.tableIds.map(id => "table:" + id));
    const conflict = await tx.restaurantReservationTable.findFirst({ where: { companyId, tableId: { in: availability.tableIds }, reservation: { locationId: input.locationId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: availability.endTime }, endTime: { gt: availability.startTime } } }, select: { tableId: true } });
    if (conflict) throw new RestaurantBookingError("Il tavolo non è più disponibile.");
    if (input.partnerId && !(await tx.partner.findFirst({ where: { id: input.partnerId, companyId, active: true, deletedAt: null }, select: { id: true } }))) throw new RestaurantBookingError("Cliente non valido.");
    const confirmationToken = token(); const cancellationToken = token();
    const settings = await getBookingSettings(companyId, input.locationId);
    const status = settings.confirmationPolicy === "AUTO_CONFIRM" ? "CONFIRMED" : "PENDING";
    const reservation = await tx.restaurantReservation.create({ data: { companyId, locationId: input.locationId, code: `RES-${randomBytes(6).toString("hex").toUpperCase()}`, partnerId: input.partnerId ?? null, guestName: input.guestName.trim(), phone: input.phone?.trim() || null, email: input.email?.trim().toLowerCase() || null, reservationDate: availability.startTime, startTime: availability.startTime, endTime: availability.endTime, durationMinutes: availability.durationMinutes, partySize: input.partySize, serviceWindowId: availability.serviceWindowId, source: input.source ?? "WEBSITE", status, notes: input.notes?.trim() || null, confirmationTokenHash: hash(confirmationToken), cancellationTokenHash: hash(cancellationToken), createdById: userId, updatedById: userId, tables: { create: availability.tableIds.map(tableId => ({ tableId })) } }, select: { id: true, code: true } });
    await event(tx, companyId, reservation.id, "RestaurantReservationCreated", { source: input.source ?? "WEBSITE", status, tableIds: availability.tableIds, serviceWindowId: availability.serviceWindowId });
    return { aggregateId: reservation.id, reservationId: reservation.id, code: reservation.code, confirmationToken, cancellationToken };
  }, { aggregateType: "RestaurantReservation" });
}

export async function transitionReservation(companyId: string, locationId: string, id: string, nextStatus: RestaurantReservationStatus, userId?: string | null) {
  const current = await byId(companyId, locationId, id);
  if (!transitions[current.status]?.includes(nextStatus)) throw new RestaurantBookingError(`Transizione ${current.status} → ${nextStatus} non consentita.`);
  const promotion = current.status === "WAITLIST" && ["PENDING", "CONFIRMED"].includes(nextStatus)
    ? await checkAvailability(companyId, locationId, { startTime: current.startTime, partySize: current.partySize, durationMinutes: current.durationMinutes, tableIds: current.tables.map(table => table.tableId), excludeReservationId: id, ignoreAdvance: true })
    : null;
  if (promotion && !promotion.available) throw new RestaurantBookingError("Nessuna disponibilità per promuovere la waitlist.");
  await prisma.$transaction(async (tx) => {
    if (promotion) { await lockRestaurantResources(tx, companyId, promotion.tableIds.map(tableId => "table:" + tableId)); const conflict = await tx.restaurantReservationTable.findFirst({ where: { companyId, tableId: { in: promotion.tableIds }, reservationId: { not: id }, reservation: { locationId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: promotion.endTime }, endTime: { gt: promotion.startTime } } } }); if (conflict) throw new RestaurantBookingError("La disponibilità per la waitlist è stata occupata."); }
    const updated = await tx.restaurantReservation.updateMany({
      where: { id, companyId, locationId, status: current.status, deletedAt: null },
      data: { status: nextStatus, updatedById: userId, cancelledAt: nextStatus === "CANCELLED" ? new Date() : undefined },
    });
    if (!updated.count) throw new RestaurantBookingError("La prenotazione è stata modificata da un altro operatore.");
    if (promotion) { await tx.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: id } }); await tx.restaurantReservationTable.createMany({ data: promotion.tableIds.map(tableId => ({ companyId, reservationId: id, tableId })) }); }
    if (nextStatus === "SEATED" && current.tables.length) {
      await tx.restaurantTable.updateMany({ where: { companyId, locationId, id: { in: current.tables.map((table) => table.tableId) } }, data: { status: "OCCUPIED" } });
    }
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(nextStatus) && current.tables.length) {
      await tx.restaurantTable.updateMany({ where: { companyId, locationId, id: { in: current.tables.map((table) => table.tableId) }, status: "OCCUPIED" }, data: { status: "AVAILABLE" } });
    }
    await event(tx, companyId, id, eventNames[nextStatus] ?? "RestaurantReservationStatusChanged", { from: current.status, to: nextStatus, userId: userId ?? null });
  });
  return { id, status: nextStatus };
}

export async function confirmReservation(companyId: string, locationId: string, id: string) {
  return transitionReservation(companyId, locationId, id, "CONFIRMED");
}

export async function cancelReservation(companyId: string, locationId: string, id: string) {
  return transitionReservation(companyId, locationId, id, "CANCELLED");
}

export async function updateReservation(companyId: string, locationId: string, id: string, input: StaffReservationUpdate, userId?: string | null) {
  const current = await byId(companyId, locationId, id);
  if (terminal.has(current.status)) throw new RestaurantBookingError("Prenotazione non modificabile.");
  if (!input.guestName.trim()) throw new RestaurantBookingError("Il nome del cliente è obbligatorio.");
  const tableId = current.tables[0]?.tableId;
  const availability = await checkAvailability(companyId, locationId, { ...input, tableId, excludeReservationId: id });
  if (!availability.available) throw new RestaurantBookingError("Tavolo non disponibile.");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.restaurantReservation.updateMany({
      where: { id, companyId, locationId, deletedAt: null, status: current.status },
      data: { guestName: input.guestName.trim(), phone: input.phone?.trim() || null, email: input.email?.trim().toLowerCase() || null, notes: input.notes?.trim() || null, internalNotes: input.internalNotes?.trim() || null, partySize: input.partySize, reservationDate: availability.startTime, startTime: availability.startTime, endTime: availability.endTime, durationMinutes: availability.durationMinutes, updatedById: userId },
    });
    if (!updated.count) throw new RestaurantBookingError("La prenotazione è stata modificata da un altro operatore.");
    await event(tx, companyId, id, "RestaurantReservationUpdated", { userId: userId ?? null });
  });
  return { id };
}

export async function assignTable(companyId: string, locationId: string, id: string, tableId: string, userId?: string | null) {
  const reservation = await byId(companyId, locationId, id);
  if (terminal.has(reservation.status)) throw new RestaurantBookingError("Prenotazione non modificabile.");
  const availability = await checkAvailability(companyId, locationId, { startTime: reservation.startTime, partySize: reservation.partySize, durationMinutes: reservation.durationMinutes, tableId, excludeReservationId: id });
  if (!availability.available || availability.tableId !== tableId) throw new RestaurantBookingError("Tavolo non disponibile o capienza insufficiente.");
  await prisma.$transaction(async (tx) => {
    await lockRestaurantResources(tx, companyId, ["table:" + tableId]);
    const table = await tx.restaurantTable.findFirst({ where: { id: tableId, companyId, locationId, active: true, deletedAt: null, status: { notIn: ["OUT_OF_SERVICE", "OCCUPIED"] } }, select: { id: true } });
    if (!table) throw new RestaurantBookingError("Tavolo non appartenente alla sede corrente.");
    const conflict = await tx.restaurantReservationTable.findFirst({ where: { companyId, tableId, reservationId: { not: id }, reservation: { locationId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: availability.endTime }, endTime: { gt: availability.startTime } } }, select: { tableId: true } });
    if (conflict) throw new RestaurantBookingError("Sovrapposizione con una prenotazione esistente.");
    await tx.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: id } });
    await tx.restaurantReservationTable.create({ data: { companyId, reservationId: id, tableId } });
    await tx.restaurantReservation.update({ where: { id }, data: { updatedById: userId } });
    await event(tx, companyId, id, "RestaurantReservationTableAssigned", { tableId, userId: userId ?? null });
  });
  return { id, tableId };
}

export async function assignTables(companyId:string,locationId:string,id:string,tableIds:string[],userId?:string|null){
  const reservation=await byId(companyId,locationId,id);if(terminal.has(reservation.status))throw new RestaurantBookingError("Prenotazione non modificabile.");
  const availability=await checkAvailability(companyId,locationId,{startTime:reservation.startTime,partySize:reservation.partySize,durationMinutes:reservation.durationMinutes,tableIds,excludeReservationId:id,ignoreAdvance:true});
  if(!availability.available||availability.tableIds.length!==new Set(tableIds).size)throw new RestaurantBookingError("Combinazione non disponibile o capienza insufficiente.");
  await prisma.$transaction(async tx=>{await lockRestaurantResources(tx,companyId,availability.tableIds.map(tableId=>"table:"+tableId));const conflict=await tx.restaurantReservationTable.findFirst({where:{companyId,tableId:{in:availability.tableIds},reservationId:{not:id},reservation:{locationId,deletedAt:null,status:{in:["PENDING","CONFIRMED","SEATED"]},startTime:{lt:availability.endTime},endTime:{gt:availability.startTime}}}});if(conflict)throw new RestaurantBookingError("Sovrapposizione con una prenotazione esistente.");await tx.restaurantReservationTable.deleteMany({where:{companyId,reservationId:id}});await tx.restaurantReservationTable.createMany({data:availability.tableIds.map(tableId=>({companyId,reservationId:id,tableId}))});await tx.restaurantReservation.update({where:{id},data:{updatedById:userId}});await event(tx,companyId,id,"RestaurantReservationTablesAssigned",{tableIds:availability.tableIds,userId:userId??null});});return{id,tableIds:availability.tableIds};
}

export async function unassignTable(companyId: string, locationId: string, id: string, userId?: string | null) {
  const reservation = await byId(companyId, locationId, id);
  if (terminal.has(reservation.status)) throw new RestaurantBookingError("Prenotazione non modificabile.");
  await prisma.$transaction(async (tx) => {
    await tx.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: id, reservation: { locationId } } });
    await tx.restaurantReservation.update({ where: { id }, data: { updatedById: userId } });
    await event(tx, companyId, id, "RestaurantReservationTableRemoved", { userId: userId ?? null });
  });
  return { id };
}

export { RestaurantAvailabilityError };

export async function shouldSuggestNoShow(companyId:string,locationId:string,id:string){const [reservation,settings]=await Promise.all([prisma.restaurantReservation.findFirst({where:{id,companyId,locationId,status:"CONFIRMED",deletedAt:null},select:{startTime:true}}),getBookingSettings(companyId,locationId)]);return Boolean(reservation&&Date.now()>=reservation.startTime.getTime()+settings.noShowThresholdMinutes*60000)}
