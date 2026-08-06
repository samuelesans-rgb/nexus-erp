"use server";

import { PublicBookingError, submitPublicBooking } from "@/lib/public-booking";
import { headers } from "next/headers";

export type PublicBookingState = {
  error?: string;
  confirmation?: {
    code: string;
    startTime: string;
    partySize: number;
    locationName: string;
    confirmationMessage: string;
  };
};

export async function submitPublicBookingAction(locationSlug: string, _state: PublicBookingState, formData: FormData): Promise<PublicBookingState> {
  const requestHeaders = await headers();
  const rateKey = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "anonymous";
  try {
    const result = await submitPublicBooking(locationSlug, rateKey, {
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      partySize: String(formData.get("partySize") ?? ""),
      guestName: String(formData.get("guestName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      privacyConsent: formData.get("privacyConsent") === "on",
    });
    return { confirmation: { ...result, startTime: result.startTime.toISOString() } };
  } catch (error) {
    return { error: error instanceof PublicBookingError || error instanceof Error ? error.message : "Prenotazione non riuscita." };
  }
}
