"use server";

import { requireCurrentLocation } from "@/lib/location-access";
import { requireRestaurant } from "@/lib/restaurant-access";
import { BookingWidgetError, regenerateWidgetPublicKey, saveWidgetAdminConfig } from "@/lib/restaurant-booking-widget";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const optional = (formData: FormData, key: string) => text(formData, key) || null;

function failure(error: unknown) {
  return encodeURIComponent(error instanceof BookingWidgetError || error instanceof Error ? error.message : "Configurazione non salvata.");
}

export async function saveBookingWidgetAction(formData: FormData) {
  const [context, location] = await Promise.all([requireRestaurant("manage"), requireCurrentLocation()]);
  try {
    await saveWidgetAdminConfig(context.companyId, location.id, {
      enabled: formData.get("enabled") === "on",
      allowedDomains: text(formData, "allowedDomains").split(/[\s,]+/).filter(Boolean),
      mode: text(formData, "mode"), theme: text(formData, "theme"),
      logoUrl: optional(formData, "logoUrl"),
      primaryColor: text(formData, "primaryColor"), secondaryColor: text(formData, "secondaryColor"), accentColor: text(formData, "accentColor"),
      backgroundColor: text(formData, "backgroundColor"), textColor: text(formData, "textColor"),
      borderRadius: Number(text(formData, "borderRadius")), fontFamily: text(formData, "fontFamily"), buttonLabel: text(formData, "buttonLabel"),
      heading: text(formData, "heading"), description: optional(formData, "description"), privacyUrl: optional(formData, "privacyUrl"), successMessage: text(formData, "successMessage"),
      requirePhone: formData.get("requirePhone") === "on", requireEmail: formData.get("requireEmail") === "on", showNotes: formData.get("showNotes") === "on", locale: text(formData, "locale"),
    });
  } catch (error) { redirect(`/restaurant/widget?error=${failure(error)}`); }
  revalidatePath("/restaurant/widget");
  redirect("/restaurant/widget?success=Widget salvato");
}

export async function regenerateBookingWidgetKeyAction() {
  const [context, location] = await Promise.all([requireRestaurant("manage"), requireCurrentLocation()]);
  try { await regenerateWidgetPublicKey(context.companyId, location.id); }
  catch (error) { redirect(`/restaurant/widget?error=${failure(error)}`); }
  revalidatePath("/restaurant/widget");
  redirect("/restaurant/widget?success=Chiave rigenerata");
}
