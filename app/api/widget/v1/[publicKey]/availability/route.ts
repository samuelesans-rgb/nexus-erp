import { getWidgetAvailability } from "@/lib/restaurant-booking-widget";
import { widgetError, widgetJson, widgetOptions, widgetRequestOrigin } from "@/lib/booking-widget-http";

export async function GET(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const origin = widgetRequestOrigin(request);
  try {
    const query = new URL(request.url).searchParams;
    const slots = await getWidgetAvailability((await context.params).publicKey, { date: new Date(query.get("date") ?? ""), partySize: Number(query.get("partySize")) }, origin);
    return widgetJson({ slots: slots.map((slot) => slot.toISOString()) }, 200, origin);
  } catch (error) { return widgetError(error, origin); }
}

export const OPTIONS = widgetOptions;
