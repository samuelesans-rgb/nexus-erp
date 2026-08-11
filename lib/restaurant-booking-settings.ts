import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

export class RestaurantBookingSettingsError extends Error {
  constructor(message: string) { super(message); this.name = "RestaurantBookingSettingsError"; }
}

const administrators = new Set(["SUPER_ADMIN", "ADMIN"]);
export function canManageBookingSettings(roles: readonly string[]) { return roles.some((role) => administrators.has(role)); }

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Orario non valido: usa HH:mm.");
const intervalSchema = z.tuple([timeSchema, timeSchema]);
const daySchema = z.enum(["0", "1", "2", "3", "4", "5", "6"]);

const settingsSchema = z.object({
  enabled: z.boolean(),
  openingHours: z.partialRecord(daySchema, z.array(intervalSchema)),
  slotIntervalMinutes: z.number().int().min(5).max(240),
  defaultDurationMinutes: z.number().int().min(15).max(1440),
  minAdvanceMinutes: z.number().int().min(0).max(525600),
  maxAdvanceDays: z.number().int().min(1).max(730),
  maxCoversPerSlot: z.number().int().min(0).max(10000),
  internalNotificationEmail: z.union([z.string().trim().email().max(254), z.literal(""), z.null()]).transform((value) => value || null),
  confirmationMessage: z.union([z.string().trim().max(1000), z.null()]).transform((value) => value || null).refine((value) => !value || !/[<>]/.test(value), "Il messaggio di conferma non può contenere HTML."),
});

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function normalizeOpeningHours(value: z.output<typeof settingsSchema>["openingHours"]) {
  return Object.fromEntries(Object.entries(value).map(([day, intervals]) => {
    const sorted = [...intervals].sort(([left], [right]) => left.localeCompare(right));
    for (let index = 0; index < sorted.length; index += 1) {
      const [start, end] = sorted[index];
      if (minutes(start) >= minutes(end)) throw new RestaurantBookingSettingsError(`Il giorno ${day} contiene un intervallo con inizio non precedente alla fine.`);
      if (index > 0 && minutes(sorted[index - 1][1]) > minutes(start)) throw new RestaurantBookingSettingsError(`Il giorno ${day} contiene intervalli sovrapposti.`);
    }
    return [day, sorted];
  }));
}

export function parseRestaurantBookingSettings(input: unknown) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new RestaurantBookingSettingsError(parsed.error.issues[0]?.message ?? "Impostazioni prenotazioni non valide.");
  return { ...parsed.data, openingHours: normalizeOpeningHours(parsed.data.openingHours) };
}

export async function getRestaurantBookingSettings(companyId: string, locationId: string) {
  return prisma.restaurantBookingSettings.findFirst({ where: { companyId, locationId } });
}

export async function saveRestaurantBookingSettings(companyId: string, locationId: string, input: unknown) {
  const data = parseRestaurantBookingSettings(input);
  return prisma.$transaction(async (tx) => {
    const location = await tx.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } });
    if (!location) throw new RestaurantBookingSettingsError("La sede corrente non è attiva o non appartiene alla Company.");
    return tx.restaurantBookingSettings.upsert({
      where: { companyId_locationId: { companyId, locationId } },
      update: data,
      create: { companyId, locationId, ...data },
    });
  });
}
