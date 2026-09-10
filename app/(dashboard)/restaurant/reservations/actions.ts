"use server";

import type { RestaurantReservationStatus } from "@/generated/prisma/client";
import { cancelBookingWithNotifications } from "@/lib/booking-email";
import { requireCurrentLocation } from "@/lib/location-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { assignTable, assignTables, transitionReservation, unassignTable, updateReservation } from "@/lib/restaurant-booking";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function positiveInteger(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value) || value < 1) throw new Error(`${key === "partySize" ? "Numero persone" : "Durata"} non valido.`);
  return value;
}

async function staffContext() {
  const [restaurant, location] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_RESERVATIONS, "operate"),
    requireCurrentLocation(),
  ]);
  if (restaurant.companyId !== location.companyId) redirect("/dashboard");
  return { ...restaurant, locationId: location.id };
}

function failurePath(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Operazione prenotazione non riuscita.";
  return `/restaurant/reservations/${id}?error=${encodeURIComponent(message)}`;
}

function complete(id: string, message: string) {
  revalidatePath("/restaurant/reservations");
  revalidatePath(`/restaurant/reservations/${id}`);
  redirect(`/restaurant/reservations/${id}?success=${encodeURIComponent(message)}`);
}

export async function transitionBookingAction(formData: FormData) {
  const context = await staffContext();
  const id = text(formData, "id");
  const status = text(formData, "status") as RestaurantReservationStatus;
  try {
    if (status === "CANCELLED") await cancelBookingWithNotifications(context.companyId, context.locationId, id, context.userId);
    else await transitionReservation(context.companyId, context.locationId, id, status, context.userId);
  } catch (error) {
    redirect(failurePath(id, error));
  }
  complete(id, "Stato prenotazione aggiornato.");
}

export async function assignBookingTableAction(formData: FormData) {
  const context = await staffContext();
  const id = text(formData, "id");
  try {
    await assignTable(context.companyId, context.locationId, id, text(formData, "tableId"), context.userId);
  } catch (error) {
    redirect(failurePath(id, error));
  }
  complete(id, "Tavolo assegnato.");
}

export async function unassignBookingTableAction(formData: FormData) {
  const context = await staffContext();
  const id = text(formData, "id");
  try {
    await unassignTable(context.companyId, context.locationId, id, context.userId);
  } catch (error) {
    redirect(failurePath(id, error));
  }
  complete(id, "Assegnazione tavolo rimossa.");
}

export async function updateBookingAction(formData: FormData) {
  const context = await staffContext();
  const id = text(formData, "id");
  try {
    const startTime = new Date(text(formData, "startTime"));
    if (Number.isNaN(startTime.getTime())) throw new Error("Data e ora non valide.");
    await updateReservation(context.companyId, context.locationId, id, {
      guestName: text(formData, "guestName"),
      phone: text(formData, "phone") || null,
      email: text(formData, "email") || null,
      startTime,
      durationMinutes: positiveInteger(formData, "durationMinutes"),
      partySize: positiveInteger(formData, "partySize"),
      notes: text(formData, "notes") || null,
      internalNotes: text(formData, "internalNotes") || null,
    }, context.userId);
  } catch (error) {
    redirect(failurePath(id, error));
  }
  complete(id, "Prenotazione aggiornata.");
}

export async function assignCombinedTablesAction(formData: FormData) {
  const context = await requireRestaurantContext(
    MODULE_CODES.RESTAURANT_FLOOR,
    "operate",
  );
  const reservationId = text(formData, "reservationId");
  try {
    await assignTables(
      context.companyId,
      context.locationId,
      reservationId,
      formData.getAll("tableIds").map(String),
      context.userId,
    );
  } catch (error) {
    redirect(
      `/restaurant/reservations/${reservationId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Assegnazione non riuscita.")}`,
    );
  }
  revalidatePath(`/restaurant/reservations/${reservationId}`);
  redirect(
    `/restaurant/reservations/${reservationId}?success=${encodeURIComponent("Tavoli assegnati")}`,
  );
}
