import "server-only";

import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/restaurant-availability";
import { localTimeLabel } from "@/lib/restaurant-waitlist";
import { NO_SHOW_SNOOZE_MINUTES } from "@/lib/restaurant-waitlist-policy";

export class RestaurantNoShowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantNoShowError";
  }
}

/**
 * Prenotazioni confermate il cui orario è passato oltre la soglia, e che
 * nessuno ha ancora chiuso in un senso o nell'altro.
 *
 * Il sistema **segnala e non decide**: sa che nessuno ha toccato quella
 * prenotazione, non che il cliente non si è presentato. Potrebbe essere
 * arrivato senza che il cameriere abbia aggiornato nulla — con Sala e
 * prenotazioni su schermi diversi è anzi probabile. Marcare NO_SHOW d'ufficio
 * sarebbe affermare un fatto che nessuno ha osservato.
 *
 * Si calcola al caricamento invece che da un processo periodico: il dato è
 * derivabile su richiesta, la Sala si aggiorna già da sola, e chi deve
 * decidere ha lo schermo davanti. Un timer aggiungerebbe uno stato da tenere
 * allineato e un secondo posto in cui le regole possono divergere.
 */
export async function pendingNoShowAlerts(companyId: string, locationId: string, now = new Date()) {
  const settings = await getBookingSettings(companyId, locationId);
  const cutoff = new Date(now.getTime() - settings.noShowThresholdMinutes * 60000);
  const rows = await prisma.restaurantReservation.findMany({
    where: {
      companyId, locationId, deletedAt: null, status: "CONFIRMED",
      startTime: { lt: cutoff },
      OR: [{ noShowSnoozedUntil: null }, { noShowSnoozedUntil: { lt: now } }],
    },
    orderBy: { startTime: "asc" },
    select: { id: true, guestName: true, partySize: true, phone: true, startTime: true, noShowSnoozedUntil: true },
  });
  return rows.map((row) => ({
    id: row.id,
    guestName: row.guestName,
    partySize: row.partySize,
    phone: row.phone,
    timeLabel: localTimeLabel(row.startTime, settings.timeZone),
    lateByMinutes: Math.max(0, Math.floor((now.getTime() - row.startTime.getTime()) / 60000)),
    deferred: row.noShowSnoozedUntil !== null,
  }));
}

/**
 * Il cliente ha telefonato: arriva tardi. Non si decide niente, si tace per un
 * quarto d'ora e poi l'avviso torna.
 */
export async function snoozeNoShowAlert(companyId: string, locationId: string, id: string, userId?: string | null, now = new Date()) {
  const updated = await prisma.restaurantReservation.updateMany({
    where: { id, companyId, locationId, status: "CONFIRMED", deletedAt: null },
    data: { noShowSnoozedUntil: new Date(now.getTime() + NO_SHOW_SNOOZE_MINUTES * 60000), updatedById: userId },
  });
  if (!updated.count) throw new RestaurantNoShowError("Prenotazione non trovata o non più confermata.");
  return { id, minutes: NO_SHOW_SNOOZE_MINUTES };
}
