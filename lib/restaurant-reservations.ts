import "server-only";
import { prisma } from "@/lib/prisma";
import { emitRestaurantEvent, RestaurantDomainError } from "@/lib/restaurant";
import type { RestaurantReservationSource, RestaurantReservationStatus } from "@/generated/prisma/client";

export async function createReservation(companyId: string, locationId: string, userId: string, input: { partnerId?: string|null; guestName: string; phone?: string; email?: string; startTime: Date; endTime?: Date|null; partySize: number; source: RestaurantReservationSource; status?: RestaurantReservationStatus; notes?: string; tableIds?: string[]; adminOverride?: boolean }) {
  if (!input.guestName.trim() || input.partySize < 1) throw new RestaurantDomainError("Ospite e numero coperti sono obbligatori.");
  const tables = await prisma.restaurantTable.findMany({ where: { companyId, locationId: locationId, id: { in: input.tableIds ?? [] }, active: true, deletedAt: null }, select: { id: true, seats: true, maxSeats: true, status: true } });
  if (tables.length !== (input.tableIds?.length ?? 0) || tables.some(t=>t.status === "OUT_OF_SERVICE")) throw new RestaurantDomainError("Uno o più tavoli non sono assegnabili.");
  if (tables.length && tables.reduce((s,t)=>s+(t.maxSeats ?? t.seats),0) < input.partySize) throw new RestaurantDomainError("Capienza tavoli insufficiente.");
  const end = input.endTime ?? new Date(input.startTime.getTime()+2*60*60*1000);
  if (!input.adminOverride && tables.length) {
    const candidates = await prisma.restaurantReservationTable.findMany({ where: { companyId, tableId: { in: tables.map(t=>t.id) }, reservation: { status: { notIn: ["CANCELLED","COMPLETED","NO_SHOW"] }, startTime: { lt: end } } }, select: { reservation: { select: { startTime: true, endTime: true } } } });
    if (candidates.some(({ reservation }) => (reservation.endTime ?? new Date(reservation.startTime.getTime() + 2*60*60*1000)) > input.startTime)) throw new RestaurantDomainError("Sovrapposizione con una prenotazione esistente.");
  }
  const code = `RES-${Date.now().toString(36).toUpperCase()}`;
  const row = await prisma.restaurantReservation.create({ data: { companyId, locationId: locationId, code, partnerId: input.partnerId || null, guestName: input.guestName.trim(), phone: input.phone, email: input.email, reservationDate: input.startTime, startTime: input.startTime, endTime: end, partySize: input.partySize, source: input.source, status: input.status ?? "PENDING", notes: input.notes, createdById: userId, updatedById: userId, tables: { create: tables.map(t=>({ tableId:t.id })) } }, select: { id: true } });
  await emitRestaurantEvent(companyId,"RestaurantReservationCreated","RestaurantReservation",row.id,{code}); return row;
}
export async function transitionReservation(companyId: string, locationId: string, userId: string, id: string, status: RestaurantReservationStatus) {
  const current = await prisma.restaurantReservation.findFirst({ where: { id, companyId, locationId, deletedAt: null }, include: { tables: true } });
  if (!current || ["CANCELLED","COMPLETED"].includes(current.status)) throw new RestaurantDomainError("Prenotazione non modificabile.");
  await prisma.restaurantReservation.update({ where: { id }, data: { status, updatedById:userId, cancelledAt: status === "CANCELLED" ? new Date() : undefined } });
  if (status === "SEATED") await prisma.restaurantTable.updateMany({ where:{companyId,locationId,id:{in:current.tables.map(t=>t.tableId)}},data:{status:"OCCUPIED"} });
  const events: Partial<Record<RestaurantReservationStatus,string>>={CONFIRMED:"RestaurantReservationConfirmed",CANCELLED:"RestaurantReservationCancelled",SEATED:"RestaurantGuestSeated",NO_SHOW:"RestaurantNoShowRecorded"};
  if(events[status]) await emitRestaurantEvent(companyId,events[status]!,"RestaurantReservation",id,{status}); return {id};
}
export const getReservations = (companyId:string, locationId:string) => prisma.restaurantReservation.findMany({ where:{companyId,locationId,deletedAt:null},include:{location:true,tables:{include:{table:true}}},orderBy:{startTime:"asc"} });
