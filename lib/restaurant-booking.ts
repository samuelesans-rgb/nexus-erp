import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Prisma, RestaurantReservationSource, RestaurantReservationStatus } from "@/generated/prisma/client";
import { executeIdempotent } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { lockRestaurantResources } from "@/lib/restaurant-locking";
import { offerFreedSlot } from "@/lib/restaurant-waitlist";
import { checkAvailability, getBookingSettings, isSeatable, RestaurantAvailabilityError } from "@/lib/restaurant-availability";
import { addZonedDays, startOfZonedDay } from "@/lib/timezone";
import {
  deriveTableStatusFromRow,
  tableHasOpenOrderWhere,
  tableStatusInclude,
} from "@/lib/restaurant-table-status";

export class RestaurantBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantBookingError";
  }
}

const terminal = new Set<RestaurantReservationStatus>(["CANCELLED", "COMPLETED", "NO_SHOW"]);
/** Uscire da una prenotazione che teneva un posto lo rende di nuovo disponibile. */
const freesASlot = (from: RestaurantReservationStatus, to: RestaurantReservationStatus) =>
  ["PENDING", "CONFIRMED", "SEATED"].includes(from) && ["CANCELLED", "NO_SHOW"].includes(to);
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
/** Token di cancellazione da generare prima di creare la prenotazione. */
export const newCancellationToken = token;

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
  /**
   * Token di cancellazione in chiaro, generato dal chiamante.
   *
   * Non viene generato qui e soprattutto non viene restituito: il valore di
   * ritorno di executeIdempotent finisce in IdempotencyRecord.result, e un
   * token in chiaro li' dentro annullerebbe l'hashing che lo protegge nella
   * prenotazione. Chi chiama lo ha gia' in mano e lo usa per l'email; un
   * replay, che quel token non lo ha mai avuto, non puo' riottenerlo.
   */
  cancellationToken: string;
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
  const requested = new Date(filters.date);
  if (Number.isNaN(requested.getTime())) throw new RestaurantBookingError("Data non valida.");
  // Il giorno dello staff e' quello del locale: una prenotazione all'una di
  // notte appartiene alla serata precedente, non al giorno UTC successivo.
  const { timeZone } = await getBookingSettings(companyId, locationId);
  const start = startOfZonedDay(requested, timeZone);
  const end = addZonedDays(start, 1, timeZone);
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
  const tables = await prisma.restaurantTable.findMany({
    where: { companyId, locationId, active: true, deletedAt: null, physicalStatus: { not: "OUT_OF_SERVICE" } },
    select: { id: true, code: true, name: true, seats: true, maxSeats: true, physicalStatus: true, ...tableStatusInclude },
    orderBy: [{ code: "asc" }],
  });
  const now = new Date();
  return tables.map(({ orderTables, reservations, physicalStatus, ...table }) => ({
    ...table,
    status: deriveTableStatusFromRow({ physicalStatus, orderTables, reservations }, now),
  }));
}

export async function createReservation(companyId: string, userId: string | null, idempotencyKey: string, input: ReservationInput) {
  if (!input.guestName.trim()) throw new RestaurantBookingError("Il nome del cliente è obbligatorio.");
  const availability = await checkAvailability(companyId, input.locationId, input);
  if (!availability.available) throw new RestaurantBookingError("Nessun tavolo disponibile per l'orario selezionato.");
  return executeIdempotent(companyId, "RestaurantBookingCreate", idempotencyKey, async (tx) => {
    // Due modalita', esplicite. Chi nomina dei tavoli li vuole davvero, e
    // vanno riservati come prima; il canale pubblico non ne nomina, e allora
    // si verifica soltanto che la sala resti sistemabile — chi va dove lo
    // decide il cameriere all'arrivo.
    const claimed = availability.tableIds;
    if (claimed.length) {
      await lockRestaurantResources(tx, companyId, claimed.map((id) => "table:" + id));
      const conflict = await tx.restaurantReservationTable.findFirst({ where: { companyId, tableId: { in: claimed }, reservation: { locationId: input.locationId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: availability.endTime }, endTime: { gt: availability.startTime } } }, select: { tableId: true } });
      if (conflict) throw new RestaurantBookingError("Il tavolo non è più disponibile.");
    } else {
      // Nessun tavolo da bloccare: si serializza sulla sede, altrimenti due
      // prenotazioni simultanee supererebbero entrambe il controllo di
      // sistemabilita' e insieme sforerebbero la sala.
      await lockRestaurantResources(tx, companyId, ["booking:" + input.locationId]);
      const seatable = await isSeatable(tx as never, companyId, input.locationId, { start: availability.startTime, end: availability.endTime, partySize: input.partySize });
      if (!seatable.seatable) throw new RestaurantBookingError("Nessun tavolo disponibile per l'orario selezionato.");
    }
    if (input.partnerId && !(await tx.partner.findFirst({ where: { id: input.partnerId, companyId, active: true, deletedAt: null }, select: { id: true } }))) throw new RestaurantBookingError("Cliente non valido.");
    const settings = await getBookingSettings(companyId, input.locationId);
    const status = settings.confirmationPolicy === "AUTO_CONFIRM" ? "CONFIRMED" : "PENDING";
    const reservation = await tx.restaurantReservation.create({ data: { companyId, locationId: input.locationId, code: `RES-${randomBytes(6).toString("hex").toUpperCase()}`, partnerId: input.partnerId ?? null, guestName: input.guestName.trim(), phone: input.phone?.trim() || null, email: input.email?.trim().toLowerCase() || null, reservationDate: availability.startTime, startTime: availability.startTime, endTime: availability.endTime, durationMinutes: availability.durationMinutes, partySize: input.partySize, serviceWindowId: availability.serviceWindowId, source: input.source ?? "WEBSITE", status, notes: input.notes?.trim() || null, cancellationTokenHash: hash(input.cancellationToken), createdById: userId, updatedById: userId, tables: { create: claimed.map((tableId) => ({ tableId })) } }, select: { id: true, code: true } });
    await event(tx, companyId, reservation.id, "RestaurantReservationCreated", { source: input.source ?? "WEBSITE", status, tableIds: claimed, serviceWindowId: availability.serviceWindowId });
    return { aggregateId: reservation.id, reservationId: reservation.id, code: reservation.code };
  }, { aggregateType: "RestaurantReservation" });
}

