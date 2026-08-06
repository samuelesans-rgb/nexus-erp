import "server-only";

import { BookingWidgetError } from "@/lib/restaurant-booking-widget";

export function widgetRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return null;
  return origin;
}

export function widgetRateKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}

export function widgetJson(data: unknown, status = 200, origin?: string | null) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return Response.json(data, { status, headers });
}

export function widgetError(error: unknown, origin?: string | null) {
  const status = error instanceof BookingWidgetError ? error.status : 500;
  const message = error instanceof BookingWidgetError ? error.message : "Richiesta widget non riuscita.";
  console.warn(JSON.stringify({ scope: "booking-widget", event: "request-failed", status, error: error instanceof Error ? error.name : "UnknownError" }));
  return widgetJson({ error: message }, status, origin);
}

export function widgetOptions(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  } });
}
