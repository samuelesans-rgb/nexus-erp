import "server-only";

import { createHash } from "node:crypto";
import { sendBookingConfirmationEmails, sendBookingCancellationEmails, sendWaitlistOffer } from "@/lib/booking-email";
import type { EmailProvider } from "@/lib/email";
import { getEmailProvider } from "@/lib/email";
import { createReservation, newCancellationToken } from "@/lib/restaurant-booking";
import { checkAvailability } from "@/lib/restaurant-availability";
import { acceptWaitlistOffer, joinWaitlist } from "@/lib/restaurant-waitlist";
import { transitionReservation } from "@/lib/restaurant-booking";
import { getAvailableSlots } from "@/lib/restaurant-availability";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export class PublicBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicBookingError";
  }
}

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const publicBookingSchema = z.object({
  idempotencyKey: z.string().uuid("Richiesta di prenotazione non valida."),
  startTime: z.coerce.date({ error: "Data e ora non valide." }),
  partySize: z.coerce.number().int().min(1, "Inserisci almeno una persona.").max(50, "Numero persone troppo elevato."),
  guestName: z.string().trim().min(2, "Inserisci il nome.").max(120),
  phone: z.string().trim().min(6, "Inserisci un telefono valido.").max(40),
  email: z.string().trim().email("Inserisci un'email valida.").max(254),
  notes: z.string().trim().max(1000, "Le note sono troppo lunghe.").optional(),
  privacyConsent: z.literal(true, { error: "Il consenso privacy è obbligatorio." }),
  /** Se non c'è posto, mettimi in lista d'attesa invece di rifiutare. */
  joinWaitlistIfFull: z.coerce.boolean().optional().default(false),
  waitlistToleranceMinutes: z.coerce.number().int().min(0).max(240).optional(),
});

export type PublicBookingInput = Omit<z.input<typeof publicBookingSchema>, "privacyConsent"> & { privacyConsent: boolean };

type RateEntry = { count: number; resetAt: number };
/** Ogni quante richieste si ripulisce la mappa dalle voci scadute. */
const PRUNE_EVERY = 256;

export class PublicBookingRateLimiter {
  private readonly entries = new Map<string, RateEntry>();

  constructor(private readonly limit = 5, private readonly windowMs = 10 * 60_000) {}

  /**
   * Le voci scadute vanno tolte, non solo sovrascritte quando ricapita la
   * stessa chiave. Con chiavi sempre diverse — che e' esattamente cio' che fa
   * chi abusa — la mappa cresceva senza limite fino a far morire il processo.
   * La potatura e' ammortizzata: si paga una volta ogni PRUNE_EVERY richieste.
   */
  private sinceLastPrune = 0;

  private prune(now: number) {
    if (++this.sinceLastPrune < PRUNE_EVERY) return;
    this.sinceLastPrune = 0;
    for (const [key, entry] of this.entries)
      if (entry.resetAt <= now) this.entries.delete(key);
  }

  /** Quante voci sono in memoria adesso. Esposta per poterlo verificare. */
  get size() {
    return this.entries.size;
  }


  consume(key: string, now = Date.now()) {
    this.prune(now);
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    if (current.count >= this.limit) throw new PublicBookingError("Troppe richieste. Riprova tra qualche minuto.");
    current.count += 1;
  }
}

const rateLimiter = new PublicBookingRateLimiter();

async function resolveLocation(slug: string) {
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) return null;
  return prisma.location.findUnique({
    where: { slug: parsedSlug.data, active: true, deletedAt: null, restaurantBookingSettings: { is: { enabled: true } } },
    select: {
      id: true,
      companyId: true,
      slug: true,
      code: true,
      name: true,
      city: true,
      address: true,
      restaurantBookingSettings: { select: { confirmationMessage: true, confirmationPolicy: true, cancellationEnabled: true, cancellationDeadlineMinutes: true, customerCancellationMessage: true } },
    },
  });
}

export async function getPublicLocation(slug: string) {
  const location = await resolveLocation(slug);
  if (!location) return null;
  return { slug: location.slug, name: location.name, city: location.city, address: location.address };
}

export async function getPublicSlots(slug: string, date: Date, partySize: number) {
  const location = await resolveLocation(slug);
  if (!location) return null;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50 || Number.isNaN(date.getTime())) throw new PublicBookingError("Data o numero persone non validi.");
  return getAvailableSlots(location.companyId, location.id, { date, partySize });
}

