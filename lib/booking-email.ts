import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { EmailMessage, EmailProvider } from "@/lib/email";
import { getEmailProvider } from "@/lib/email";
import { waitlistOffer, bookingCustomerCancellation, bookingCustomerConfirmation, bookingRestaurantCancellation, bookingRestaurantNotification, type BookingEmailDetails } from "@/lib/email-templates";
import { prisma } from "@/lib/prisma";
import { transitionReservation } from "@/lib/restaurant-booking";

type NotificationKind = "customer-confirmation" | "restaurant-confirmation" | "customer-cancellation" | "restaurant-cancellation" | "waitlist-offer";

async function claim(companyId: string, reservationId: string, kind: NotificationKind, key = reservationId) {
  try {
    await prisma.idempotencyRecord.create({
      data: { companyId, commandType: `BookingEmail:${kind}`, idempotencyKey: key, aggregateType: "RestaurantReservation", aggregateId: reservationId },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

async function finish(companyId: string, reservationId: string, kind: NotificationKind, outcome: "SUCCEEDED" | "FAILED", provider: string, error?: unknown, key = reservationId) {
  const result = { notification: kind, provider, outcome };
  await prisma.$transaction([
    prisma.idempotencyRecord.update({
      where: { companyId_commandType_idempotencyKey: { companyId, commandType: `BookingEmail:${kind}`, idempotencyKey: key } },
      data: { status: outcome, result: outcome === "SUCCEEDED" ? result : Prisma.JsonNull, error: outcome === "FAILED" ? { name: error instanceof Error ? error.name : "EmailError" } : Prisma.JsonNull, completedAt: new Date() },
    }),
    prisma.domainEvent.create({
      data: { companyId, aggregateType: "RestaurantReservation", aggregateId: reservationId, eventType: outcome === "SUCCEEDED" ? "BookingEmailDelivered" : "BookingEmailFailed", payload: result, occurredAt: new Date() },
    }),
  ]);
  console.info(JSON.stringify({ scope: "booking-email", notification: kind, provider, outcome }));
}

async function deliver(companyId: string, reservationId: string, kind: NotificationKind, message: EmailMessage, provider: EmailProvider, key = reservationId) {
  // Il controllo sta prima della claim, e non e' un dettaglio: claim() consuma
  // la chiave di idempotenza, quindi scoprire dopo che il canale non esiste
  // marcherebbe la notifica come gia' inviata per sempre. Il giorno in cui SMTP
  // viene configurato quelle prenotazioni resterebbero senza conferma.
  if (provider.name === "noop") {
    await prisma.domainEvent.create({
      data: { companyId, aggregateType: "RestaurantReservation", aggregateId: reservationId, eventType: "BookingEmailSkipped", payload: { notification: kind, provider: provider.name, outcome: "NOT_CONFIGURED" }, occurredAt: new Date() },
    });
    console.warn(JSON.stringify({ scope: "booking-email", notification: kind, provider: provider.name, outcome: "NOT_CONFIGURED" }));
    return "NOT_CONFIGURED" as const;
  }
  if (!(await claim(companyId, reservationId, kind, key))) return "DUPLICATE" as const;
  try {
    await provider.send(message);
    await finish(companyId, reservationId, kind, "SUCCEEDED", provider.name, undefined, key);
    return "SUCCEEDED" as const;
  } catch (error) {
    await finish(companyId, reservationId, kind, "FAILED", provider.name, error, key).catch(() => undefined);
    console.warn(JSON.stringify({ scope: "booking-email", notification: kind, provider: provider.name, outcome: "FAILED", error: error instanceof Error ? error.name : "EmailError" }));
    return "FAILED" as const;
  }
}

async function bookingDetails(companyId: string, locationId: string, reservationId: string) {
  const reservation = await prisma.restaurantReservation.findFirst({
    where: { id: reservationId, companyId, locationId, deletedAt: null },
    select: {
      id: true, code: true, guestName: true, email: true, phone: true, notes: true, startTime: true, partySize: true, status: true,
      location: { select: { name: true, email: true, phone: true, slug: true, restaurantBookingSettings: { select: { internalNotificationEmail: true } } } },
    },
  });
  if (!reservation?.email) return null;
  const contact = [reservation.location.email, reservation.location.phone].filter(Boolean).join(" · ") || null;
  return {
    details: { code: reservation.code, locationName: reservation.location.name, startTime: reservation.startTime, partySize: reservation.partySize, guestName: reservation.guestName, guestEmail: reservation.email, guestPhone: reservation.phone, notes: reservation.notes, status: reservation.status === "CONFIRMED" ? "CONFIRMED" : "PENDING", restaurantContact: contact } satisfies BookingEmailDetails,
    locationSlug: reservation.location.slug,
    internalEmail: reservation.location.restaurantBookingSettings?.internalNotificationEmail ?? process.env.BOOKING_NOTIFICATION_EMAIL ?? null,
  };
}

export async function sendBookingConfirmationEmails(companyId: string, locationId: string, reservationId: string, cancellationToken: string, baseUrl: string, provider: EmailProvider = getEmailProvider()) {
  const booking = await bookingDetails(companyId, locationId, reservationId);
  if (!booking) return [];
  const details = { ...booking.details, cancellationUrl: `${baseUrl.replace(/\/$/, "")}/book/${booking.locationSlug}/cancel/${encodeURIComponent(cancellationToken)}` };
  const jobs = [deliver(companyId, reservationId, "customer-confirmation", bookingCustomerConfirmation(details), provider)];
  if (booking.internalEmail) jobs.push(deliver(companyId, reservationId, "restaurant-confirmation", bookingRestaurantNotification(details, booking.internalEmail), provider));
  return Promise.all(jobs);
}

export async function sendBookingCancellationEmails(companyId: string, locationId: string, reservationId: string, provider: EmailProvider = getEmailProvider()) {
  const booking = await bookingDetails(companyId, locationId, reservationId);
  if (!booking) return [];
  const jobs = [deliver(companyId, reservationId, "customer-cancellation", bookingCustomerCancellation(booking.details), provider)];
  if (booking.internalEmail) jobs.push(deliver(companyId, reservationId, "restaurant-cancellation", bookingRestaurantCancellation(booking.details, booking.internalEmail), provider));
  return Promise.all(jobs);
}

export async function cancelBookingWithNotifications(companyId: string, locationId: string, reservationId: string, userId?: string | null, provider: EmailProvider = getEmailProvider()) {
  const result = await transitionReservation(companyId, locationId, reservationId, "CANCELLED", userId);
  try {
    await sendBookingCancellationEmails(companyId, locationId, reservationId, provider);
  } catch (error) {
    console.error(JSON.stringify({ scope: "booking-email", event: "cancellation-notification-failed", error: error instanceof Error ? error.name : "UnknownError" }));
  }
  return result;
}

/**
 * Offerta di un posto liberato a chi è in lista d'attesa.
 *
 * La chiave di idempotenza include la scadenza, perché la stessa prenotazione
 * può ricevere più offerte nel tempo: usare il solo identificativo avrebbe
 * fatto scartare come duplicata ogni offerta successiva alla prima.
 */
export async function sendWaitlistOffer(companyId: string, locationId: string, offer: { reservationId: string; offerToken: string; expiresAt: Date; minutes: number }, baseUrl: string, provider: EmailProvider = getEmailProvider()) {
  const booking = await bookingDetails(companyId, locationId, offer.reservationId);
  if (!booking) return [];
  const url = `${baseUrl.replace(/\/$/, "")}/book/${booking.locationSlug}/offer/${encodeURIComponent(offer.offerToken)}`;
  const minutesLabel = offer.minutes >= 60 ? `${Math.round(offer.minutes / 60)} ore` : `${offer.minutes} minuti`;
  return [await deliver(companyId, offer.reservationId, "waitlist-offer", waitlistOffer(booking.details, url, minutesLabel), provider, `${offer.reservationId}:${offer.expiresAt.getTime()}`)];
}
