import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/restaurant-availability";
import { createReservation } from "@/lib/restaurant-booking";

export class BookingWidgetError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BookingWidgetError";
  }
}

const keySchema = z.string().trim().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido.");
const domainSchema = z.string().trim().max(253).transform((value, context) => {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.hostname.toLowerCase();
  } catch {
    context.addIssue({ code: "custom", message: "Dominio non valido." });
    return z.NEVER;
  }
});

export const widgetSettingsSchema = z.object({
  enabled: z.boolean(),
  allowedDomains: z.array(domainSchema).max(50),
  mode: z.enum(["INLINE", "MODAL"]),
  theme: z.enum(["LIGHT", "DARK", "AUTO"]),
  primaryColor: colorSchema,
  secondaryColor: colorSchema,
  accentColor: colorSchema,
  borderRadius: z.number().int().min(0).max(40),
  fontFamily: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} ,_-]+$/u, "Font non valido."),
  buttonLabel: z.string().trim().min(1).max(80),
  heading: z.string().trim().min(1).max(120).refine((value) => !/[<>&]/.test(value), "Titolo non valido."),
  description: z.string().trim().max(500).nullable(),
  privacyUrl: z.string().trim().url().max(500).nullable().refine((value) => value === null || ["http:", "https:"].includes(new URL(value).protocol), "URL privacy non valido."),
  successMessage: z.string().trim().min(1).max(500),
  requirePhone: z.boolean(),
  requireEmail: z.boolean(),
  showNotes: z.boolean(),
  locale: z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).max(10),
});

const reservationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  startTime: z.coerce.date(),
  partySize: z.coerce.number().int().min(1).max(50),
  guestName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(254).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  privacyConsent: z.literal(true),
});

type RateEntry = { count: number; resetAt: number };

export class BookingWidgetRateLimiter {
  private readonly entries = new Map<string, RateEntry>();

  constructor(private readonly limit = 5, private readonly windowMs = 10 * 60_000) {}

  consume(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    if (entry.count >= this.limit) throw new BookingWidgetError("Troppe richieste. Riprova più tardi.", 429);
    entry.count += 1;
  }
}

const reservationLimiter = new BookingWidgetRateLimiter();

export function generateWidgetPublicKey() {
  return `nw_${randomBytes(32).toString("base64url")}`;
}

function normalizeOrigin(origin: string) {
  try { return new URL(origin).hostname.toLowerCase(); } catch { return null; }
}

export function isWidgetDomainAllowed(allowedDomains: readonly string[], origin: string | null) {
  if (!allowedDomains.length || !origin) return true;
  const hostname = normalizeOrigin(origin);
  return Boolean(hostname && allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)));
}

async function resolveWidget(publicKey: string, requireEnabled = true) {
  const parsed = keySchema.safeParse(publicKey);
  if (!parsed.success) throw new BookingWidgetError("Widget non disponibile.", 404);
  const widget = await prisma.restaurantBookingWidget.findUnique({
    where: { publicKey: parsed.data },
    include: {
      location: { select: { id: true, companyId: true, name: true, city: true, timezone: true, active: true, deletedAt: true, restaurantBookingSettings: { select: { enabled: true } } } },
    },
  });
  if (!widget || (requireEnabled && !widget.enabled) || !widget.location.active || widget.location.deletedAt || !widget.location.restaurantBookingSettings?.enabled) {
    throw new BookingWidgetError("Widget non disponibile.", 404);
  }
  return widget;
}

export async function getWidgetPublicConfig(publicKey: string, origin: string | null = null) {
  const widget = await resolveWidget(publicKey);
  if (!isWidgetDomainAllowed(widget.allowedDomains, origin)) throw new BookingWidgetError("Dominio non autorizzato.", 403);
  return {
    publicKey: widget.publicKey,
    mode: widget.mode,
    theme: widget.theme,
    primaryColor: widget.primaryColor,
    secondaryColor: widget.secondaryColor,
    accentColor: widget.accentColor,
    borderRadius: widget.borderRadius,
    fontFamily: widget.fontFamily,
    buttonLabel: widget.buttonLabel,
    heading: widget.heading,
    description: widget.description,
    privacyUrl: widget.privacyUrl,
    successMessage: widget.successMessage,
    requirePhone: widget.requirePhone,
    requireEmail: widget.requireEmail,
    showNotes: widget.showNotes,
    locale: widget.locale,
    location: { name: widget.location.name, city: widget.location.city, timezone: widget.location.timezone },
  };
}

