import "server-only";

import { prisma } from "@/lib/prisma";

export class RestaurantAvailabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantAvailabilityError";
  }
}

export type BookingSettings = {
  enabled: boolean;
  slotIntervalMinutes: number;
  defaultDurationMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  maxCoversPerSlot: number;
  openingHours: Record<string, Array<[string, string]>>;
};

const defaults: BookingSettings = {
  enabled: true,
  slotIntervalMinutes: 30,
  defaultDurationMinutes: 120,
  minAdvanceMinutes: 60,
  maxAdvanceDays: 90,
  maxCoversPerSlot: 0,
  openingHours: {},
};

function intervals(value: unknown): BookingSettings["openingHours"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([day, rows]) =>
      Array.isArray(rows)
        ? [[day, rows.filter((row): row is [string, string] => Array.isArray(row) && row.length === 2 && row.every((entry) => typeof entry === "string"))]]
        : [],
    ),
  );
}

export async function getBookingSettings(companyId: string, locationId: string): Promise<BookingSettings> {
  const location = await prisma.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } });
  if (!location) throw new RestaurantAvailabilityError("Sede non disponibile.");
  const settings = await prisma.restaurantBookingSettings.findFirst({ where: { companyId, locationId }, select: { enabled: true, slotIntervalMinutes: true, defaultDurationMinutes: true, minAdvanceMinutes: true, maxAdvanceDays: true, maxCoversPerSlot: true, openingHours: true } });
  return settings ? { ...settings, openingHours: intervals(settings.openingHours) } : defaults;
}

function atTime(day: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const value = new Date(day);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return otherStart < end && otherEnd > start;
}

export async function checkAvailability(companyId: string, locationId: string, input: { startTime: Date; partySize: number; durationMinutes?: number; tableId?: string | null; excludeReservationId?: string }) {
  if (!Number.isInteger(input.partySize) || input.partySize < 1) throw new RestaurantAvailabilityError("Numero coperti non valido.");
  const settings = await getBookingSettings(companyId, locationId);
  if (!settings.enabled) throw new RestaurantAvailabilityError("Le prenotazioni online non sono disponibili per questa sede.");
  const durationMinutes = input.durationMinutes ?? settings.defaultDurationMinutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15) throw new RestaurantAvailabilityError("Durata prenotazione non valida.");
  const startTime = new Date(input.startTime);
  if (Number.isNaN(startTime.getTime())) throw new RestaurantAvailabilityError("Data prenotazione non valida.");
  const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
  const now = new Date();
  if (startTime.getTime() < now.getTime() + settings.minAdvanceMinutes * 60_000) throw new RestaurantAvailabilityError("L'anticipo minimo non è rispettato.");
  if (startTime.getTime() > now.getTime() + settings.maxAdvanceDays * 86_400_000) throw new RestaurantAvailabilityError("La data è oltre l'anticipo massimo consentito.");
  const dayIntervals = settings.openingHours[String(startTime.getDay())] ?? [];
  if (dayIntervals.length && !dayIntervals.some(([from, to]) => startTime >= atTime(startTime, from) && endTime <= atTime(startTime, to))) throw new RestaurantAvailabilityError("L'orario selezionato è fuori apertura.");
  const activeStatuses = ["PENDING", "CONFIRMED", "SEATED"] as const;
  const reservations = await prisma.restaurantReservation.findMany({
    where: { companyId, locationId, deletedAt: null, id: input.excludeReservationId ? { not: input.excludeReservationId } : undefined, status: { in: [...activeStatuses] }, startTime: { lt: endTime }, endTime: { gt: startTime } },
    include: { tables: { select: { tableId: true } } },
  });
  if (settings.maxCoversPerSlot > 0 && reservations.reduce((total, reservation) => total + reservation.partySize, 0) + input.partySize > settings.maxCoversPerSlot) throw new RestaurantAvailabilityError("Capienza massima della fascia raggiunta.");
  const busyTableIds = new Set(reservations.filter((reservation) => overlaps(startTime, endTime, reservation.startTime, reservation.endTime ?? new Date(reservation.startTime.getTime() + settings.defaultDurationMinutes * 60_000))).flatMap((reservation) => reservation.tables.map((table) => table.tableId)));
  const tables = await prisma.restaurantTable.findMany({ where: { companyId, locationId, active: true, deletedAt: null, status: { notIn: ["OUT_OF_SERVICE", "OCCUPIED"] }, ...(input.tableId ? { id: input.tableId } : {}) }, select: { id: true, seats: true, maxSeats: true } });
  const table = tables.find((candidate) => !busyTableIds.has(candidate.id) && (candidate.maxSeats ?? candidate.seats) >= input.partySize);
  return { available: Boolean(table), tableId: table?.id ?? null, startTime, endTime, durationMinutes };
}

export async function getAvailableSlots(companyId: string, locationId: string, input: { date: Date; partySize: number }) {
  const settings = await getBookingSettings(companyId, locationId);
  const date = new Date(input.date); date.setHours(0, 0, 0, 0);
  const windows = settings.openingHours[String(date.getDay())] ?? [["12:00", "23:00"]];
  const slots: Date[] = [];
  for (const [from, to] of windows) {
    for (let cursor = atTime(date, from), limit = atTime(date, to); cursor.getTime() + settings.defaultDurationMinutes * 60_000 <= limit.getTime(); cursor = new Date(cursor.getTime() + settings.slotIntervalMinutes * 60_000)) {
      try { if ((await checkAvailability(companyId, locationId, { startTime: cursor, partySize: input.partySize })).available) slots.push(cursor); } catch { /* unavailable slot */ }
    }
  }
  return slots;
}
