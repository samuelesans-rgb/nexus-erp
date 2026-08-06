import { getWidgetPublicConfig } from "@/lib/restaurant-booking-widget";
import { widgetError, widgetJson, widgetOptions, widgetRequestOrigin } from "@/lib/booking-widget-http";

export async function GET(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const origin = widgetRequestOrigin(request);
  try { return widgetJson(await getWidgetPublicConfig((await context.params).publicKey, origin), 200, origin); }
  catch (error) { return widgetError(error, origin); }
}

export const OPTIONS = widgetOptions;
