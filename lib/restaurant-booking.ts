import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { RestaurantReservationSource, RestaurantReservationStatus } from "@/generated/prisma/client";
import { executeIdempotent } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { checkAvailability, RestaurantAvailabilityError } from "@/lib/restaurant-availability";

export class RestaurantBookingError extends Error { constructor(message: string) { super(message); this.name = "RestaurantBookingError"; } }
const terminal = new Set<RestaurantReservationStatus>(["CANCELLED", "COMPLETED", "NO_SHOW"]);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export type ReservationInput = { locationId: string; guestName: string; phone?: string | null; email?: string | null; notes?: string | null; partySize: number; startTime: Date; durationMinutes?: number; tableId?: string | null; partnerId?: string | null; source?: RestaurantReservationSource };

export async function createReservation(companyId: string, userId: string | null, idempotencyKey: string, input: ReservationInput) {
  if (!input.guestName.trim()) throw new RestaurantBookingError("Il nome del cliente è obbligatorio.");
  const availability = await checkAvailability(companyId, input.locationId, input);
  if (!availability.available || !availability.tableId) throw new RestaurantBookingError("Nessun tavolo disponibile per l'orario selezionato.");
  return executeIdempotent(companyId, "RestaurantBookingCreate", idempotencyKey, async (tx) => {
    const conflict = await tx.restaurantReservationTable.findFirst({ where: { companyId, tableId: availability.tableId!, reservation: { locationId: input.locationId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: availability.endTime }, endTime: { gt: availability.startTime } } }, select: { tableId: true } });
    if (conflict) throw new RestaurantBookingError("Il tavolo non è più disponibile.");
    if (input.partnerId && !(await tx.partner.findFirst({ where: { id: input.partnerId, companyId, active: true, deletedAt: null }, select: { id: true } }))) throw new RestaurantBookingError("Cliente non valido.");
    const confirmationToken = token(); const cancellationToken = token();
    const reservation = await tx.restaurantReservation.create({ data: { companyId, locationId: input.locationId, code: `RES-${randomBytes(6).toString("hex").toUpperCase()}`, partnerId: input.partnerId ?? null, guestName: input.guestName.trim(), phone: input.phone?.trim() || null, email: input.email?.trim().toLowerCase() || null, reservationDate: availability.startTime, startTime: availability.startTime, endTime: availability.endTime, durationMinutes: availability.durationMinutes, partySize: input.partySize, source: input.source ?? "WEBSITE", status: "PENDING", notes: input.notes?.trim() || null, confirmationTokenHash: hash(confirmationToken), cancellationTokenHash: hash(cancellationToken), createdById: userId, updatedById: userId, tables: { create: { tableId: availability.tableId! } } }, select: { id: true, code: true } });
    await tx.domainEvent.create({ data: { companyId, eventType: "RestaurantReservationCreated", aggregateType: "RestaurantReservation", aggregateId: reservation.id, payload: { source: input.source ?? "WEBSITE" }, occurredAt: new Date() } });
    return { aggregateId: reservation.id, reservationId: reservation.id, code: reservation.code, confirmationToken, cancellationToken };
  }, { aggregateType: "RestaurantReservation" });
}

async function byId(companyId: string, locationId: string, id: string) { const reservation = await prisma.restaurantReservation.findFirst({ where: { id, companyId, locationId, deletedAt: null }, include: { tables: true } }); if (!reservation) throw new RestaurantBookingError("Prenotazione non trovata."); return reservation; }
export async function confirmReservation(companyId: string, locationId: string, id: string) { const reservation = await byId(companyId, locationId, id); if (terminal.has(reservation.status)) throw new RestaurantBookingError("Prenotazione non modificabile."); await prisma.restaurantReservation.update({ where: { id }, data: { status: "CONFIRMED" } }); return { id }; }
export async function cancelReservation(companyId: string, locationId: string, id: string) { const reservation = await byId(companyId, locationId, id); if (terminal.has(reservation.status)) throw new RestaurantBookingError("Prenotazione non modificabile."); await prisma.restaurantReservation.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } }); return { id }; }
export async function updateReservation(companyId: string, locationId: string, id: string, input: Pick<ReservationInput, "guestName" | "phone" | "email" | "notes" | "partySize" | "startTime" | "durationMinutes">) { const current = await byId(companyId, locationId, id); if (terminal.has(current.status)) throw new RestaurantBookingError("Prenotazione non modificabile."); const tableId = current.tables[0]?.tableId; const availability = await checkAvailability(companyId, locationId, { ...input, tableId }); if (!availability.available) throw new RestaurantBookingError("Tavolo non disponibile."); await prisma.restaurantReservation.update({ where: { id }, data: { guestName: input.guestName.trim(), phone: input.phone?.trim() || null, email: input.email?.trim().toLowerCase() || null, notes: input.notes?.trim() || null, partySize: input.partySize, reservationDate: availability.startTime, startTime: availability.startTime, endTime: availability.endTime, durationMinutes: availability.durationMinutes } }); return { id }; }
export async function assignTable(companyId: string, locationId: string, id: string, tableId: string) { const reservation = await byId(companyId, locationId, id); if (terminal.has(reservation.status)) throw new RestaurantBookingError("Prenotazione non modificabile."); const availability = await checkAvailability(companyId, locationId, { startTime: reservation.startTime, partySize: reservation.partySize, durationMinutes: reservation.durationMinutes, tableId }); if (!availability.available) throw new RestaurantBookingError("Tavolo non disponibile."); await prisma.$transaction(async (tx) => { await tx.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: id } }); await tx.restaurantReservationTable.create({ data: { companyId, reservationId: id, tableId } }); }); return { id, tableId }; }
export { RestaurantAvailabilityError };
