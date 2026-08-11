"use server";

import { requireCurrentLocation } from "@/lib/location-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { canManageBookingSettings, RestaurantBookingSettingsError, saveRestaurantBookingSettings } from "@/lib/restaurant-booking-settings";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const route = "/restaurant/settings/booking";
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function openingHours(formData: FormData) {
  return Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
    if (formData.get(`day-${day}-enabled`) !== "on") return [String(day), []];
    const intervals = text(formData, `day-${day}-intervals`).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const match = line.match(/^([^\s-]+)\s*-\s*([^\s-]+)$/);
      return match ? [match[1], match[2]] : [line, ""];
    });
    return [String(day), intervals];
  }));
}

export async function saveBookingSettingsAction(formData: FormData) {
  const [context, location] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_RESERVATIONS, "manage"),
    requireCurrentLocation(),
  ]);
  if (!canManageBookingSettings(context.roles) || context.companyId !== location.companyId) redirect("/dashboard");
  try {
    await saveRestaurantBookingSettings(context.companyId, location.id, {
      enabled: formData.get("enabled") === "on",
      openingHours: openingHours(formData),
      slotIntervalMinutes: Number(text(formData, "slotIntervalMinutes")),
      defaultDurationMinutes: Number(text(formData, "defaultDurationMinutes")),
      minAdvanceMinutes: Number(text(formData, "minAdvanceMinutes")),
      maxAdvanceDays: Number(text(formData, "maxAdvanceDays")),
      maxCoversPerSlot: Number(text(formData, "maxCoversPerSlot")),
      internalNotificationEmail: text(formData, "internalNotificationEmail"),
      confirmationMessage: text(formData, "confirmationMessage"),
    });
  } catch (error) {
    const message = error instanceof RestaurantBookingSettingsError || error instanceof Error ? error.message : "Impostazioni non salvate.";
    redirect(`${route}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(route);
  redirect(`${route}?success=Impostazioni salvate`);
}