export async function submitPublicBooking(slug: string, rateKey: string, input: PublicBookingInput, limiter = rateLimiter, emailProvider: EmailProvider = getEmailProvider(), baseUrl = process.env.AUTH_URL ?? "http://localhost:3000") {
  const parsed = publicBookingSchema.safeParse(input);
  if (!parsed.success) throw new PublicBookingError(parsed.error.issues[0]?.message ?? "Dati prenotazione non validi.");
  const location = await resolveLocation(slug);
  if (!location) throw new PublicBookingError("Sede non disponibile.");
  limiter.consume(`${location.id}:${rateKey}`);
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { companyId_commandType_idempotencyKey: { companyId: location.companyId, commandType: "RestaurantBookingCreate", idempotencyKey: parsed.data.idempotencyKey } },
    select: { status: true, result: true },
  });
  const replay = z.object({ reservationId: z.string(), code: z.string() }).safeParse(existing?.status === "SUCCEEDED" ? existing.result : null);
  // Il token esiste solo in questa richiesta: non viene persistito in chiaro,
  // quindi un replay non puo' riemetterlo. L'email era gia' partita al primo
  // tentativo, e la sua stessa claim di idempotenza la rende un duplicato.
  const cancellationToken = replay.success ? null : newCancellationToken();
  if (!replay.success && parsed.data.joinWaitlistIfFull) {
    // Se non c'è posto si entra in lista invece di trovarsi davanti a un muro.
    // L'adesione è esplicita: nessuno finisce in lista senza averlo chiesto.
    const availability = await checkAvailability(location.companyId, location.id, { startTime: parsed.data.startTime, partySize: parsed.data.partySize }).catch(() => null);
    if (!availability?.available) {
      const entry = await joinWaitlist(location.companyId, location.id, {
        guestName: parsed.data.guestName, phone: parsed.data.phone, email: parsed.data.email,
        notes: parsed.data.notes, partySize: parsed.data.partySize, startTime: parsed.data.startTime,
        toleranceMinutes: parsed.data.waitlistToleranceMinutes,
      });
      return {
        reservationId: entry.id, code: entry.code, startTime: parsed.data.startTime,
        partySize: parsed.data.partySize, locationName: location.name, status: "WAITLIST" as const,
        confirmationMessage: "Non ci sono tavoli liberi per quell'orario. Sei in lista d'attesa: se si libera un posto ti avvisiamo.",
      };
    }
  }
  const result = replay.success ? replay.data : await createReservation(location.companyId, null, parsed.data.idempotencyKey, {
      cancellationToken: cancellationToken!,
      locationId: location.id,
      guestName: parsed.data.guestName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      notes: parsed.data.notes,
      partySize: parsed.data.partySize,
      startTime: parsed.data.startTime,
      source: "WEBSITE",
    });
  if (cancellationToken) await sendBookingConfirmationEmails(location.companyId, location.id, result.reservationId, cancellationToken, baseUrl, emailProvider).catch((error) => {
    console.warn(JSON.stringify({ scope: "booking-email", notification: "confirmation", outcome: "FAILED", error: error instanceof Error ? error.name : "EmailError" }));
  });
  return {
    reservationId: result.reservationId,
    code: result.code,
    startTime: parsed.data.startTime,
    partySize: parsed.data.partySize,
    locationName: location.name,
    status: location.restaurantBookingSettings?.confirmationPolicy === "AUTO_CONFIRM" ? "CONFIRMED" : "PENDING",
    confirmationMessage: location.restaurantBookingSettings?.confirmationMessage ?? (location.restaurantBookingSettings?.confirmationPolicy === "AUTO_CONFIRM" ? "Prenotazione confermata." : "La prenotazione è stata registrata. Attendi la conferma dello staff."),
  };
}

export async function cancelPublicBooking(slug: string, cancellationToken: string, emailProvider: EmailProvider = getEmailProvider(), baseUrl = process.env.AUTH_URL ?? "http://localhost:3000") {
  const location = await resolveLocation(slug);
  if (!location) throw new PublicBookingError("Sede non disponibile.");
  const parsedToken = z.string().min(32).max(128).safeParse(cancellationToken);
  if (!parsedToken.success) throw new PublicBookingError("Link di cancellazione non valido.");
  const tokenHash = createHash("sha256").update(parsedToken.data).digest("hex");
  const reservation = await prisma.restaurantReservation.findFirst({
    where: { companyId: location.companyId, locationId: location.id, cancellationTokenHash: tokenHash, deletedAt: null },
    select: { id: true, code: true, status: true, startTime: true },
  });
  if (!reservation) throw new PublicBookingError("Prenotazione non trovata.");
  const policy = location.restaurantBookingSettings;
  if (!policy?.cancellationEnabled) throw new PublicBookingError(policy?.customerCancellationMessage ?? "La cancellazione online non è abilitata.");
  if (reservation.status !== "CANCELLED") {
    if (Date.now() > reservation.startTime.getTime() - policy.cancellationDeadlineMinutes * 60_000) throw new PublicBookingError(policy.customerCancellationMessage ?? "Il termine per la cancellazione online è scaduto. Contatta il ristorante.");
    if (!["PENDING", "CONFIRMED"].includes(reservation.status)) throw new PublicBookingError("La prenotazione non può essere annullata.");
    const outcome = await transitionReservation(location.companyId, location.id, reservation.id, "CANCELLED");
    // Il posto liberato va offerto a chi è in lista. L'invio sta fuori dalla
    // transazione, ma l'offerta è già registrata: se l'email non parte il posto
    // resta assegnato a quella persona fino alla scadenza, non si perde.
    if (outcome.waitlist?.offer)
      await sendWaitlistOffer(location.companyId, location.id, outcome.waitlist.offer, baseUrl, emailProvider).catch((error) => {
        console.warn(JSON.stringify({ scope: "waitlist-offer", outcome: "FAILED", error: error instanceof Error ? error.name : "EmailError" }));
      });
  }
  await sendBookingCancellationEmails(location.companyId, location.id, reservation.id, emailProvider).catch((error) => {
    console.warn(JSON.stringify({ scope: "booking-email", notification: "cancellation", outcome: "FAILED", error: error instanceof Error ? error.name : "EmailError" }));
  });
  return { code: reservation.code, locationName: location.name };
}

/** Il cliente accetta il posto che si è liberato. */
export async function acceptPublicWaitlistOffer(slug: string, offerToken: string) {
  const location = await resolveLocation(slug);
  if (!location) throw new PublicBookingError("Sede non disponibile.");
  const parsed = z.string().min(32).max(128).safeParse(offerToken);
  if (!parsed.success) throw new PublicBookingError("Link non valido.");
  const accepted = await acceptWaitlistOffer(location.companyId, location.id, parsed.data).catch((error) => {
    throw new PublicBookingError(error instanceof Error ? error.message : "Offerta non valida.");
  });
  return { code: accepted.code, startTime: accepted.startTime, locationName: location.name };
}
