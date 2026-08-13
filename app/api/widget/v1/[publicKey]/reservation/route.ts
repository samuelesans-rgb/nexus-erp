import { widgetError, widgetJson, widgetOptions, widgetRateKey, widgetRequestOrigin } from "@/lib/booking-widget-http";
import { BookingWidgetError, submitWidgetReservation } from "@/lib/restaurant-booking-widget";

export async function POST(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const origin = widgetRequestOrigin(request);
  try {
    const rawBody = await request.text();
    if (rawBody.length > 16_384) throw new BookingWidgetError("Richiesta troppo grande.", 413);
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { throw new BookingWidgetError("JSON non valido."); }
    const result = await submitWidgetReservation((await context.params).publicKey, widgetRateKey(request), body, origin);
    return widgetJson({ ...result, startTime: result.startTime.toISOString() }, 201, origin);
  } catch (error) { return widgetError(error, origin); }
}

export async function OPTIONS(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  return widgetOptions(request, (await context.params).publicKey);
}
