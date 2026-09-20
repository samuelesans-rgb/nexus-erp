import { timingSafeEqual } from "node:crypto";
import { runKitchenChannelAlertSweep } from "@/lib/kitchen-channel-alert";

export const dynamic = "force-dynamic";

/**
 * Innesco del sorvegliante del canale cucina, chiamato da un timer systemd
 * sull'host. Non e' un endpoint di sessione: l'autenticazione e' un segreto
 * condiviso, e senza segreto configurato la rotta non esiste.
 *
 * Il verdetto sta qui e non nello script che lo chiama perche' la soglia dei
 * 120 secondi e il predicato "qualcuno e' vivo" devono avere una sola
 * definizione, quella di getKitchenChannelHealth.
 */
function authorized(request: Request) {
  const secret = process.env.INTERNAL_MONITOR_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented),
    b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const results = await runKitchenChannelAlertSweep();
    return Response.json(
      { checked: results.length, results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "kitchen-channel-alert",
        outcome: "CHECK_FAILED",
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return Response.json(
      { error: "check-failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
