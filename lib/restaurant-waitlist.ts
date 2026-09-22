import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getBookingSettings, isSeatable } from "@/lib/restaurant-availability";
import { lockRestaurantResources } from "@/lib/restaurant-locking";
import { decideOffer, fitsWaitlistWindow } from "@/lib/restaurant-waitlist-policy";
import { zonedParts } from "@/lib/timezone";

export class RestaurantWaitlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantWaitlistError";
  }
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");

/** L'ora come la legge chi sta nel locale. */
export function localTimeLabel(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export type WaitlistOffer = {
  reservationId: string;
  guestName: string;
  email: string | null;
  offerToken: string;
  expiresAt: Date;
  startTime: Date;
  minutes: number;
};

export type StaffCall = {
  reservationId: string;
  guestName: string;
  partySize: number;
  phone: string | null;
  startTime: Date;
  minutesToStart: number;
};

/**
 * Cerca il primo in lista compatibile con la fascia che si è liberata e gli
 * offre il posto — oppure chiede allo staff di telefonare, se manca troppo
 * poco perché un'offerta via email possa concludersi.
 *
 * L'ordine è quello di iscrizione, e basta: qualunque criterio più elaborato è
 * una scelta commerciale da prendere dopo aver visto come si comporta la coda.
 *
 * Gira dentro la transazione che ha liberato il posto, così una cancellazione
 * e l'offerta che ne consegue sono un'operazione sola: non esiste un istante
 * in cui il tavolo è libero e la lista non lo sa.
 */
export async function offerFreedSlot(
  tx: Prisma.TransactionClient,
  companyId: string,
  locationId: string,
  freed: { startTime: Date; endTime: Date; partySize: number },
  now = new Date(),
): Promise<{ offer?: WaitlistOffer; call?: StaffCall }> {
  const candidates = await tx.restaurantReservation.findMany({
    where: {
      companyId,
      locationId,
      deletedAt: null,
      status: "WAITLIST",
      // Chi ha già un'offerta in corso non viene disturbato di nuovo.
      OR: [{ offerExpiresAt: null }, { offerExpiresAt: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, guestName: true, email: true, phone: true, partySize: true, startTime: true, waitlistFromTime: true, waitlistToTime: true },
  });
  const eligible = candidates.filter((entry) => fitsWaitlistWindow(entry, freed.startTime));
  if (!eligible.length) return {};

  for (const entry of eligible) {
    // Il posto liberato deve bastare per questo gruppo: liberare un tavolo da
    // due non serve a chi è in lista in otto.
    const seatable = await isSeatable(tx as never, companyId, locationId, {
      start: freed.startTime,
      end: freed.endTime,
      partySize: entry.partySize,
      excludeReservationId: entry.id,
    });
    if (!seatable.seatable) continue;

    const decision = decideOffer(freed.startTime, now);
    if (decision.kind === "TOO_LATE") return {};
    if (decision.kind === "CALL_STAFF") {
      await tx.restaurantReservation.update({
        where: { id: entry.id },
        data: { staffCallRequestedAt: now, staffCallResolvedAt: null },
      });
      return {
        call: { reservationId: entry.id, guestName: entry.guestName, partySize: entry.partySize, phone: entry.phone, startTime: freed.startTime, minutesToStart: decision.minutesToStart },
      };
    }
    const offerToken = token();
    await tx.restaurantReservation.update({
      where: { id: entry.id },
      data: { offerTokenHash: hash(offerToken), offerExpiresAt: decision.expiresAt, startTime: freed.startTime },
    });
    return {
      offer: { reservationId: entry.id, guestName: entry.guestName, email: entry.email, offerToken, expiresAt: decision.expiresAt, startTime: freed.startTime, minutes: decision.minutes },
    };
  }
  return {};
}

/**
 * Il cliente accetta l'offerta.
 *
 * L'offerta scaduta non si accetta: il posto è già stato proposto a chi viene
 * dopo, e confermarlo qui significherebbe promettere due volte lo stesso
 * tavolo.
 */
export async function acceptWaitlistOffer(companyId: string, locationId: string, offerToken: string) {
  const tokenHash = hash(offerToken);
  return prisma.$transaction(async (tx) => {
    await lockRestaurantResources(tx, companyId, ["booking:" + locationId]);
    const reservation = await tx.restaurantReservation.findFirst({
      where: { companyId, locationId, offerTokenHash: tokenHash, deletedAt: null },
      select: { id: true, code: true, status: true, partySize: true, startTime: true, endTime: true, durationMinutes: true, offerExpiresAt: true },
    });
    if (!reservation) throw new RestaurantWaitlistError("Offerta non trovata.");
    if (reservation.status !== "WAITLIST") throw new RestaurantWaitlistError("L'offerta è già stata gestita.");
    if (!reservation.offerExpiresAt || reservation.offerExpiresAt < new Date())
      throw new RestaurantWaitlistError("L'offerta è scaduta: il posto è stato proposto a chi era in lista dopo di te.");
    const end = reservation.endTime ?? new Date(reservation.startTime.getTime() + reservation.durationMinutes * 60000);
    const seatable = await isSeatable(tx as never, companyId, locationId, { start: reservation.startTime, end, partySize: reservation.partySize, excludeReservationId: reservation.id });
    if (!seatable.seatable) throw new RestaurantWaitlistError("Il posto non è più disponibile.");
    const updated = await tx.restaurantReservation.updateMany({
      where: { id: reservation.id, status: "WAITLIST" },
      data: { status: "CONFIRMED", offerTokenHash: null, offerExpiresAt: null },
    });
    if (!updated.count) throw new RestaurantWaitlistError("L'offerta è già stata gestita.");
    await tx.domainEvent.create({
      data: { companyId, aggregateType: "RestaurantReservation", aggregateId: reservation.id, eventType: "RestaurantWaitlistOfferAccepted", payload: { startTime: reservation.startTime.toISOString() }, occurredAt: new Date() },
    });
    return { id: reservation.id, code: reservation.code, startTime: reservation.startTime };
  });
}

/** Le chiamate che lo staff deve ancora fare. Restano finché qualcuno non le gestisce. */
export async function pendingStaffCalls(companyId: string, locationId: string) {
  const [rows, settings] = await Promise.all([
    prisma.restaurantReservation.findMany({
      where: { companyId, locationId, deletedAt: null, status: "WAITLIST", staffCallRequestedAt: { not: null }, staffCallResolvedAt: null },
      orderBy: { staffCallRequestedAt: "asc" },
      select: { id: true, guestName: true, partySize: true, phone: true, startTime: true, staffCallRequestedAt: true },
    }),
    getBookingSettings(companyId, locationId),
  ]);
  return rows.map((row) => ({
    id: row.id,
    guestName: row.guestName,
    partySize: row.partySize,
    phone: row.phone,
    timeLabel: localTimeLabel(row.startTime, settings.timeZone),
    minutesToStart: Math.max(0, Math.floor((row.startTime.getTime() - Date.now()) / 60000)),
  }));
}

/** Lo staff dichiara di aver gestito la chiamata. */
export async function resolveStaffCall(companyId: string, locationId: string, id: string, userId?: string | null) {
  const updated = await prisma.restaurantReservation.updateMany({
    where: { id, companyId, locationId, staffCallResolvedAt: null },
    data: { staffCallResolvedAt: new Date(), updatedById: userId },
  });
  if (!updated.count) throw new RestaurantWaitlistError("Chiamata non trovata o già gestita.");
  return { id };
}

export type WaitlistJoinInput = {
  guestName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  partySize: number;
  startTime: Date;
  /** Tolleranza dichiarata dal cliente attorno all'orario desiderato. */
  toleranceMinutes?: number;
};

/**
 * Ingresso in lista d'attesa dal canale pubblico.
 *
 * Non rivendica tavoli e non verifica la disponibilità: ci si mette in lista
 * proprio perché non ce n'è. La tolleranza dichiarata dal cliente definisce
 * quali liberazioni lo riguardano.
 */
export async function joinWaitlist(companyId: string, locationId: string, input: WaitlistJoinInput) {
  if (!input.guestName.trim()) throw new RestaurantWaitlistError("Il nome è obbligatorio.");
  if (!Number.isInteger(input.partySize) || input.partySize < 1)
    throw new RestaurantWaitlistError("Numero persone non valido.");
  const tolerance = Math.min(240, Math.max(0, input.toleranceMinutes ?? 60));
  const settings = await getBookingSettings(companyId, locationId);
  const duration = settings.defaultDurationMinutes;
  const reservation = await prisma.restaurantReservation.create({
    data: {
      companyId, locationId,
      code: `WAIT-${randomBytes(5).toString("hex").toUpperCase()}`,
      guestName: input.guestName.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      notes: input.notes?.trim() || null,
      partySize: input.partySize,
      reservationDate: input.startTime,
      startTime: input.startTime,
      endTime: new Date(input.startTime.getTime() + duration * 60000),
      durationMinutes: duration,
      status: "WAITLIST",
      source: "WEBSITE",
      waitlistFromTime: new Date(input.startTime.getTime() - tolerance * 60000),
      waitlistToTime: new Date(input.startTime.getTime() + tolerance * 60000),
    },
    select: { id: true, code: true },
  });
  await prisma.domainEvent.create({
    data: { companyId, aggregateType: "RestaurantReservation", aggregateId: reservation.id, eventType: "RestaurantWaitlistJoined", payload: { partySize: input.partySize, toleranceMinutes: tolerance }, occurredAt: new Date() },
  });
  return reservation;
}
