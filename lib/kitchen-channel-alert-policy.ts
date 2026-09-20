/**
 * Quando avvisare che il canale cucina e' caduto, e quando tacere.
 *
 * Modulo puro: niente I/O, niente orologio interno. L'ora romana e lo stato
 * precedente arrivano da fuori, cosi' le regole si possono provare senza
 * aspettare la mezzanotte.
 */

import { formatDowntime } from "@/lib/restaurant-floor-connector-copy";

/**
 * Quanto deve mancare il battito prima di disturbare qualcuno.
 *
 * I 120 secondi del banner sono giusti per chi sta in sala ma troppo nervosi
 * per una notifica: runit rialza il processo in pochi secondi e un riavvio del
 * telefono si completa in circa due minuti. Dieci minuti vogliono dire "non
 * sta tornando da solo". Il caso in servizio e' gia' coperto dal banner, quindi
 * qui non si perde reattivita' dove conta.
 */
export const ALERT_AFTER_MINUTES = 10;

/**
 * Finestra in cui ha senso far squillare un telefono: 07:00-01:00.
 * Un guasto notturno scoperto alle 7 e' comunque meglio che scoperto alle 19,
 * e nessuno deve alzarsi alle 4 per un telefono che si e' riavviato da solo.
 */
export const ALERT_WINDOW_START_HOUR = 7;
export const ALERT_WINDOW_END_HOUR = 1;

export type ChannelAlertState = "DOWN" | "UP" | null;

export type AlertDecisionInput = {
  stale: boolean;
  /** Da quanti minuti nessuno batte. Null: non ha mai battuto. */
  staleForMinutes: number | null;
  /** Ultima transizione notificata, null se non e' mai stato notificato nulla. */
  lastNotified: ChannelAlertState;
  /** Ora locale italiana, 0-23. */
  hourOfDay: number;
};

export type AlertDecision = {
  action: "NONE" | "NOTIFY_DOWN" | "NOTIFY_UP";
  /** Perche', per finire nel log e nell'evento: le decisioni di tacere vanno tracciate. */
  reason:
    | "healthy"
    | "below-threshold"
    | "already-notified"
    | "outside-window"
    | "down"
    | "recovered";
};

export function isInsideAlertWindow(
  hourOfDay: number,
  start = ALERT_WINDOW_START_HOUR,
  end = ALERT_WINDOW_END_HOUR,
) {
  return start < end
    ? hourOfDay >= start && hourOfDay < end
    : hourOfDay >= start || hourOfDay < end;
}

export function decideChannelAlert({
  stale,
  staleForMinutes,
  lastNotified,
  hourOfDay,
}: AlertDecisionInput): AlertDecision {
  const inside = isInsideAlertWindow(hourOfDay);
  if (stale) {
    // Nessun battito mai ricevuto: e' un'assenza infinita, non zero.
    const minutes = staleForMinutes ?? Number.POSITIVE_INFINITY;
    if (minutes < ALERT_AFTER_MINUTES) return { action: "NONE", reason: "below-threshold" };
    if (lastNotified === "DOWN") return { action: "NONE", reason: "already-notified" };
    // Fuori finestra non si tace per sempre: lo stato resta non-DOWN, quindi
    // se alle 07:00 e' ancora giu' l'avviso parte allora.
    if (!inside) return { action: "NONE", reason: "outside-window" };
    return { action: "NOTIFY_DOWN", reason: "down" };
  }
  // Il ripristino si annuncia solo a chi era stato avvisato della caduta: un
  // guasto notturno rientrato da solo, mai notificato, resta senza messaggi.
  if (lastNotified !== "DOWN") return { action: "NONE", reason: "healthy" };
  if (!inside) return { action: "NONE", reason: "outside-window" };
  return { action: "NOTIFY_UP", reason: "recovered" };
}

export function buildChannelDownMessage({
  locationName,
  staleForMinutes,
  maxAgeMinutes,
}: {
  locationName: string;
  staleForMinutes: number | null;
  maxAgeMinutes: number;
}) {
  return {
    title: `⚠️ ${locationName} — cucina non collegata`,
    body: [
      staleForMinutes === null
        ? "Il connector non ha mai dato segni di vita."
        : `Il connector non risponde da ${formatDowntime(staleForMinutes)}.`,
      "Le comande inviate dalla Sala restano in coda e non arrivano al POS.",
      `Oltre ${formatDowntime(maxAgeMinutes)} scadono e vanno rimandate a mano.`,
    ].join("\n"),
  };
}

export function buildChannelUpMessage({
  locationName,
  outageMinutes,
}: {
  locationName: string;
  outageMinutes: number | null;
}) {
  return {
    title: `✅ ${locationName} — cucina di nuovo collegata`,
    body: [
      "Il connector risponde di nuovo.",
      outageMinutes === null
        ? "Durata del disservizio non determinabile."
        : `Il disservizio e' durato circa ${formatDowntime(outageMinutes)}.`,
      "Le comande rimaste in coda escono da sole; controlla che non ce ne siano di scadute.",
    ].join("\n"),
  };
}
