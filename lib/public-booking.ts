import "server-only";

import { createReservation } from "@/lib/restaurant-booking";
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
});

export type PublicBookingInput = Omit<z.input<typeof publicBookingSchema>, "privacyConsent"> & { privacyConsent: boolean };

type RateEntry = { count: number; resetAt: number };

export class PublicBookingRateLimiter {
  private readonly entries = new Map<string, RateEntry>();

  constructor(private readonly limit = 5, private readonly windowMs = 10 * 60_000) {}

  consume(key: string, now = Date.now()) {
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
      restaurantBookingSettings: { select: { confirmationMessage: true } },
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

export async function submitPublicBooking(slug: string, rateKey: string, input: PublicBookingInput, limiter = rateLimiter) {
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
  if (replay.success) return {
    reservationId: replay.data.reservationId,
    code: replay.data.code,
    startTime: parsed.data.startTime,
    partySize: parsed.data.partySize,
    locationName: location.name,
    confirmationMessage: location.restaurantBookingSettings?.confirmationMessage ?? "La prenotazione è stata registrata. Attendi la conferma dello staff.",
  };
  const result = await createReservation(location.companyId, null, parsed.data.idempotencyKey, {
    locationId: location.id,
    guestName: parsed.data.guestName,
    phone: parsed.data.phone,
    email: parsed.data.email,
    notes: parsed.data.notes,
    partySize: parsed.data.partySize,
    startTime: parsed.data.startTime,
    source: "WEBSITE",
  });
  return {
    reservationId: result.reservationId,
    code: result.code,
    startTime: parsed.data.startTime,
    partySize: parsed.data.partySize,
    locationName: location.name,
    confirmationMessage: location.restaurantBookingSettings?.confirmationMessage ?? "La prenotazione è stata registrata. Attendi la conferma dello staff.",
  };
}
