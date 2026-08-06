"use server";

import { cancelPublicBooking } from "@/lib/public-booking";
import { redirect } from "next/navigation";

export async function cancelPublicBookingAction(locationSlug: string, token: string) {
  let result: { code: string };
  try {
    result = await cancelPublicBooking(locationSlug, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancellazione non riuscita.";
    redirect(`/book/${locationSlug}/cancel/${token}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/book/${locationSlug}/cancel/${token}?cancelled=${encodeURIComponent(result.code)}`);
}