export async function getWidgetAvailability(publicKey: string, input: { date: Date; partySize: number }, origin: string | null = null) {
  const widget = await resolveWidget(publicKey);
  if (!isWidgetDomainAllowed(widget.allowedDomains, origin)) throw new BookingWidgetError("Dominio non autorizzato.", 403);
  if (Number.isNaN(input.date.getTime()) || !Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 50) throw new BookingWidgetError("Data o persone non valide.");
  return getAvailableSlots(widget.companyId, widget.locationId, input);
}

export async function submitWidgetReservation(publicKey: string, rateKey: string, input: unknown, origin: string | null = null, limiter = reservationLimiter) {
  const widget = await resolveWidget(publicKey);
  if (!isWidgetDomainAllowed(widget.allowedDomains, origin)) throw new BookingWidgetError("Dominio non autorizzato.", 403);
  const parsed = reservationSchema.safeParse(input);
  if (!parsed.success) throw new BookingWidgetError(parsed.error.issues[0]?.message ?? "Dati non validi.");
  if (widget.requirePhone && parsed.data.phone.length < 6) throw new BookingWidgetError("Il telefono è obbligatorio.");
  if (widget.requireEmail && !z.string().email().safeParse(parsed.data.email).success) throw new BookingWidgetError("L’email è obbligatoria.");
  limiter.consume(`${widget.id}:${rateKey}`);
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { companyId_commandType_idempotencyKey: { companyId: widget.companyId, commandType: "RestaurantBookingCreate", idempotencyKey: parsed.data.idempotencyKey } },
    select: { status: true, result: true },
  });
  const replay = z.object({ code: z.string() }).safeParse(existing?.status === "SUCCEEDED" ? existing.result : null);
  const result = replay.success ? replay.data : await createReservation(widget.companyId, null, parsed.data.idempotencyKey, {
    locationId: widget.locationId,
    guestName: parsed.data.guestName,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    notes: widget.showNotes ? parsed.data.notes || null : null,
    partySize: parsed.data.partySize,
    startTime: parsed.data.startTime,
    source: "WEBSITE",
  });
  console.info(JSON.stringify({ scope: "booking-widget", event: replay.success ? "reservation-replayed" : "reservation-created", outcome: "SUCCEEDED" }));
  return { code: result.code, startTime: parsed.data.startTime, partySize: parsed.data.partySize, locationName: widget.location.name, successMessage: widget.successMessage };
}

export async function getWidgetAdminConfig(companyId: string, locationId: string) {
  return prisma.restaurantBookingWidget.findFirst({ where: { companyId, locationId } });
}

export async function saveWidgetAdminConfig(companyId: string, locationId: string, input: unknown) {
  const parsed = widgetSettingsSchema.safeParse(input);
  if (!parsed.success) throw new BookingWidgetError(parsed.error.issues[0]?.message ?? "Configurazione non valida.");
  const location = await prisma.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } });
  if (!location) throw new BookingWidgetError("Sede corrente non valida.", 404);
  return prisma.restaurantBookingWidget.upsert({
    where: { companyId_locationId: { companyId, locationId } },
    update: parsed.data,
    create: { companyId, locationId, publicKey: generateWidgetPublicKey(), ...parsed.data },
  });
}

export async function regenerateWidgetPublicKey(companyId: string, locationId: string) {
  const result = await prisma.restaurantBookingWidget.updateMany({ where: { companyId, locationId }, data: { publicKey: generateWidgetPublicKey() } });
  if (!result.count) throw new BookingWidgetError("Configura prima il widget.", 404);
}