// Staff counterpart of createReservation: the operator picks the tables and may
// override availability, so this path deliberately skips checkAvailability. It
// was a separate service (lib/restaurant-reservations.ts) that duplicated the
// reservation domain; consolidated here so both paths share locking, the code
// generator and the error type.
export type StaffReservationInput = {
  partnerId?: string | null;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  partySize: number;
  startTime: Date;
  endTime?: Date | null;
  source: RestaurantReservationSource;
  status?: RestaurantReservationStatus;
  tableIds?: string[];
  adminOverride?: boolean;
};

export async function createStaffReservation(
  companyId: string,
  locationId: string,
  userId: string,
  input: StaffReservationInput,
) {
  if (!input.guestName.trim() || input.partySize < 1)
    throw new RestaurantBookingError("Ospite e numero coperti sono obbligatori.");
  const tableIds = [...new Set(input.tableIds ?? [])];
  const endTime =
    input.endTime ?? new Date(input.startTime.getTime() + 2 * 60 * 60 * 1000);
  if (endTime <= input.startTime)
    throw new RestaurantBookingError("La fine deve seguire l'inizio.");
  return prisma.$transaction(async (tx) => {
    // The legacy service held no lock: two operators could book the same table
    // concurrently and both pass the overlap check.
    await lockRestaurantResources(
      tx,
      companyId,
      tableIds.map((id) => "table:" + id),
    );
    const tables = tableIds.length
      ? await tx.restaurantTable.findMany({
          where: {
            companyId,
            locationId,
            id: { in: tableIds },
            active: true,
            deletedAt: null,
          },
          select: { id: true, seats: true, maxSeats: true, physicalStatus: true },
        })
      : [];
    if (
      tables.length !== tableIds.length ||
      tables.some((table) => table.physicalStatus === "OUT_OF_SERVICE")
    )
      throw new RestaurantBookingError("Uno o più tavoli non sono assegnabili.");
    if (
      tables.length &&
      tables.reduce((sum, table) => sum + (table.maxSeats ?? table.seats), 0) <
        input.partySize
    )
      throw new RestaurantBookingError("Capienza tavoli insufficiente.");
    if (input.partnerId &&
      !(await tx.partner.findFirst({
        where: { id: input.partnerId, companyId, active: true, deletedAt: null },
        select: { id: true },
      })))
      throw new RestaurantBookingError("Cliente non valido.");
    if (!input.adminOverride && tables.length) {
      const conflict = await tx.restaurantReservationTable.findFirst({
        where: {
          companyId,
          tableId: { in: tableIds },
          reservation: {
            locationId,
            deletedAt: null,
            status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
            startTime: { lt: endTime },
            endTime: { gt: input.startTime },
          },
        },
        select: { tableId: true },
      });
      if (conflict)
        throw new RestaurantBookingError(
          "Sovrapposizione con una prenotazione esistente.",
        );
    }
    const reservation = await tx.restaurantReservation.create({
      data: {
        companyId,
        locationId,
        code: `RES-${randomBytes(6).toString("hex").toUpperCase()}`,
        partnerId: input.partnerId || null,
        guestName: input.guestName.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        notes: input.notes?.trim() || null,
        reservationDate: input.startTime,
        startTime: input.startTime,
        endTime,
        durationMinutes: Math.max(
          1,
          Math.round((endTime.getTime() - input.startTime.getTime()) / 60000),
        ),
        partySize: input.partySize,
        source: input.source,
        status: input.status ?? "PENDING",
        createdById: userId,
        updatedById: userId,
        tables: { create: tables.map((table) => ({ tableId: table.id })) },
      },
      select: { id: true, code: true },
    });
    await event(tx, companyId, reservation.id, "RestaurantReservationCreated", {
      code: reservation.code,
      source: input.source,
      tableIds,
      adminOverride: Boolean(input.adminOverride),
    });
    return reservation;
  });
}

