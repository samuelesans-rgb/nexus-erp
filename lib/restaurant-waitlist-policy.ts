/**
 * Regole della lista d'attesa: quando un'offerta ha senso, quanto dura, e cosa
 * si dice a chi la riceve.
 *
 * Modulo puro, senza orologio interno né accesso al database: l'istante arriva
 * da fuori, così le regole si provano con numeri espliciti invece che
 * aspettando.
 */

import { formatDowntime } from "@/lib/restaurant-floor-connector-copy";

/** Quota del tempo rimanente concessa per rispondere. */
export const OFFER_FRACTION = 0.25;
export const OFFER_MIN_MINUTES = 15;
export const OFFER_MAX_MINUTES = 120;

/**
 * Sotto questa soglia non si manda alcuna offerta.
 *
 * Un giro email–lettura–risposta in mezz'ora non si chiude, e il sistema
 * fingerebbe un processo che non può concludersi. Si avvisa invece chi è in
 * servizio, perché possa telefonare: è quello che un ristorante fa davvero.
 */
export const OFFER_MIN_NOTICE_MINUTES = 45;

export type OfferDecision =
  | { kind: "OFFER"; expiresAt: Date; minutes: number }
  | { kind: "CALL_STAFF"; minutesToStart: number }
  | { kind: "TOO_LATE" };

/**
 * Cosa fare quando si libera un posto per una prenotazione in lista.
 *
 * `TOO_LATE` copre l'orario già passato: non c'è nulla da offrire e nessuno da
 * far chiamare.
 */
export function decideOffer(startTime: Date, now: Date): OfferDecision {
  const minutesToStart = Math.floor((startTime.getTime() - now.getTime()) / 60000);
  if (minutesToStart <= 0) return { kind: "TOO_LATE" };
  if (minutesToStart < OFFER_MIN_NOTICE_MINUTES) return { kind: "CALL_STAFF", minutesToStart };
  const minutes = Math.min(
    OFFER_MAX_MINUTES,
    Math.max(OFFER_MIN_MINUTES, Math.floor(minutesToStart * OFFER_FRACTION)),
  );
  return { kind: "OFFER", expiresAt: new Date(now.getTime() + minutes * 60000), minutes };
}

/**
 * La prenotazione in lista è compatibile con la fascia che si è liberata?
 *
 * Il cliente indica un orario desiderato e una tolleranza; l'offerta vale se
 * l'orario liberato ci ricade dentro.
 */
export function fitsWaitlistWindow(
  entry: { waitlistFromTime: Date | null; waitlistToTime: Date | null; startTime: Date },
  freedStart: Date,
) {
  const from = entry.waitlistFromTime ?? entry.startTime;
  const to = entry.waitlistToTime ?? entry.startTime;
  return freedStart >= from && freedStart <= to;
}

export function buildOfferMessage({
  guestName,
  locationName,
  startTime,
  minutes,
  timeLabel,
}: {
  guestName: string;
  locationName: string;
  startTime: Date;
  minutes: number;
  /** Ora già formattata nel fuso del locale, perché qui non si converte. */
  timeLabel: string;
}) {
  return {
    subject: `${locationName}: si è liberato un tavolo`,
    lines: [
      `Ciao ${guestName},`,
      `si è liberato un tavolo per ${timeLabel}.`,
      `Il posto è tenuto per te per ${formatDowntime(minutes)}: dopo viene offerto a chi è in lista dopo di te.`,
    ],
    startTime,
  };
}

/** Testo dell'avviso allo staff quando manca troppo poco per un'offerta. */
export function buildStaffCallMessage({
  guestName,
  partySize,
  phone,
  timeLabel,
  minutesToStart,
}: {
  guestName: string;
  partySize: number;
  phone: string | null;
  timeLabel: string;
  minutesToStart: number;
}) {
  return {
    title: "TAVOLO LIBERO: CHIAMA IL CLIENTE",
    lines: [
      `${guestName} · ${partySize} coperti · ${timeLabel}`,
      phone ? `Telefono: ${phone}` : "Nessun telefono in anagrafica.",
      `Mancano ${formatDowntime(minutesToStart)}: troppo poco per un'email, serve una chiamata.`,
    ],
  };
}