export async function transitionReservation(companyId: string, locationId: string, id: string, nextStatus: RestaurantReservationStatus, userId?: string | null) {
  const current = await byId(companyId, locationId, id);
  if (!transitions[current.status]?.includes(nextStatus)) throw new RestaurantBookingError(`Transizione ${current.status} → ${nextStatus} non consentita.`);
  const promotion = current.status === "WAITLIST" && ["PENDING", "CONFIRMED"].includes(nextStatus)
    ? await checkAvailability(companyId, locationId, { startTime: current.startTime, partySize: current.partySize, durationMinutes: current.durationMinutes, tableIds: current.tables.map(table => table.tableId), excludeReservationId: id, ignoreAdvance: true })
    : null;
  if (promotion && !promotion.available) throw new RestaurantBookingError("Nessuna disponibilità per promuovere la waitlist.");
  let released: Awaited<ReturnType<typeof offerFreedSlot>> = {};
  await prisma.$transaction(async (tx) => {
    if (promotion) {
      if (promotion.tableIds.length) {
        await lockRestaurantResources(tx, companyId, promotion.tableIds.map(tableId => "table:" + tableId));
        const conflict = await tx.restaurantReservationTable.findFirst({ where: { companyId, tableId: { in: promotion.tableIds }, reservationId: { not: id }, reservation: { locationId, deletedAt: null, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: promotion.endTime }, endTime: { gt: promotion.startTime } } } });
        if (conflict) throw new RestaurantBookingError("La disponibilità per la waitlist è stata occupata.");
      } else {
        // Promozione senza tavoli rivendicati: non c'e' un tavolo su cui
        // serializzare, quindi si serializza sulla sede e si riverifica la
        // sistemabilita' sotto lock. Senza, due promozioni concorrenti
        // passerebbero entrambe il controllo fatto fuori transazione.
        await lockRestaurantResources(tx, companyId, ["booking:" + locationId]);
        const seatable = await isSeatable(tx as never, companyId, locationId, { start: promotion.startTime, end: promotion.endTime, partySize: current.partySize, excludeReservationId: id });
        if (!seatable.seatable) throw new RestaurantBookingError("La disponibilità per la waitlist è stata occupata.");
      }
    }
    const updated = await tx.restaurantReservation.updateMany({
      where: { id, companyId, locationId, status: current.status, deletedAt: null },
      data: { status: nextStatus, updatedById: userId, cancelledAt: nextStatus === "CANCELLED" ? new Date() : undefined },
    });
    if (!updated.count) throw new RestaurantBookingError("La prenotazione è stata modificata da un altro operatore.");
    if (promotion) { await tx.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: id } }); await tx.restaurantReservationTable.createMany({ data: promotion.tableIds.map(tableId => ({ companyId, reservationId: id, tableId })) }); }
    // Niente da scrivere sui tavoli: sedere o liberare una prenotazione cambia
    // lo stato derivato da se', perche' la derivazione guarda le prenotazioni
    // che tengono il tavolo. Queste due updateMany scrivevano una colonna che
    // nessuno leggeva piu'.
    await event(tx, companyId, id, eventNames[nextStatus] ?? "RestaurantReservationStatusChanged", { from: current.status, to: nextStatus, userId: userId ?? null });
    // Il posto si è liberato: la lista d'attesa lo viene a sapere qui dentro,
    // nella stessa transazione. Non esiste un istante in cui il tavolo è
    // libero e la lista non lo sa.
    if (freesASlot(current.status, nextStatus))
      released = await offerFreedSlot(tx, companyId, locationId, {
        startTime: current.startTime,
        endTime: current.endTime ?? new Date(current.startTime.getTime() + current.durationMinutes * 60000),
        partySize: current.partySize,
      });
  });
  return { id, status: nextStatus, waitlist: released };
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
    // Occupancy comes from the order relation, not from a stored flag. Behaviour
    // is preserved: a table busy right now still refuses assignment. Whether
    // that should hold for a booking in the future is the same question
    // checkAvailability answers, and is addressed with it.
    const table = await tx.restaurantTable.findFirst({ where: { id: tableId, companyId, locationId, active: true, deletedAt: null, physicalStatus: { not: "OUT_OF_SERVICE" }, NOT: tableHasOpenOrderWhere() }, select: { id: true } });
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
